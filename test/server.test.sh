#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Seam 1: a recorded Session goes in, and the Session state that comes out of the WebSocket is
# what is asserted. Everything between the two — the Adapter, the fold into Session state, the
# ordering, the socket itself — is a black box, so this file survives any rewrite that does not
# change what a browser receives (#3, "What makes a good test here").
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

replay() {
  node "$here/lib/seam1.ts" "$1"
}

# The Timing screen, rendered from the message as text: one line per Driver, in the order the
# state gave them. Every acceptance criterion about what a Driver carries is one assertion
# against this, because that is how a person would check it.
as_a_timing_screen() {
  python3 -c '
import json, sys

state = json.load(sys.stdin)["state"]
for driver in state["drivers"]:
    print(driver.get("position", "-"), driver["number"], driver.get("code", "-"), driver.get("team", "-"))
'
}

# Which keys the Drivers actually carry. A value the recording did not provide has to be missing
# from the object, not present and null and not present and zero — the difference is invisible in
# the rendering above and is the whole of story 38.
keys_present() {
  python3 -c '
import json, sys

state = json.load(sys.stdin)["state"]
print(" ".join(sorted({key for driver in state["drivers"] for key in driver})))
'
}

envelope() {
  python3 -c '
import json, sys

message = json.load(sys.stdin)
print(message["type"], message["state"]["sessionKey"])
'
}

# One Driver'"'"'s timing figures, normalised to `field=form:value`, absent shown as `-`. Gap and
# Interval are printed in the order the Driver holds them, so a transposition across the whole path
# — feed to Adapter to socket — would show here as plainly as it does at seam 2.
figures_of() {
  python3 -c '
import json, sys

number = int(sys.argv[1])
driver = next(d for d in json.load(sys.stdin)["state"]["drivers"] if d["number"] == number)


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
driver = next(d for d in json.load(sys.stdin)["state"]["drivers"] if d["number"] == number)
print(" ".join(sorted(driver)))
' "$1"
}

# --- Five minutes of a finished Session ----------------------------------------------------

whole="$(replay 2025-dutch-race)"

assert_equals "the browser is sent tagged Session state for the Session it asked for" \
  "session-state 9920" "$(envelope <<<"$whole")"

assert_equals "twenty Drivers arrive in position order, with number, code and team" \
  "$(
    cat <<'EOF'
1 81 PIA McLaren
2 4 NOR McLaren
3 1 VER Red Bull Racing
4 6 HAD Racing Bulls
5 16 LEC Ferrari
6 63 RUS Mercedes
7 44 HAM Ferrari
8 30 LAW Racing Bulls
9 55 SAI Williams
10 23 ALB Williams
11 12 ANT Mercedes
12 10 GAS Alpine
13 31 OCO Haas F1 Team
14 5 BOR Kick Sauber
15 87 BEA Haas F1 Team
16 18 STR Aston Martin
17 14 ALO Aston Martin
18 22 TSU Red Bull Racing
19 43 COL Alpine
20 27 HUL Kick Sauber
EOF
  )" \
  "$(as_a_timing_screen <<<"$whole")"

assert_equals "the Drivers carry identity, place, separation and lap times, and nothing else" \
  "bestLap code gap interval lastLap number position team" "$(keys_present <<<"$whole")"

# VER, running third, is behind two cars: further from the leader than from the one immediately
# ahead. That the two numbers differ is what makes this a transposition guard rather than a
# coincidence — a swap would read `gap=millis:13279 interval=millis:16844`. The last lap is not the
# best, so the best is genuinely the Session'"'"'s and not merely the most recent.
assert_equals "a running Driver's real Gap, Interval and lap times arrive off the Replay, not swapped" \
  "gap=millis:16844 interval=millis:13279 lastLap=76710 bestLap=75648" \
  "$(figures_of 1 <<<"$whole")"

# The leader is behind no one, so Gap and Interval are absent for them — but they have lapped the
# circuit, so their lap times are not. Absence and presence in the same Driver, off one recording.
assert_equals "the leader has no Gap or Interval, but does have lap times" \
  "gap=- interval=- lastLap=75573 bestLap=74901" \
  "$(figures_of 81 <<<"$whole")"

assert_equals "and so the leader carries no Gap or Interval key at all" \
  "bestLap code lastLap number position team" "$(keys_of 81 <<<"$whole")"

# The fixture is worth having only if it says the same thing every time it is played. Two runs
# of the whole path, compared byte for byte.
assert_equals "the recording replays identically twice" "$whole" "$(replay 2025-dutch-race)"

# --- The same five minutes with car positions Gated ----------------------------------------

gated="$(replay 2025-dutch-race-gated)"

assert_equals "streams the feed withheld are absent, not zero and not stale" \
  "code number team" "$(keys_present <<<"$gated")"

assert_equals "an unplaced field still arrives whole, ordered by Driver number" \
  "$(
    cat <<'EOF'
- 1 VER Red Bull Racing
- 4 NOR McLaren
- 5 BOR Kick Sauber
- 6 HAD Racing Bulls
- 10 GAS Alpine
- 12 ANT Mercedes
- 14 ALO Aston Martin
- 16 LEC Ferrari
- 18 STR Aston Martin
- 22 TSU Red Bull Racing
- 23 ALB Williams
- 27 HUL Kick Sauber
- 30 LAW Racing Bulls
- 31 OCO Haas F1 Team
- 43 COL Alpine
- 44 HAM Ferrari
- 55 SAI Williams
- 63 RUS Mercedes
- 81 PIA McLaren
- 87 BEA Haas F1 Team
EOF
  )" \
  "$(as_a_timing_screen <<<"$gated")"

# --- A reload mid-Session costs nothing (#14) ----------------------------------------------
# A browser that drops and reconnects is sent the whole Session again, not a reduced view of it —
# which is what makes a stray refresh cheap instead of catastrophic. Two connections to the same
# server; what the second is sent must match the first to the byte, and must be a snapshot.

reconnect="$(node "$here/lib/seam1-reconnect.ts" 2025-dutch-race)"
first_connect="$(sed -n '1p' <<<"$reconnect")"
second_connect="$(sed -n '2p' <<<"$reconnect")"

assert_equals "a reconnecting browser is sent the whole Session, identical to the first time" \
  "$first_connect" "$second_connect"

assert_equals "and it is a whole-Session snapshot on reconnect, not a change to fold onto nothing" \
  "session-state 9920" "$(envelope <<<"$second_connect")"

finish
