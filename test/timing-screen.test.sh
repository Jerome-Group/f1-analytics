#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Seam 2: Session state goes in and what is on screen is asserted. The renderer is a black box —
# nothing here knows how a row is built, only what a viewer would see in it (#3, "What makes a
# good test here").
#
# The state going in is the message seam 1 sends, byte for byte, so the two seams are checked
# against each other rather than against a shape written out twice and kept in step by hand.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

render() {
  node "$here/lib/seam2.ts"
}

# The screen read back as text: one line per Driver, in the order they are on it. Every
# acceptance criterion about what a row shows is one assertion against this, because that is
# how a person would check it — by reading the screen.
as_a_timing_screen() {
  python3 -c '
import re, sys

screen = sys.stdin.read()


def cell(row, css_class):
    found = re.search(rf"<span class=\"{css_class}(?P<absent> absent)?\"[^>]*>(?P<text>[^<]*)", row)
    if found is None:
        return "."
    return "-" if found.group("absent") else found.group("text")


for row in re.findall(r"<div class=\"driver-row\".*?</div>", screen, re.S):
    livery = re.search(r"--team-colour: var\((--team-[a-z-]+)\)", row)
    print(cell(row, "position"), cell(row, "car-number"), cell(row, "driver-name__tla"),
          livery.group(1) if livery else "no livery")
'
}

rows_on() {
  grep -c '<div class="driver-row"' <<<"$1"
}

# A Session state carrying a field of the given size, as the wire carries it. Nothing here comes
# from a recording: the point is the number of Drivers, and no recording has every number in it.
a_field_of() {
  python3 -c '
import json, sys

size = int(sys.argv[1])
drivers = [
    {"number": n, "code": f"D{n:02d}", "team": "Ferrari", "position": n}
    for n in range(1, size + 1)
]
print(json.dumps({"type": "session-state", "state": {"sessionKey": 9920, "drivers": drivers}}))
' "$1"
}

# --- The two seams meet ---------------------------------------------------------------------

whole="$(node "$here/lib/seam1.ts" 2025-dutch-race | render)"

assert_equals "the field seam 1 sends is on screen, in position order, with code and livery" \
  "$(
    cat <<'EOF'
1 81 PIA --team-mclaren
2 4 NOR --team-mclaren
3 1 VER --team-red-bull
4 6 HAD --team-racing-bulls
5 16 LEC --team-ferrari
6 63 RUS --team-mercedes
7 44 HAM --team-ferrari
8 30 LAW --team-racing-bulls
9 55 SAI --team-williams
10 23 ALB --team-williams
11 12 ANT --team-mercedes
12 10 GAS --team-alpine
13 31 OCO --team-haas
14 5 BOR --team-kick-sauber
15 87 BEA --team-haas
16 18 STR --team-aston-martin
17 14 ALO --team-aston-martin
18 22 TSU --team-red-bull
19 43 COL --team-alpine
20 27 HUL --team-kick-sauber
EOF
  )" \
  "$(as_a_timing_screen <<<"$whole")"

# --- The field is whatever size the Session's field is ---------------------------------------
#
# Twenty for 2025, twenty-two for 2026, and neither is a property of the screen. A renderer that
# knows a number is one that drops a Driver the season added and draws an empty row for one it
# lost, and both failures are silent.

for size in 1 20 22 24; do
  assert_equals "the screen renders exactly the $size Drivers it was given" \
    "$size" "$(rows_on "$(a_field_of "$size" | render)")"
done

# --- A Driver the feed has not placed ---------------------------------------------------------

gated="$(node "$here/lib/seam1.ts" 2025-dutch-race-gated | render)"

assert_equals "an unplaced field is still whole, and no Driver is at position zero" \
  "20" "$(rows_on "$gated")"

assert_equals "a position the feed withheld reads as absent, never as a nought" \
  "20" "$(as_a_timing_screen <<<"$gated" | grep -c '^- ')"

# --- Every row lays out against the same track list -------------------------------------------
#
# A row with a different number of cells than its neighbour is a screen where every column right
# of the difference is quietly wrong — the failure docs/adr/0010 put the track list in a token to
# prevent, seen from the rendered side.

assert_equals "every row on the screen has the same cells" "1" \
  "$(python3 -c '
import re, sys

screen = sys.stdin.read()
rows = re.findall(r"<div class=\"driver-row\".*?</div>", screen, re.S)
print(len({len(re.findall(r"<span\b", row)) for row in rows}))
' <<<"$whole")"

