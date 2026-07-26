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
from html.parser import HTMLParser

# A column is a direct child of the row, whatever it holds — a bare cell, a chip inside a cell, a
# tyre inside a cell. Counting every <span> would call a chip an extra column; counting the direct
# children counts columns, which is the track list every row has to lay out against.
class Columns(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.columns = 0

    def handle_starttag(self, tag, attrs):
        if self.depth == 1:
            self.columns += 1
        self.depth += 1

    def handle_endtag(self, tag):
        self.depth -= 1

widths = set()
for row in re.findall(r"<div class=\"driver-row\".*?</div>", sys.stdin.read(), re.S):
    counter = Columns()
    counter.feed(row)
    widths.add(counter.columns)
print(len(widths))
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

# The two seams meet on these columns too, not only on identity: the state seam 1 now produces off
# the Replay — Gap, Interval and lap times populated — is a valid seam 2 input, and the values it
# carries are the values drawn. Read off the real recording, so the leader's absent separation and
# VER's genuinely-different Gap and Interval (a swap would read `+13.279 +16.844`) survive the whole
# path, feed to Adapter to socket to screen.
assert_equals "the real Gap, Interval and lap times seam 1 sends are the ones seam 2 draws" \
  "$(
    cat <<'EOF'
- - 1:15.573 1:14.901
+3.571 +3.571 1:15.804 1:14.708
+16.844 +13.279 1:16.710 1:15.648
EOF
  )" \
  "$(columns <<<"$whole" | sed -n '1,3p')"

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

# --- Tyres: compound, tyre age, Stint and pit count (#11) -------------------------------------

# Each row's strategy read across: the compound (which carries its own colour), the tyre's age with
# a "+" when the set was fitted with laps already on it, the Stint number and the pit count. A "-"
# for anything the feed has not sent.
tyres() {
  python3 -c '
import re, sys

def figure(row, column):
    found = re.search(rf"<span class=\"cell--figure {column}( absent)?\"[^>]*>([^<]*)</span>", row)
    if found is None:
        return "."
    return "-" if found.group(1) else found.group(2)

for row in re.findall(r"<div class=\"driver-row\".*?</div>", sys.stdin.read(), re.S):
    compound = re.search(r"data-compound=\"([a-z]+)\"", row).group(1)
    age = re.search(r"class=\"cell--figure tyre-age( absent)?\"(?P<used> data-fitted-used=\"true\")?[^>]*>([^<]*)", row)
    age_text = "-" if age.group(1) else age.group(3) + ("+" if age.group("used") else "")
    print(compound, age_text, figure(row, "stint"), figure(row, "pit-stops"))
'
}

# Built here on purpose: VER is on a set with twenty-one laps on it but only eight run this Stint —
# a set fitted scrubbed, the case the ticket names — so tyre age and Stint laps genuinely differ and
# conflating them would show. SAI is on nothing the feed has named. PIA's age equals its Stint laps,
# so a fresh set carries no "fitted used" mark.
tyre_field='[
  {"number":81,"code":"PIA","position":1,"tyre":{"compound":"medium","ageInLaps":14},"stintLaps":14,"stint":2,"pitStops":1},
  {"number":1,"code":"VER","position":2,"tyre":{"compound":"hard","ageInLaps":21},"stintLaps":8,"stint":2,"pitStops":1},
  {"number":16,"code":"LEC","position":3,"tyre":{"compound":"soft","ageInLaps":1},"stintLaps":1,"stint":3,"pitStops":2},
  {"number":55,"code":"SAI","position":20}
]'

tyre_screen="$(a_screen "$tyre_field" | render)"

# Compound, tyre age, Stint and pit count per Driver — and the age of a scrubbed set marked apart
# from the laps run in its Stint, which is the distinction this ticket exists to keep.
assert_equals "compound, tyre age, Stint and pit count render, and a fitted-used set is marked" \
  "$(
    cat <<'EOF'
medium 14 2 1
hard 21+ 2 1
soft 1 3 2
unknown - - -
EOF
  )" \
  "$(tyres <<<"$tyre_screen")"

# The distinction stated once more, on its own, so a future change that starts drawing tyre age as
# Stint laps fails here rather than passing quietly: VER's twenty-one is the rubber's age, not the
# eight laps this Stint has run.
assert_contains "a tyre fitted with laps already on it shows its true age, marked as fitted used" \
  '<span class="cell--figure tyre-age" data-fitted-used="true">21</span>' \
  "$tyre_screen"

