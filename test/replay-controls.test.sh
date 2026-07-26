#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The Replay controls' render (#15): Session state in, the control bar out. The bar is drawn from the
# Replay clock alone, so a Live Session — which has none — draws nothing, and that presence-or-absence
# is the whole of "Live versus Replay is unmistakable, and no view branches on the mode". The rows and
# the strip are rendered the same either way; only this appears.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

render() {
  node "$here/lib/replay-controls-render.ts"
}

# A Replay clock a little under a third of the way through an eighty-eight-minute Session, playing at
# double speed.
replaying='{
  "sessionKey": 0, "drivers": [], "mode": "replay",
  "replay": { "start": 1000000, "end": 6280000, "position": 1745000, "playing": true, "speed": 2 }
}'

paused='{
  "sessionKey": 0, "drivers": [], "mode": "replay",
  "replay": { "start": 1000000, "end": 6280000, "position": 1745000, "playing": false, "speed": 1 }
}'

# --- A Live Session draws no controls at all -----------------------------------------------------

assert_equals "a Live Session, which has no clock to move, draws no controls" \
  "" "$(render <<<'{ "sessionKey": 0, "drivers": [], "mode": "live" }')"

assert_equals "and a Session with no mode set draws none either" \
  "" "$(render <<<'{ "sessionKey": 0, "drivers": [] }')"

# --- A Replay draws the whole bar, reading the clock ---------------------------------------------

playing="$(render <<<"$replaying")"

assert_contains "the scrub bar spans the whole Session, its handle at the clock's position" \
  'type="range" data-action="scrub" min="1000000" max="6280000" value="1745000"' "$playing"

assert_contains "the clock reads how far into the Session it stands, over the whole of it" \
  '>12:25 / 1:28:00<' "$playing"

# The button always names what pressing it does: while playing it offers to pause, and carries the
# playing state for a reader that cannot see the word.
assert_contains "while playing, the button offers Pause" \
  'data-action="playpause" aria-pressed="true">Pause<' "$playing"

assert_contains "the running speed is the one marked pressed" \
  'data-speed="2" aria-pressed="true"' "$playing"

assert_contains "and a speed that is not running is not" \
  'data-speed="1" aria-pressed="false"' "$playing"

# --- Paused reads the other way ------------------------------------------------------------------

stopped="$(render <<<"$paused")"

assert_contains "while paused, the same button offers Play" \
  'data-action="playpause" aria-pressed="false">Play<' "$stopped"

finish
