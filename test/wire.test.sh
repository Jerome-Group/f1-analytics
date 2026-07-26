#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The wire protocol is snapshot then changes (#14): a connecting browser gets the whole Session, and
# thereafter only what changed. Two things have to hold for that to be trustworthy — a change must
# carry *only* what changed, and folding snapshot-then-changes must land exactly where reconnecting
# to a fresh snapshot would. Both are checked here: once over a real socket with the fan-out to many
# browsers in the picture, and once on the pure fold, where the case a recording cannot show — a fact
# the feed stops sending — is pinned.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

# Two JSON values compared as data, not as text: key order is the server's business, and a reconnect
# that lands on the same Session in a different key order is still the same Session.
json_equal() {
  python3 -c '
import json, sys
print("equal" if json.loads(sys.argv[1]) == json.loads(sys.argv[2]) else "different")
' "$1" "$2"
}

# --- One change, many browsers, and a reconnect (over a real socket) -----------------------

fanned="$(node "$here/lib/fanout.ts")"
change_a="$(sed -n '1p' <<<"$fanned")"
change_b="$(sed -n '2p' <<<"$fanned")"
folded="$(sed -n '3p' <<<"$fanned")"
late="$(sed -n '4p' <<<"$fanned")"

assert_equals "one update reaches every connected browser, byte for byte" \
  "equal" "$(json_equal "$change_a" "$change_b")"

assert_equals "a browser that folded the change matches one that reconnected to a fresh snapshot" \
  "equal" "$(json_equal "$folded" "$late")"

# The flag went yellow and two Drivers moved; the third did not. That it is absent from the change
# is the whole of "only what changed" — a swap to sending all twenty every time would show here.
change_summary() {
  python3 -c '
import json, sys
change = json.load(sys.stdin)
drivers = sorted(d["number"] for d in change.get("drivers", []))
print("flag=" + str(change.get("flag", "-")), "drivers=" + ",".join(map(str, drivers)))
'
}

assert_equals "a change carries only the Drivers that moved and the fields that changed" \
  "flag=yellow drivers=1,81" "$(change_summary <<<"$change_a")"

# --- The pure fold, and the case a recording cannot show -----------------------------------
# VER is carrying an Interval; the next state stops sending it. A whole-Driver replace is what makes
# that fact go absent rather than linger (story 38) — a field-by-field merge could not. The second
# step moves nothing, and an update that moves nothing must send nothing at all.

folded_out="$(node "$here/lib/wire-fold.ts" <<'JSON'
{
  "initial": {
    "sessionKey": 9920,
    "drivers": [
      { "number": 81, "position": 1, "lastLap": 75573 },
      { "number": 1, "position": 2, "interval": { "millis": 13279 }, "lastLap": 76710 }
    ]
  },
  "steps": [
    {
      "sessionKey": 9920,
      "drivers": [
        { "number": 81, "position": 1, "lastLap": 75000 },
        { "number": 1, "position": 2, "lastLap": 76710 }
      ]
    },
    {
      "sessionKey": 9920,
      "drivers": [
        { "number": 81, "position": 1, "lastLap": 75000 },
        { "number": 1, "position": 2, "lastLap": 76710 }
      ]
    }
  ]
}
JSON
)"
changes="$(sed -n '1p' <<<"$folded_out")"
final="$(sed -n '2p' <<<"$folded_out")"

# The first step's change, summarised: PIA's last lap moved and VER dropped its Interval, so both
# are in the change and no field the feed did not send is.
first_change() {
  python3 -c '
import json, sys
change = json.loads(sys.argv[1])[0]
drivers = sorted(d["number"] for d in change.get("drivers", []))
print("drivers=" + ",".join(map(str, drivers)))
' "$1"
}

assert_equals "the first change carries exactly the two Drivers that moved" \
  "drivers=1,81" "$(first_change "$changes")"

assert_equals "an update that moves nothing sends nothing to fold" \
  "true" "$(python3 -c 'import json, sys; print(str(json.loads(sys.argv[1])[1] is None).lower())' "$changes")"

keys_of_driver() {
  python3 -c '
import json, sys
number = int(sys.argv[2])
driver = next(d for d in json.loads(sys.argv[1])["drivers"] if d["number"] == number)
print(" ".join(sorted(driver)))
' "$1" "$2"
}

assert_equals "a fact the feed stops sending goes absent after folding, never stale" \
  "lastLap number position" "$(keys_of_driver "$final" 1)"

finish
