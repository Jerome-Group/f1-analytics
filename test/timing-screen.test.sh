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

finish
