#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Opening a Driver (#18), at both seams. Depth on one Driver is worth having only if it costs
# nothing for the other nineteen, so the assertion this file exists for is the architectural one:
# the per-second tier is on the wire for the Driver a viewer opened and for nobody else, checked at
# seam 1 where it is actually paid for rather than in the browser where it would already be too late.
#
# Everything is proved against Replay, and that is not a reduction: no stream is Gated once a Session
# has finished (CONTEXT.md, "Gated stream"), so a finished recording is the complete view.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

# --- Seam 1: what the socket sends ---------------------------------------------------------
# PIA leads these five minutes and is the one Driver in the recording with radio in the window, so
# every section of the panel has something real behind it. Ten seconds is scrubbed back with them
# still open, which is what the per-second window has to follow.

opened="$(node "$here/lib/seam1-open.ts" 2025-dutch-race 81 10)"
snapshot="$(sed -n '1p' <<<"$opened")"
on_open="$(sed -n '2p' <<<"$opened")"
on_move="$(sed -n '3p' <<<"$opened")"
on_close="$(sed -n '4p' <<<"$opened")"

keys() {
  python3 -c 'import json, sys; print(" ".join(sorted(json.load(sys.stdin))))'
}

# The criterion the whole ticket rests on. A connecting browser is sent the whole Session, and the
# whole Session contains no per-second tier at all — not for the twenty, and not for the one nobody
# has opened yet. A server that sent the tier and let the browser discard it would show here.
assert_equals "the Session a browser connects to carries no opened Driver, and so no per-second tier" \
  "drivers mode replay sessionKey" "$(keys <<<"$snapshot")"

assert_equals "opening a Driver brings their depth, and nothing else moves with it" \
  "opened" "$(keys <<<"$on_open")"

depth() {
  python3 -c 'import json, sys; print(" ".join(sorted(json.load(sys.stdin)["opened"])))'
}

assert_equals "the depth is one Driver's Stints, laps, radio and trace" \
  "laps number radio stints telemetry" "$(depth <<<"$on_open")"

assert_equals "and it is the Driver who was asked for" \
  "81" "$(python3 -c 'import json, sys; print(json.load(sys.stdin)["opened"]["number"])' <<<"$on_open")"

# --- The Stint history, the laps, the radio ------------------------------------------------

stints_of() {
  python3 -c '
import json, sys

for stint in json.load(sys.stdin)["opened"]["stints"]:
    print(stint["number"], stint.get("compound", "-"), f"{stint['"'"'fromLap'"'"']}-{stint['"'"'toLap'"'"']}",
          "age=" + str(stint.get("tyreAgeAtStart", "-")))
'
}

# PIA has not stopped in these five minutes: one Stint, the Medium started on, fitted new, and it
# runs to the last lap actually completed — not to the lap the finished recording knows it ends on.
assert_equals "the Stint history is every set run so far, ending at the last lap actually run" \
  "1 medium 1-21 age=0" "$(stints_of <<<"$on_open")"

laps_of() {
  python3 -c '
import json, sys

laps = json.load(sys.stdin)["opened"]["laps"]
numbers = [lap["number"] for lap in laps]
statuses = {sector["status"] for lap in laps for sector in lap["sectors"] if sector is not None}
print("laps=" + str(len(laps)),
      "from=" + str(numbers[0]), "to=" + str(numbers[-1]),
      "statuses=" + ",".join(sorted(statuses)))
'
}

# Every lap the Driver has run, sector by sector — the detail the twenty-row screen has width for
# only on the lap in progress. The three statuses are all present, which is what says the sectors
# were settled against the whole field and not against this Driver alone.
assert_equals "the opened Driver's laps arrive sector by sector, coloured against the field" \
  "laps=21 from=1 to=21 statuses=personal-best,session-best,set" "$(laps_of <<<"$on_open")"

sector_of() {
  python3 -c '
import json, sys

lap = next(lap for lap in json.load(sys.stdin)["opened"]["laps"] if lap["number"] == int(sys.argv[1]))
print(" ".join("-" if s is None else f"{s['"'"'millis'"'"']}:{s['"'"'status'"'"']}" for s in lap["sectors"]),
      "time=" + str(lap.get("time", "-")))
' "$1"
}

