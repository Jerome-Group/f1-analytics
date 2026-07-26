#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The Adapter is a boundary, and a boundary nobody checks is a convention. ADR-0003's claim that
# the data source can be changed without reaching the views rests entirely on OpenF1's field
# names stopping in server/openf1/ — so the claim is checked here rather than remembered.
#
# The test is spelling. Upstream speaks snake_case and this project speaks camelCase, so an
# upstream name is recognisable wherever it has been carried to, including into one that was
# renamed but not translated.
#
# TypeScript only, deliberately. Prose about the boundary naturally names a field on the other
# side of it — `web/design-system/tokens/teams.css` says where the team colours came from — and
# naming one is not carrying one, exactly as `CODING_STANDARDS.md` already allows for `docker`.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

repo_root="$(cd -- "$here/.." && pwd)"
adapter="server/openf1"

# Paths come out repo-relative, which is what the assertions below compare against. grep exits
# non-zero when it matches nothing, and nothing is the passing case, so the exit is left for the
# command substitution to discard rather than swallowed with a `|| true` that would also hide a
# `cd` that failed.
snake_case_in() {
  (
    cd -- "$repo_root" || return
    grep -rEn --include='*.ts' '\b[a-z][a-z0-9]*(_[a-z0-9]+)+\b' "$@"
  )
}

assert_equals "no upstream field name above the Adapter" "" \
  "$(snake_case_in domain server web | grep -v "^$adapter/")"

# Without this the assertion above passes just as happily on the day somebody deletes the Adapter
# and the names it was keeping in.
assert_contains "the Adapter still speaks upstream's language" \
  "driver_number" "$(snake_case_in "$adapter")"

# `domain/` is imported by both sides, so anything it reaches for, both sides carry. It depends on
# nothing — not on the Adapter, not on Node, not on a package.
assert_equals "domain/ imports nothing outside itself" "" \
  "$(
    cd -- "$repo_root" || exit
    grep -rEn "from '[^.]|from '\.\./" domain
  )"

# --- The mapping ---------------------------------------------------------------------------------
# The boundary is not only which words cross it but what they turn into: OpenF1's seconds into the
# model's milliseconds, its `"+1 LAP"` into whole laps down, its noughts and nulls into absence.
# Fed straight in, because the two cases a finished recording cannot show are the ones worth pinning.

mapping() {
  node "$here/lib/adapter-map.ts"
}

# One Driver's timing fields, normalised to `field=form:value`, with an absent field shown as `-`.
# `gap` and `interval` are printed in the order the Driver holds them so a transposition shows.
figures_of() {
  python3 -c '
import json, sys

number = int(sys.argv[1])
drivers = json.load(sys.stdin)
driver = next(d for d in drivers if d["number"] == number)


def separation(value):
    if value is None:
        return "-"
    (kind, amount), = value.items()
    return f"{kind}:{amount}"


print(
    "gap=" + separation(driver.get("gap")),
    "interval=" + separation(driver.get("interval")),
    "lastLap=" + str(driver.get("lastLap", "-")),
    "bestLap=" + str(driver.get("bestLap", "-")),
)
' "$1"
}

keys_of() {
  python3 -c '
import json, sys

number = int(sys.argv[1])
drivers = json.load(sys.stdin)
driver = next(d for d in drivers if d["number"] == number)
print(" ".join(sorted(driver)))
' "$1"
}

# Two cars on the same lap, a leader, and a car two laps down — the leader zero behind itself and
# the lapped car in whole laps. Gap and Interval are given values that differ so a swap would show.
mapped="$(mapping <<'JSON'
{
  "sessionKey": 9920,
  "drivers": [
    { "driver_number": 81, "name_acronym": "PIA", "team_name": "McLaren" },
    { "driver_number": 1, "name_acronym": "VER", "team_name": "Red Bull Racing" },
    { "driver_number": 27, "name_acronym": "HUL", "team_name": "Kick Sauber" }
  ],
  "position": [
    { "driver_number": 81, "date": "2025-08-31T13:29:00Z", "position": 1 },
    { "driver_number": 1, "date": "2025-08-31T13:29:00Z", "position": 2 },
    { "driver_number": 27, "date": "2025-08-31T13:29:00Z", "position": 20 }
  ],
  "intervals": [
    { "driver_number": 81, "date": "2025-08-31T13:29:00Z", "gap_to_leader": 0, "interval": 0 },
    { "driver_number": 1, "date": "2025-08-31T13:29:00Z", "gap_to_leader": 12.345, "interval": 9.927 },
    { "driver_number": 27, "date": "2025-08-31T13:29:00Z", "gap_to_leader": "+2 LAPS", "interval": "+1 LAP" }
  ],
  "laps": [
    { "driver_number": 1, "lap_number": 5, "lap_duration": 75.648 },
    { "driver_number": 1, "lap_number": 6, "lap_duration": 76.706 },
    { "driver_number": 1, "lap_number": 7, "lap_duration": null }
  ]
}
JSON
)"

