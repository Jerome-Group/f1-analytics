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

assert_equals "a Driver carries the four things this Session state is, and nothing else" \
  "code number position team" "$(keys_present <<<"$whole")"

# The fixture is worth having only if it says the same thing every time it is played. Two runs
# of the whole path, compared byte for byte.
assert_equals "the recording replays identically twice" "$whole" "$(replay 2025-dutch-race)"

# --- The same five minutes with car positions Gated ----------------------------------------

gated="$(replay 2025-dutch-race-gated)"

assert_equals "a position the feed withheld is absent, not zero and not stale" \
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

finish