# Lap 13: the Driver's own best first sector of the Session so far, green, in a lap that is otherwise
# ordinary. That a fast sector inside a slow lap reads as fast is the point of colouring them at all.
assert_equals "a personal-best sector is marked as one even in a lap that is not" \
  "25303:personal-best 27077:set 22681:set time=75061" "$(sector_of 13 <<<"$on_open")"

radio_of() {
  python3 -c '
import json, sys

for clip in json.load(sys.stdin)["opened"]["radio"]:
    print(clip["at"], clip["url"].rsplit("/", 1)[-1])
'
}

# Newest first, each with the Session moment it was broadcast at and Formula 1's own address for the
# recording — this project mirrors no audio.
assert_equals "team radio arrives newest first, with the moment it was broadcast" \
  "$(
    cat <<'EOF'
1756645629766 OSCPIA01_81_20250831_150649.mp3
1756643144055 OSCPIA01_81_20250831_142509.mp3
EOF
  )" \
  "$(radio_of <<<"$on_open")"

# --- The per-second tier, and that it is a window ------------------------------------------

trace_of() {
  python3 -c '
import json, sys

trace = json.load(sys.stdin)["opened"]["telemetry"]
channels = sorted({key for reading in trace for key in reading})
print("readings=" + str(len(trace)),
      "channels=" + ",".join(channels),
      "span=" + str(round((trace[-1]["at"] - trace[0]["at"]) / 1000)),
      "ordered=" + str(all(a["at"] <= b["at"] for a, b in zip(trace, trace[1:]))).lower())
'
}

# Five channels and the moment each was read. Thirty seconds is the window the trace draws
# (server/openf1/timeline.ts): a Race holds around seven hundred thousand of these readings, and the
# whole reason this tier renders for one Driver is that only its last seconds are ever sent.
assert_equals "the trace is five channels over the seconds just gone, in order" \
  "readings=106 channels=at,brake,gear,rpm,speed,throttle span=29 ordered=true" \
  "$(trace_of <<<"$on_open")"

window_end() {
  python3 -c 'import json, sys; print(json.load(sys.stdin)["opened"]["telemetry"][-1]["at"])'
}

# Scrubbed ten seconds back, the window ends ten seconds earlier: the trace is cut from the log at
# the moment the clock stands on, not accumulated as the Replay runs. Rounded to the second, because
# where the readings fall inside it is upstream's business.
assert_equals "the trace window follows the clock rather than accumulating" \
  "10" \
  "$(python3 -c 'import sys; print(round((int(sys.argv[1]) - int(sys.argv[2])) / 1000))' \
    "$(window_end <<<"$on_open")" "$(window_end <<<"$on_move")")"

# --- The twenty rows keep updating while a Driver is open ----------------------------------
# The same scrub, read the other way. The change carries the field *and* the opened Driver's depth,
# so the rows are not paused, throttled or otherwise paying for the panel over them.

assert_equals "moving the clock with a Driver open still moves the field, and their depth with it" \
  "drivers=19 opened=81" \
  "$(python3 -c '
import json, sys
change = json.load(sys.stdin)
print("drivers=" + str(len(change.get("drivers", []))), "opened=" + str(change["opened"]["number"]))
' <<<"$on_move")"

# --- Closing takes the tier off the wire ---------------------------------------------------
# Closing is instant in the browser because the panel is drawn from what the browser holds
# (web/main.ts). What it costs the wire is this: the field is named as removed, so a browser is not
# left holding a trace of seconds the Session has since left behind.

assert_equals "closing removes the opened Driver from the Session rather than leaving them to go stale" \
  '{"removed": ["opened"]}' "$(python3 -c 'import json, sys; print(json.dumps(json.load(sys.stdin)))' <<<"$on_close")"

# --- A recording with the timed streams Gated ----------------------------------------------
# The Gated recording has no timed stream in it at all, so its clock has a single moment and nothing
# has been placed on it yet. Opening a Driver there must still answer — with the Driver, and with
# nothing invented to fill the sections out.

gated="$(node "$here/lib/seam1-open.ts" 2025-dutch-race-gated 81)"

assert_equals "a Driver opened where nothing has been timed carries their number and no invented depth" \
  '{"opened": {"number": 81}}' \
  "$(python3 -c 'import json, sys; print(json.dumps(json.load(sys.stdin)))' <<<"$(sed -n '2p' <<<"$gated")")"

# --- Seam 2: what is on screen -------------------------------------------------------------
# The state going in is the message seam 1 sends, folded exactly as a browser folds it: the change
# carries `opened` and nothing else, so the fold is the merge below (domain/wire.ts).