# --- Liveries come from the design system, and are never nothing -------------------------------
#
# A team token referenced but never defined is a Driver with no bar on their row, and a row with
# no bar reads as an empty seat. A constructor the design system has no livery for is grey on
# purpose rather than blank by accident.

teams="$here/../web/design-system/tokens/teams.css"

assert_equals "every livery the screen asks for is one the design system defines" "" \
  "$(python3 -c '
import re, sys

defined = set(re.findall(r"^\s*(--team-[a-z-]+):", open(sys.argv[1]).read(), re.M))
asked = set(re.findall(r"var\((--team-[a-z-]+)\)", sys.stdin.read()))
print("\n".join(sorted(asked - defined)))
' "$teams" <<<"$whole")"

assert_equals "a constructor with no livery of its own is grey, not blank" \
  "1 7 SEV --team-unknown" \
  "$(as_a_timing_screen < <(
    printf '%s' '{"type":"session-state","state":{"sessionKey":9920,"drivers":[
      {"number":7,"code":"SEV","team":"A Constructor Nobody Has Drawn","position":1}]}}' | render
  ))"

# --- The core timing columns (#9): Gap, Interval, last lap, best lap --------------------------

# A Session state built here rather than from a recording: the numbers have to differ between the
# columns on purpose, and a recording is a place where they might happen to agree.
a_screen() {
  python3 -c '
import json, sys
print(json.dumps({"type": "session-state",
                  "state": {"sessionKey": 9920, "drivers": json.loads(sys.argv[1])}}))
' "$1"
}

# The four timing figures read off each row, in column order, the way a viewer would read across
# it — a value the feed gave, "-" for one it did not, and "." for a column that is not on the row
# at all. Keyed by the column's own class, so a value drawn under the wrong column is read as being
# under the wrong column, which is the whole point of the transposition it is guarding against.
columns() {
  python3 -c '
import re, sys

def figure(row, column):
    for span in re.finditer(r"<span class=\"([^\"]*)\">([^<]*)</span>", row):
        classes = span.group(1).split()
        if column in classes:
            return "-" if "absent" in classes else span.group(2)
    return "."

for row in re.findall(r"<div class=\"driver-row\".*?</div>", sys.stdin.read(), re.S):
    print(figure(row, "gap"), figure(row, "interval"),
          figure(row, "last-lap"), figure(row, "best-lap"))
'
}

# The timing columns in the left-to-right order they appear on the row. A transposition that
# swapped the columns rather than their values would read correct off `columns` and wrong here.
column_order() {
  python3 -c '
import re, sys

row = re.search(r"<div class=\"driver-row\".*?</div>", sys.stdin.read(), re.S).group(0)
order = [column
         for span in re.finditer(r"<span class=\"([^\"]*)\"", row)
         for column in ("gap", "interval", "last-lap", "best-lap")
         if column in span.group(1).split()]
print(" ".join(order))
'
}

field='[
  {"number":81,"code":"PIA","team":"McLaren","position":1,"lastLap":89117,"bestLap":88402},
  {"number":1,"code":"VER","team":"Red Bull","position":2,"gap":{"millis":2418},"interval":{"millis":2418},"lastLap":89663,"bestLap":89402},
  {"number":16,"code":"LEC","team":"Ferrari","position":3,"gap":{"millis":12345},"interval":{"millis":9927},"lastLap":89880,"bestLap":89601},
  {"number":63,"code":"RUS","team":"Mercedes","position":4,"gap":{"millis":62550},"interval":{"millis":50205},"lastLap":90774,"bestLap":90108},
  {"number":22,"code":"TSU","team":"Red Bull","position":19,"gap":{"laps":1},"interval":{"millis":30500}},
  {"number":27,"code":"HUL","team":"Kick Sauber","position":20,"gap":{"laps":2},"interval":{"laps":1}}
]'

screen="$(a_screen "$field" | render)"

# Every acceptance criterion about what these columns show, read off the screen at once: the leader
# with no Gap or Interval, a same-lap car in seconds, a gap that crosses a minute, and the cars a
# lap or more down showing laps rather than a two-minute time.
assert_equals "Gap, Interval, last and best render per Driver, and a lap down is a lap not a time" \
  "$(
    cat <<'EOF'
