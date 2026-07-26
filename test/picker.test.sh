#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The picker (#15, AC 1): choosing a Meeting and a Session to Replay. Two halves meet here — the
# Adapter turning catalogue records into the domain's list (catalogue-map.ts), and the page turning
# that list into the choice (picker-render.ts) — and the fact both hinge on is the one the records do
# not carry: a Session the catalogue names but nobody has Backfilled is "known but not here", listed
# beside its Replayable siblings and plainly not chooseable.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

# A season's worth in miniature: two Meetings out of calendar order, each with Sessions out of order,
# and only one Session actually on disk.
records='{
  "meetings": [
    { "meeting_key": 1267, "meeting_name": "Dutch Grand Prix", "circuit_short_name": "Zandvoort", "country_name": "Netherlands" },
    { "meeting_key": 1260, "meeting_name": "British Grand Prix", "circuit_short_name": "Silverstone", "country_name": "United Kingdom" }
  ],
  "sessions": [
    { "session_key": 9920, "meeting_key": 1267, "session_name": "Race", "date_start": "2025-08-31T13:00:00Z" },
    { "session_key": 9918, "meeting_key": 1267, "session_name": "Practice 1", "date_start": "2025-08-29T10:30:00Z" },
    { "session_key": 9800, "meeting_key": 1260, "session_name": "Race", "date_start": "2025-07-06T14:00:00Z" }
  ],
  "backfilled": [9920]
}'

catalogue() {
  node "$here/lib/catalogue-map.ts" <<<"$records"
}

# The catalogue read back as "Meeting | Session | here?", in the order it lists — so both orderings,
# the season's and the weekend's, are checked as orders and not only as contents.
listing() {
  python3 -c '
import json, sys
for meeting in json.load(sys.stdin):
    where = " / ".join(p for p in (meeting.get("circuit"), meeting.get("country")) if p)
    for session in meeting["sessions"]:
        print(meeting["name"], "|", where, "|", session["name"], "|", "here" if session["backfilled"] else "not-here")
'
}

# --- The Adapter groups and orders the season, and marks what is on disk --------------------------

assert_equals "Meetings run in calendar order, Sessions in weekend order, only the Backfilled one here" \
  "$(
    cat <<'EOF'
British Grand Prix | Silverstone / United Kingdom | Race | not-here
Dutch Grand Prix | Zandvoort / Netherlands | Practice 1 | not-here
Dutch Grand Prix | Zandvoort / Netherlands | Race | here
EOF
  )" \
  "$(catalogue | listing)"

# --- The page turns that into the choice ---------------------------------------------------------

page="$(catalogue | node "$here/lib/picker-render.ts")"

assert_contains "a Backfilled Session is a link to the Timing screen, keyed to it" \
  'href="index.html?session=9920">Race</a>' "$page"

assert_contains "a Session only catalogued is shown, marked not on disk and not a link" \
  '<span class="picker__unavailable" aria-disabled="true">Practice 1<span class="picker__note">not here</span>' \
  "$page"

# The whole point of drawing the unavailable ones: the gap is visible. The British Race is known but
# not Backfilled, so it is listed and it is not a link.
assert_equals "a known-but-absent Session is never a Replay link" \
  "0" "$(grep -o 'session=9800' <<<"$page" | wc -l | tr -d ' ')"

# --- An uncatalogued season says so, rather than drawing an empty list ----------------------------

assert_contains "an empty season points at the command that fills it" \
  "bin/catalogue" "$(echo '[]' | node "$here/lib/picker-render.ts")"

finish