folded="$(python3 -c '
import json, sys

snapshot, change = (json.loads(line) for line in sys.argv[1:])
print(json.dumps({"type": "session-state", "state": {**snapshot, **change}}))
' "$snapshot" "$on_open")"

panel() {
  node "$here/lib/seam2-detail.ts" "$@" <<<"$folded"
}

assert_equals "no Driver open draws no panel at all, not an empty one" "" "$(panel)"

drawn="$(panel 81)"

# The panel read back as a person would read it: who is open, and what each section says.
assert_contains "the panel names the Driver it belongs to" \
  '<span class="driver-detail__tla">PIA</span>' "$drawn"

assert_contains "and wears their livery, so the panel and their row are plainly the same Driver" \
  '--team-colour: var(--team-mclaren)' "$drawn"

assert_contains "the panel carries the way out of it" \
  'data-action="close-driver"' "$drawn"

sections_of() {
  grep -o 'data-section="[a-z]*"' <<<"$1" | sed 's/data-section="//;s/"//' | tr '\n' ' ' | sed 's/ $//'
}

assert_equals "all four kinds of depth are drawn, in the order they are read in" \
  "stints laps radio telemetry" "$(sections_of "$drawn")"

# The Stint history in words: the compound ring, the laps it covered, and how the set went on. The
# row has only a superscript for a scrubbed set (#11); the panel has room to say it.
assert_contains "a Stint is drawn as its compound, its laps and how the set went on" \
  '<span class="tyre-badge" data-compound="medium">M</span><span class="detail-stint__laps">Laps 1&ndash;21</span><span class="detail-stint__age">fitted new</span>' \
  "$drawn"

# Newest first: the lap just run is the one being asked about, and it should not take a scroll.
assert_equals "the laps are drawn newest first" \
  "21 20 19" \
  "$(grep -o '<span class="detail-lap__number">[0-9]*' <<<"$drawn" | sed 's/.*>//' | head -3 | tr '\n' ' ' | sed 's/ $//')"

assert_contains "each lap's sectors are drawn in the same colours the row uses" \
  '<span class="sector-time" data-status="personal-best">25.303</span>' "$drawn"

assert_contains "a radio clip is playable where it stands, at the moment it was broadcast" \
  '<span class="detail-radio__at">13:07:09</span><audio class="detail-radio__clip" controls preload="none"' \
  "$drawn"

assert_equals "the trace draws all five channels, and no sixth" \
  "speed throttle brake gear rpm" \
  "$(grep -o 'data-channel="[a-z]*"' <<<"$drawn" | sed 's/data-channel="//;s/"//' | tr '\n' ' ' | sed 's/ $//')"

# The value now is read off the trace as often as its shape is, so each channel says where it stands.
assert_contains "each channel says where it stands now, in its own unit" \
  '<span class="trace__label">Speed</span><span class="trace__now">191<span class="trace__unit">km/h</span></span>' \
  "$drawn"

# A Driver opened before their streams have been read is not a Driver with nothing behind them, and
# the panel must not say they are. This is the state a browser holds for the moment between the click
# and the answer — the click having already drawn the panel, which is what makes opening feel instant.
waiting="$(node "$here/lib/seam2-detail.ts" 81 <<<"{\"type\":\"session-state\",\"state\":$snapshot}")"

assert_contains "a Driver opened before their depth arrives says it is being read, not that there is none" \
  'class="driver-detail__waiting"' "$waiting"

assert_equals "and draws no section at all until there is something in one" "" "$(sections_of "$waiting")"

# --- The twenty rows, while one Driver is open ---------------------------------------------
# The rows are rendered from the same state whether a Driver is open or not; all the opened Driver
# does to them is mark the row the panel belongs to.

rows="$(node "$here/lib/seam2.ts" 81 <<<"$folded")"

assert_equals "the whole field is still drawn while a Driver is open" \
  "20" "$(grep -c '<div class="driver-row"' <<<"$rows")"

assert_equals "and exactly one row — the Driver's own — is marked as the open one" \
  '81' \
  "$(grep -o 'data-driver="[0-9]*" aria-expanded="true"' <<<"$rows" | sed 's/data-driver="//;s/".*//')"

assert_equals "every row carries the Driver a click on it opens" \
  "20" "$(grep -c 'data-driver="[0-9]*"' <<<"$rows")"

finish
