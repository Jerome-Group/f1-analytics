#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Seam 2, the other half: Session state goes in and the session-global strip is asserted (#13). The
# strip is a black box — nothing here knows how it is built, only what a viewer would read in it —
# and the state going in is the same message shape seam 1 sends, so the strip meets the rows at the
# wire rather than at a shape written twice.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

render() {
  node "$here/lib/seam2-strip.ts"
}

# A Session state wrapped as the wire carries it. The argument is the state object itself, session
# fields and all — no recording, because a recording is where two of these might happen to agree.
a_state() {
  python3 -c '
import json, sys
print(json.dumps({"type": "session-state", "state": json.loads(sys.argv[1])}))
' "$1"
}

# Race control read back in the order it is drawn, each line its time and its text — so "newest
# first" is checked as an order and not only as a presence.
race_control() {
  python3 -c '
import re, sys
pattern = r"<div class=\"race-control__message\">(?:<span class=\"race-control__time\">([^<]*)</span>)?<span>([^<]*)</span></div>"
for found in re.finditer(pattern, sys.stdin.read()):
    print(found.group(1) or "-", "|", found.group(2))
'
}

# The five weather readings, each its label and value with the degree sign spelled out, in order.
weather() {
  python3 -c '
import re, sys
pattern = r"<div class=\"weather__reading\"><span class=\"strip-label\">([^<]*)</span>(.*?)</div>"
for found in re.finditer(pattern, sys.stdin.read()):
    value = re.sub(r"<[^>]+>", "", found.group(2)).replace("&deg;", "°").replace("&mdash;", "—")
    print(found.group(1), value)
'
}

# --- A running Session, everything present ---------------------------------------------------

full='{
  "sessionKey": 9920,
  "drivers": [],
  "identity": {"meeting": "Belgian Grand Prix", "session": "Race", "circuit": "Circuit de Spa-Francorchamps"},
  "status": "Running",
  "flag": "green",
  "clock": {"remaining": "1:12:04", "currentLap": 32, "totalLaps": 44},
  "raceControl": [
    {"time": "14:38:12", "text": "Turn 9 incident involving car 44 noted"},
    {"time": "14:36:40", "text": "Yellow flag in sector 2 cleared"},
    {"time": "14:31:05", "text": "Car 55 retired"}
  ],
  "weather": {"trackTemp": 41.2, "airTemp": 24.8, "humidity": 38, "windSpeed": 2.4, "raining": false},
  "mode": "live"
}'

strip="$(a_state "$full" | render)"

# Session status and the Session clock, always visible.
assert_contains "the Session status is shown" \
  '<span class="strip-label">Status</span> <span class="strip-value">Running</span>' "$strip"

assert_contains "the Session clock shows the time remaining" \
  '<span class="session-clock__remaining"><span class="strip-value">1:12:04</span></span>' "$strip"

assert_contains "the Session clock shows the lap count" \
  '<span class="session-clock__laps">Lap 32 / 44</span>' "$strip"

assert_contains "the Meeting and Session name the screen" \
  '<div class="session-identity__session">Race &middot; Circuit de Spa-Francorchamps</div>' "$strip"

# Flags and safety car, unmissable: a band across the whole strip and the condition worded.
assert_contains "the flag condition bands the whole strip" 'data-flag="green"' "$strip"
assert_contains "the flag condition is worded as well as coloured" \
  '<span class="flag-state">Track clear</span>' "$strip"

# Race control, newest first.
assert_equals "race control messages are shown, newest first" \
  "$(
    cat <<'EOF'
14:38:12 | Turn 9 incident involving car 44 noted
14:36:40 | Yellow flag in sector 2 cleared
14:31:05 | Car 55 retired
EOF
  )" \
  "$(race_control <<<"$strip")"

# Track and air temperature, humidity, wind and rainfall.
assert_equals "the five weather readings are all shown" \
  "$(
    cat <<'EOF'
Track 41.2°C
Air 24.8°C
Humidity 38%
Wind 2.4 m/s
Rain No
EOF
  )" \
  "$(weather <<<"$strip")"

# The four Gated streams are listed as unavailable during a Live window, because silently empty
# reads as broken (#3).
assert_contains "during a live Session the Gated streams are listed as unavailable" \
  '<div class="gated-streams">' "$strip"

# --- Replay: nothing is Gated once a Session has finished ------------------------------------

replay="$(a_state "$(python3 -c '
import json, sys
state = json.loads(sys.argv[1])["state"]
state["mode"] = "replay"
print(json.dumps(state))
' "$(a_state "$full")")" | render)"

assert_contains "in Replay the mode is drawn as Replay, not Live" \
  '<span class="mode-badge" data-mode="replay">Replay</span>' "$replay"

assert_equals "in Replay nothing is Gated, so the Gated streams are gone" "" \
  "$(grep -o 'gated-streams__stream' <<<"$replay")"

# --- A red flag, and the restart after it ---------------------------------------------------
#
# The strip is a function of the state, so a red flag is one state and the restart the next: it
# survives both without a reload, because there is nothing to reload — the next state is simply
# drawn.

red='{"sessionKey": 9920, "drivers": [], "status": "Suspended", "flag": "red",
  "clock": {"remaining": "0:48:20"},
  "raceControl": [{"time": "15:02:11", "text": "Red flag"}], "mode": "live"}'

red_strip="$(a_state "$red" | render)"

assert_contains "a red flag bands the strip red" 'data-flag="red"' "$red_strip"
assert_contains "a red flag is worded, and the status reads Suspended" \
  '<span class="flag-state">Red flag</span>' "$red_strip"
assert_contains "the suspended status is shown through the red flag" \
  '<span class="strip-label">Status</span> <span class="strip-value">Suspended</span>' "$red_strip"

restart='{"sessionKey": 9920, "drivers": [], "status": "Running", "flag": "green",
  "clock": {"remaining": "0:48:20", "currentLap": 34, "totalLaps": 44},
  "raceControl": [{"time": "15:14:00", "text": "Session resumed"}], "mode": "live"}'

restart_strip="$(a_state "$restart" | render)"

assert_contains "the restart is drawn as the next state, track clear again" \
  '<span class="flag-state">Track clear</span>' "$restart_strip"
assert_contains "the restart shows the Session running again from the lap it resumed on" \
  '<span class="session-clock__laps">Lap 34 / 44</span>' "$restart_strip"

# --- Absent is absent -----------------------------------------------------------------------
#
# A Session state with nothing session-global set: every field reads as absent rather than as a
# zero, a default of dry, or an assumed green flag.

bare="$(a_state '{"sessionKey": 9920, "drivers": []}' | render)"

assert_equals "with no flag stated the strip does not claim one" "" \
  "$(grep -o 'data-flag=' <<<"$bare")"

assert_contains "an unstated status reads as absent, not as running" \
  '<span class="strip-label">Status</span> <span class="strip-value absent">&mdash;</span>' "$bare"

assert_equals "unstated weather reads as absent, never as zero or as dry" \
  "$(
    cat <<'EOF'
Track —
Air —
Humidity —
Wind —
Rain —
EOF
  )" \
  "$(weather <<<"$bare")"

finish