# Seconds become milliseconds; Gap holds the gap and Interval the interval, not each other; the last
# lap is the most recent completed one and the best is the quickest of the Session, not the last —
# and the lap in progress (lap 7, no duration) is neither, so it moves neither figure.
assert_equals "same lap: seconds to millis, Gap and Interval each its own, best not merely last" \
  "gap=millis:12345 interval=millis:9927 lastLap=76706 bestLap=75648" \
  "$(figures_of 1 <<<"$mapped")"

assert_equals "a car a lap or more down maps to whole laps, not an enormous time" \
  "gap=laps:2 interval=laps:1 lastLap=- bestLap=-" \
  "$(figures_of 27 <<<"$mapped")"

# The leader is zero behind themselves and has no car ahead — both a nought here, both absent after.
assert_equals "the leader's Gap and Interval are absent, not zero" \
  "gap=- interval=- lastLap=- bestLap=-" \
  "$(figures_of 81 <<<"$mapped")"

assert_equals "an absent field is missing from the object, never present and holding nothing" \
  "code number position team" "$(keys_of 81 <<<"$mapped")"

# --- The lap-time trend and the lap count (#16) -----------------------------------------------
# The laps stream is per-lap and already read here (#35), so the recent window the sparkline draws and
# the count of laps run are built from it. Fed straight in: a whole-Session recording has no lap the
# feed skipped and no lap still on the road, and both are exactly what the model has to drop.

# A Driver's recent laps read as "completed=<n> recent=<numbers> keys=<the fields each lap carries>".
laps_of() {
  python3 -c '
import json, sys

number = int(sys.argv[1])
driver = next(d for d in json.load(sys.stdin) if d["number"] == number)
recent = driver.get("recentLaps", [])
print(
    "completed=" + str(driver.get("lapsCompleted", "-")),
    "recent=" + ",".join(str(lap["number"]) for lap in recent),
    "keys=" + "|".join(sorted({key for lap in recent for key in lap})),
)
' "$1"
}

# Fifteen laps run, but the feed never sent lap 8 and lap 11 was still on the road when it was read
# (a null duration). Both are absences the model drops: neither counts as completed, and neither is a
# point in the window — the window keeps its width by lap number, so their gaps are the sparkline's.
laps="$(mapping <<'JSON'
{
  "drivers": [{ "driver_number": 4, "name_acronym": "NOR", "team_name": "McLaren" }],
  "laps": [
    { "driver_number": 4, "lap_number": 1, "lap_duration": 80.100 },
    { "driver_number": 4, "lap_number": 2, "lap_duration": 79.900 },
    { "driver_number": 4, "lap_number": 3, "lap_duration": 79.800 },
    { "driver_number": 4, "lap_number": 4, "lap_duration": 79.700 },
    { "driver_number": 4, "lap_number": 5, "lap_duration": 79.600 },
    { "driver_number": 4, "lap_number": 6, "lap_duration": 79.500 },
    { "driver_number": 4, "lap_number": 7, "lap_duration": 79.400 },
    { "driver_number": 4, "lap_number": 9, "lap_duration": 79.300 },
    { "driver_number": 4, "lap_number": 10, "lap_duration": 79.200 },
    { "driver_number": 4, "lap_number": 11, "lap_duration": null },
    { "driver_number": 4, "lap_number": 12, "lap_duration": 79.100 },
    { "driver_number": 4, "lap_number": 13, "lap_duration": 79.000 },
    { "driver_number": 4, "lap_number": 14, "lap_duration": 78.900 },
    { "driver_number": 4, "lap_number": 15, "lap_duration": 78.800 }
  ]
}
JSON
)"

