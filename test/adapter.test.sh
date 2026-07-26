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

finish