- - 1:29.117 1:28.402
+2.418 +2.418 1:29.663 1:29.402
+12.345 +9.927 1:29.880 1:29.601
+1:02.550 +50.205 1:30.774 1:30.108
+1 LAP +30.500 - -
+2 LAPS +1 LAP - -
EOF
  )" \
  "$(columns <<<"$screen")"

# The one this ticket exists for. LEC's Gap and Interval genuinely differ, so drawing either where
# the other belongs is visible here rather than plausible.
transposed='[{"number":16,"code":"LEC","team":"Ferrari","position":3,"gap":{"millis":12345},"interval":{"millis":9927}}]'
one="$(a_screen "$transposed" | render)"

assert_equals "Gap holds the gap and Interval the interval — the two are not transposed" \
  "+12.345 +9.927" \
  "$(columns <<<"$one" | awk '{print $1, $2}')"

assert_equals "Gap sits left of Interval, in the order the header names the columns" \
  "gap interval last-lap best-lap" \
  "$(column_order <<<"$one")"

# The leader is not zero seconds behind themselves and their cell is not empty: it carries the same
# absent mark every unsent value does, which reads as "leader" and never as "+0.000".
assert_contains "the leader's Gap is the absent mark, not a zero and not an empty cell" \
  '<span class="gap cell--figure absent">&mdash;</span>' \
  "$screen"

# --- Sector times with purple, green and yellow status (#10) ----------------------------------

# The three sectors' status read left to right off each row — purple/green/yellow by another name,
# and "absent" for a sector the current lap has not set. Keyed off data-status, which is what the
# colour is drawn from, so a sector drawn the wrong colour reads as the wrong status here.
sector_status() {
  python3 -c '
import re, sys
for row in re.findall(r"<div class=\"driver-row\".*?</div>", sys.stdin.read(), re.S):
    print(" ".join(re.findall(r"<span class=\"sector-time\" data-status=\"([a-z-]+)\"", row)))
'
}

# The personal best beside each sector, and the speed trap that ends the row. A value the feed gave,
# or "-" for one it did not.
sector_bests() {
  python3 -c '
import re, sys
for row in re.findall(r"<div class=\"driver-row\".*?</div>", sys.stdin.read(), re.S):
    cells = re.findall(r"<span class=\"cell--figure-secondary( absent)?\"[^>]*>([^<]*)</span>", row)
    print(" ".join("-" if absent else text for absent, text in cells))
'
}

speed_trap() {
  python3 -c '
import re, sys
for row in re.findall(r"<div class=\"driver-row\".*?</div>", sys.stdin.read(), re.S):
    found = re.search(r"<span class=\"cell--figure speed-trap( absent)?\"[^>]*>([^<]*)</span>", row)
    print("." if found is None else ("-" if found.group(1) else found.group(2)))
'
}

# A field built here on purpose: the three statuses have to differ within one Driver so a colour
# drawn under the wrong sector shows, one Driver has a sector the current lap has not reached, and
# one has set nothing at all. A recording is a place where those might happen to coincide.
sector_field='[
  {"number":81,"code":"PIA","position":1,
   "sectors":[{"millis":28402,"status":"personal-best"},{"millis":31114,"status":"session-best"},{"millis":29601,"status":"set"}],
   "sectorBests":[28402,31114,29480],"speedTrap":327},
  {"number":16,"code":"LEC","position":8,
   "sectors":[{"millis":33104,"status":"set"},{"millis":36550,"status":"set"}],
   "sectorBests":[28702,31402,29776]},
  {"number":55,"code":"SAI","position":20}
]'

sectors_screen="$(a_screen "$sector_field" | render)"

# Purple for Session best, green for personal best, yellow otherwise, all three per Driver — and a
# sector the current lap has not set reading as absent, never as the lap before's time.
assert_equals "each sector is coloured to its status, and an unset sector reads as absent" \
  "$(
    cat <<'EOF'
personal-best session-best set
set set absent
absent absent absent
EOF
  )" \
  "$(sector_status <<<"$sectors_screen")"

assert_equals "the Driver's own best sits beside each sector, absent until they have set one" \
  "$(
    cat <<'EOF'
28.402 31.114 29.480
28.702 31.402 29.776
- - -
EOF
  )" \
  "$(sector_bests <<<"$sectors_screen")"

assert_equals "the speed trap is shown where the feed provided it, absent where it did not" \
  "$(
    cat <<'EOF'
327
-
-
EOF
  )" \
  "$(speed_trap <<<"$sectors_screen")"

finish