# Thirteen laps completed of fifteen numbered — laps 8 and 11 are not among them. The window is the last
# twelve lap *numbers* (4 through 15), so it drops laps 8 and 11 as holes rather than pulling laps 1–3
# in to keep the count, and each lap carries only the number and the time the adapter has for it.
assert_equals "the lap-time window is by lap number, dropping the laps the feed did not complete" \
  "completed=13 recent=4,5,6,7,9,10,12,13,14,15 keys=number|time" \
  "$(laps_of 4 <<<"$laps")"

# --- The Gap and tyre-age each lap ran on (#16) -----------------------------------------------
# The other two trends the sparklines draw. A whole-Session recording cannot pin either — its laps
# are dated but its intervals are reduced to one reading per Driver, and no lap of it was ever run a
# lap down — so both are fed straight in here, with times chosen to make each boundary land.

# Each window lap's Gap and tyre age, as `lap gap tyreAge`, absent shown as `-`.
per_lap() {
  python3 -c '
import json, sys

driver = next(d for d in json.load(sys.stdin) if d["number"] == int(sys.argv[1]))
for lap in driver.get("recentLaps", []):
    print(lap["number"], lap.get("gap", "-"), lap.get("tyreAge", "-"))
' "$1"
}

# The current set, as `compound age stint stintLaps pitStops`.
tyre_of() {
  python3 -c '
import json, sys

driver = next(d for d in json.load(sys.stdin) if d["number"] == int(sys.argv[1]))
tyre = driver.get("tyre", {})
print(tyre.get("compound", "-"), tyre.get("ageInLaps", "-"),
      driver.get("stint", "-"), driver.get("stintLaps", "-"), driver.get("pitStops", "-"))
' "$1"
}

# NOR three laps into a Stint, on a Medium set fitted with two laps already on it. The intervals are a
# series, not one reading: lap 4 finishes at 00:01:20 and reads the 00:01:00 Gap, lap 5 finishes at
# 00:02:40 and reads the 00:02:00 Gap, and by lap 6 the feed has him a lap down — which is no duration
# to plot, so that lap carries a tyre age but no Gap, exactly as a lap down carries none in the model.
trends="$(mapping <<'JSON'
{
  "drivers": [{ "driver_number": 4, "name_acronym": "NOR", "team_name": "McLaren" }],
  "intervals": [
    { "driver_number": 4, "date": "2025-01-01T00:01:00Z", "gap_to_leader": 5.0, "interval": 1.0 },
    { "driver_number": 4, "date": "2025-01-01T00:02:00Z", "gap_to_leader": 4.0, "interval": 1.0 },
    { "driver_number": 4, "date": "2025-01-01T00:03:30Z", "gap_to_leader": "+1 LAP", "interval": "+1 LAP" }
  ],
  "laps": [
    { "driver_number": 4, "lap_number": 4, "lap_duration": 80, "date_start": "2025-01-01T00:00:00Z" },
    { "driver_number": 4, "lap_number": 5, "lap_duration": 80, "date_start": "2025-01-01T00:01:20Z" },
    { "driver_number": 4, "lap_number": 6, "lap_duration": 80, "date_start": "2025-01-01T00:02:40Z" }
  ],
  "stints": [
    { "driver_number": 4, "stint_number": 1, "lap_start": 1, "lap_end": 3, "compound": "SOFT", "tyre_age_at_start": 0 },
    { "driver_number": 4, "stint_number": 2, "lap_start": 4, "lap_end": 6, "compound": "MEDIUM", "tyre_age_at_start": 2 }
  ]
}
JSON
)"

# The Gap is the separation that stood when the lap ended, in millis; the tyre age climbs with the
# Stint from the two laps the set was fitted carrying; and the lap the feed had a lap down carries its
# age but no Gap — a break in that trend, never an invented value.
assert_equals "each lap carries the Gap that stood when it ended and the tyre age it ran on" \
  "$(
    cat <<'EOF'
4 5000 2
5 4000 3
6 - 4
EOF
  )" \
  "$(per_lap 4 <<<"$trends")"

# The badge is the set covering the latest completed lap: the Medium of Stint two, four laps of age on
# it against three run this Stint — the scrubbed-set distinction #11 keeps — and one stop to reach it.
assert_equals "the current tyre, its age, Stint and pit count come off the Stint covering the last lap" \
  "medium 4 2 3 1" \
  "$(tyre_of 4 <<<"$trends")"

finish