# A compound change mid-Session is a new Session state rendered, not a reload: the screen is a
# function of the state it is given, so the same Driver on a new compound simply draws the new one.
before='[{"number":16,"code":"LEC","position":3,"tyre":{"compound":"medium","ageInLaps":18},"stintLaps":18,"stint":1,"pitStops":0}]'
after='[{"number":16,"code":"LEC","position":3,"tyre":{"compound":"soft","ageInLaps":0},"stintLaps":0,"stint":2,"pitStops":1}]'

assert_equals "a compound change is reflected on the next state, without a reload" \
  "medium soft" \
  "$(
    printf '%s %s' \
      "$(tyres < <(a_screen "$before" | render) | awk '{print $1}')" \
      "$(tyres < <(a_screen "$after" | render) | awk '{print $1}')"
  )"

# --- Driver state and position change against the grid (#12) ----------------------------------

# Each row's state read two ways: the row's own data-state, which carries the whole treatment, and
# the worded chip, which repeats it — "-" for on track, the state that wears no chip.
row_states() {
  python3 -c '
import re, sys
for row in re.findall(r"<div class=\"driver-row\".*?</div>", sys.stdin.read(), re.S):
    state = re.search(r"<div class=\"driver-row\" data-state=\"([a-z-]+)\"", row).group(1)
    chip = re.search(r"<span class=\"state-chip\" data-state=\"[a-z-]+\">([^<]*)</span>", row)
    print(state, chip.group(1) if chip else "-")
'
}

# The change against the grid slot, with its direction: the direction the colour is drawn from and
# the places themselves, with the level mark read as ".".
position_change() {
  python3 -c '
import re, sys
for row in re.findall(r"<div class=\"driver-row\".*?</div>", sys.stdin.read(), re.S):
    found = re.search(r"<span class=\"position-change\" data-direction=\"([a-z]+)\">([^<]*)</span>", row)
    print(found.group(1), found.group(2).replace("&middot;", ".").replace("&minus;", "-"))
'
}

# Built here on purpose: one Driver in each state, and grid slots chosen so the change is a gain, a
# loss and level — SAI has retired and the feed no longer places them, so there is no change to draw.
state_field='[
  {"number":81,"code":"PIA","position":1,"gridPosition":1},
  {"number":1,"code":"VER","position":2,"gridPosition":3},
  {"number":16,"code":"LEC","position":8,"gridPosition":5,"state":"out-lap"},
  {"number":14,"code":"ALO","position":11,"gridPosition":6,"state":"pit-lane"},
  {"number":63,"code":"RUS","position":12,"gridPosition":5,"state":"in-box"},
  {"number":55,"code":"SAI","gridPosition":9,"state":"retired"}
]'

state_screen="$(a_screen "$state_field" | render)"

# Every state the spec names is distinguishable: on track quietly, the four exceptions chipped, so a
# stationary car in the box is never read as a slow one on track.
assert_equals "each Driver state is drawn distinctly, on track carrying no chip" \
  "$(
    cat <<'EOF'
on-track -
on-track -
out-lap Out
pit-lane Pit
in-box Box
retired Ret
EOF
  )" \
  "$(row_states <<<"$state_screen")"

# Position change against the grid, with direction: a gain, two column of losses, and the level mark
# where there is no change to draw.
assert_equals "position change is drawn against the grid slot, with its direction" \
  "$(
    cat <<'EOF'
none .
gain +1
loss -3
loss -5
loss -7
none .
EOF
  )" \
  "$(position_change <<<"$state_screen")"

# A retired Driver is unmistakable and does not read as merely slow: the row wears the retired state
# and the feed no longer places them, so the position is the absent mark rather than a last-known
# number that would read as a car still running, only slowly.
assert_contains "a retired Driver's row is marked retired, not left looking slow" \
  '<div class="driver-row" data-state="retired"' \
  "$state_screen"

assert_contains "a retired Driver is no longer placed, so their position reads as absent" \
  '<span class="position absent">&mdash;</span>' \
  "$state_screen"

# A Driver who retires mid-Session transitions rather than freezing: the same Driver rendered from a
# running state and then a retired one changes state, because the row is a function of the state.
running='[{"number":55,"code":"SAI","position":9,"gridPosition":9}]'
gone='[{"number":55,"code":"SAI","state":"retired","gridPosition":9}]'

assert_equals "a Driver who retires mid-Session transitions rather than freezing in place" \
  "on-track retired" \
  "$(
    printf '%s %s' \
      "$(row_states < <(a_screen "$running" | render) | awk '{print $1}')" \
      "$(row_states < <(a_screen "$gone" | render) | awk '{print $1}')"
  )"

finish
