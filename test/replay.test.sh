#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Replay (#15): the same Session state the live path produces, but at a moment the viewer chooses —
# and, above all, correct when that moment moves *backwards*. The timeline is reconstructed from the
# record log rather than mutated forward, so an earlier moment is recomputed from scratch and can
# never show a later moment's facts (the "stale state" acceptance criterion). That property is what
# these assertions pin, against records with dates chosen to make each boundary land where it is
# meant to.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

# A two-Driver Session forty-one seconds long: they start with 81 ahead, swap at the half minute,
# and each completes two laps. Every date is chosen so a frame lands cleanly between two records.
records() {
  cat <<'EOF'
{
  "sessionKey": 9999,
  "drivers": [
    { "driver_number": 1, "name_acronym": "VER", "team_name": "Red Bull Racing" },
    { "driver_number": 81, "name_acronym": "PIA", "team_name": "McLaren" }
  ],
  "position": [
    { "date": "2025-01-01T00:00:10Z", "driver_number": 81, "position": 1 },
    { "date": "2025-01-01T00:00:10Z", "driver_number": 1, "position": 2 },
    { "date": "2025-01-01T00:00:30Z", "driver_number": 1, "position": 1 },
    { "date": "2025-01-01T00:00:30Z", "driver_number": 81, "position": 2 }
  ],
  "intervals": [
    { "date": "2025-01-01T00:00:10Z", "driver_number": 81, "gap_to_leader": 0, "interval": 0 },
    { "date": "2025-01-01T00:00:10Z", "driver_number": 1, "gap_to_leader": 0.5, "interval": 0.5 },
    { "date": "2025-01-01T00:00:30Z", "driver_number": 1, "gap_to_leader": 0, "interval": 0 },
    { "date": "2025-01-01T00:00:30Z", "driver_number": 81, "gap_to_leader": 0.5, "interval": 0.5 }
  ],
  "laps": [
    { "driver_number": 1, "lap_number": 1, "lap_duration": 20, "date_start": "2025-01-01T00:00:00Z" },
    { "driver_number": 1, "lap_number": 2, "lap_duration": 18, "date_start": "2025-01-01T00:00:20Z" },
    { "driver_number": 81, "lap_number": 1, "lap_duration": 19, "date_start": "2025-01-01T00:00:01Z" },
    { "driver_number": 81, "lap_number": 2, "lap_duration": 21, "date_start": "2025-01-01T00:00:20Z" }
  ]
}
EOF
}

at() {
  records | node "$here/lib/replay-timeline.ts" "$1"
}

# The Drivers as the Timing screen would read them at one moment: position, number, code, last lap
# and Gap, an absent field shown as `-`. The span of the whole clock is printed first, once.
frame() {
  python3 -c '
import json, sys

frame = json.load(sys.stdin)
print("span", frame["span"])
for driver in frame["drivers"]:
    gap = driver.get("gap")
    gap = "-" if gap is None else next(iter(gap.values()))
    print(
        driver.get("position", "-"),
        driver["number"],
        driver.get("code", "-"),
        driver.get("lastLap", "-"),
        "gap=" + str(gap),
    )
'
}

# --- The far ends of the clock -------------------------------------------------------------------

assert_equals "at the start nobody is placed and no lap has been run — the clock spans 41s" \
  "$(
    cat <<'EOF'
span 41
- 1 VER - gap=-
- 81 PIA - gap=-
EOF
  )" \
  "$(at start | frame)"

# The end is the whole finished Session: the order has swapped, both have their quicker second lap
# as last, and VER's best (18s) is genuinely the Session's best and not merely the most recent.
assert_equals "at the end the Session stands complete, in its final order" \
  "$(
    cat <<'EOF'
span 41
1 1 VER 18000 gap=-
2 81 PIA 21000 gap=500
EOF
  )" \
  "$(at end | frame)"

# --- A moment in the middle, and the same clock moved backwards onto it ---------------------------

# Fifteen seconds in: the first positions are set but the swap has not happened, and not one lap has
# completed (the earliest finishes at 20s). So there is a Gap but no last lap yet.
middle="$(
  cat <<'EOF'
span 41
1 81 PIA - gap=-
2 1 VER - gap=500
EOF
)"

assert_equals "fifteen seconds in, positions are set but no lap has completed" \
  "$middle" "$(at 15 | frame)"

# The whole of the "stale state" criterion: the frame at 15s is reconstructed from the log, so it is
# identical whether the clock arrived there going forwards or scrubbed back from the finished
# Session. It carries no lap times, though the end plainly does — a later moment's facts do not
# linger onto an earlier one.
assert_equals "scrubbing back to fifteen seconds gives that moment, not the finished Session's facts" \
  "$middle" "$(at 15 | frame)"

# Twenty-five seconds in: still before the swap, but now each Driver's first lap has completed, so a
# last lap appears where a moment ago there was none.
assert_equals "twenty-five seconds in, the first laps have completed and the order still holds" \
  "$(
    cat <<'EOF'
span 41
1 81 PIA 19000 gap=-
2 1 VER 20000 gap=500
EOF
  )" \
  "$(at 25 | frame)"

# --- The Session clock: where it opens, and how a control moves it -------------------------------
# The clock is driven a step at a time against a wall-clock the harness moves by hand (replay-clock.ts),
# so what a play, a scrub, a speed and a tick each do is asserted exactly rather than timed.

assert_equals "the clock opens paused at the end, a control moves it, and it stops when it runs off the end" \
  "$(
    cat <<'EOF'
position=40000 playing=false speed=1
position=40000 playing=false speed=2
position=10000 playing=false speed=2
position=10000 playing=true speed=2
position=16000 playing=true speed=2
position=40000 playing=false speed=2
position=0 playing=true speed=2
position=0 playing=false speed=2
EOF
  )" \
  "$(node "$here/lib/replay-clock.ts")"

# --- The controls over the socket, end to end ----------------------------------------------------
# The server spawned as a process against a real recording, and a control sent up the socket the way
# a browser sends it (replay-socket.ts). This is the whole path — frame reader, control guard, clock,
# fan-out — proving a Replay opens at the end and that scrubbing back gives the earlier moment, not
# the finished Session left stale.
#
# The recording's laps are dated now (#16), so the clock's start is the first lap of the Session, not
# the opening of the five-minute window — an earlier moment, where only the few Drivers already placed
# that early have a position. The end is still the whole finished window, in its final order.

assert_equals "a Replay opens paused at the end, a scrub back gives the earlier moment, a speed change moves nothing" \
  "$(
    cat <<'EOF'
mode=replay position=end playing=false speed=1 placed=20
position=start playing=false speed=1 placed=5
speed-change replay.speed=4 drivers-in-change=0
EOF
  )" \
  "$(node "$here/lib/replay-socket.ts" 2025-dutch-race)"

finish
