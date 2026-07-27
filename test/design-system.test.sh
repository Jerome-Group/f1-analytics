#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The density budget is the design. Twenty-five columns and a full grid either fit inside
# 2560 x 1440 or the screen is unreadable, and a row that lays out against a different track
# list than its header is the failure this project was warned about: plausible on screen and
# wrong. Both are arithmetic, so both are checked here rather than noticed during a Session.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

design="$here/../web/design-system"

# --- The budget fits ---------------------------------------------------------------------

read -r columns width screen_width height screen_height < <(
  python3 - "$design/tokens/layout.css" <<'PY'
import re, sys

css = re.sub(r"/\*.*?\*/", "", open(sys.argv[1]).read(), flags=re.S)


def token(name):
    return int(re.search(rf"--{name}:\s*(\d+)", css).group(1))


tracks = [int(px) for px in re.findall(r"(\d+)px", re.search(r"--row-columns:(.*?);", css, re.S).group(1))]

print(
    len(tracks),
    sum(tracks) + (len(tracks) - 1) * token("column-gap") + 2 * token("screen-pad"),
    token("screen-width"),
    token("strip-height") + token("header-height") + token("row-capacity") * token("row-height"),
    token("screen-height"),
)
PY
)

assert_equals "the row is twenty-five columns wide" "25" "$columns"
assert_at_most "the columns fit the screen width" "$screen_width" "$width"
assert_at_most "the strip and the whole field fit the screen height" "$screen_height" "$height"

# The field is twenty-two for 2026 and was twenty before it, so the running screen draws whatever
# the Session carries and knows no number at all (test/timing-screen.test.sh). The specimen is
# the other case: it is drawn at capacity deliberately, because a full grid is the one that has
# to fit, and a specimen a row short of the budget would fit while the real screen did not.
assert_equals "the specimen is drawn at the capacity the budget is drawn for" \
  "$(grep -c 'class="driver-row"' "$design/timing-screen.html")" \
  "$(grep -oE -- '--row-capacity: *[0-9]+' "$design/tokens/layout.css" | grep -oE '[0-9]+')"

# --- Every row lays out against the same track list --------------------------------------

cells_per_row() {
  python3 - "$1" <<'PY'
import re, sys

html = open(sys.argv[1]).read()
html = re.sub(r"<!--.*?-->", "", html, flags=re.S)

# One cell per line is the shape both the header and every row are written in, so a row
# that has gained or lost a column is a line count that no longer matches the track list.
rows = re.findall(r'<div class="(?:driver-row|driver-row-header)"[^>]*>(.*?)\n\s*</div>', html, re.S)
widths = sorted({len(re.findall(r"^\s*<span\b", body, re.M)) for body in rows})
print(",".join(str(n) for n in widths) if rows else "no rows found")
PY
}

component_row="$design/components/driver-row/driver-row.html"
screen="$design/timing-screen.html"

for page in "$component_row" "$screen"; do
  assert_equals "every row in $(basename "$page") has twenty-five cells" \
    "25" "$(cells_per_row "$page")"
done

# The header exists in two static pages and cannot include itself into both. It can at least be
# held identical, so a column renamed or reordered in one is not silently right in the other.
header() {
  python3 -c "
import re, sys
print(re.search(r'<div class=\"driver-row-header\">.*?</div>', open(sys.argv[1]).read(), re.S).group())
" "$1"
}

assert_equals "the screen's header is the Driver row's header, to the character" \
  "$(header "$component_row")" "$(header "$screen")"

# --- Values live in tokens/, and nowhere else ---------------------------------------------
#
# A literal in a component is the drift the token files exist to prevent: it is invisible in
# review, and it is the one thing that cannot be corrected in one place.

literals="$(grep -rEn '#[0-9a-fA-F]{3,8}\b' "$design" --include='*.css' --include='*.html' |
  grep -v '/tokens/' || true)"

assert_equals "no colour literal outside tokens/" "" "$literals"

dimensions="$(grep -rEn '\b(2560|1440)px' "$design" --include='*.css' --include='*.html' |
  grep -v '/tokens/' || true)"

assert_equals "no screen dimension restated outside tokens/" "" "$dimensions"

# --- The liveries the feed knows about, and nothing else ----------------------------------
#
# A team token referenced but never defined is a Driver with no colour on their row, and it is
# invisible until that constructor is on the grid. The 2026 field arriving with Audi and Cadillac
# is what this exists for.

undefined="$(python3 - "$design" <<'PY'
import pathlib, re, sys

design = pathlib.Path(sys.argv[1])
defined = set(re.findall(r"^\s*(--team-[a-z-]+):", (design / "tokens/teams.css").read_text(), re.M))
referenced = set()
for f in list(design.rglob("*.css")) + list(design.rglob("*.html")):
    referenced |= set(re.findall(r"var\((--team-[a-z-]+)", f.read_text()))
print("\n".join(sorted(referenced - defined)))
PY
)"

assert_equals "every team colour a row asks for is defined" "" "$undefined"

# A state that repeats a livery is a bar and a chip the same colour on the same screen.
shared="$(python3 - "$design" <<'PY'
import pathlib, re, sys

design = pathlib.Path(sys.argv[1])


def colours(path, prefix):
    text = (design / path).read_text()
    return {m[0]: m[1].lower() for m in re.findall(rf"(--{prefix}[a-z-]+):\s*(#[0-9a-fA-F]{{6}})", text)}


teams = colours("tokens/teams.css", "team-")
states = colours("tokens/palette.css", "state-")
print("\n".join(f"{s} == {t}" for s, sc in states.items() for t, tc in teams.items() if sc == tc))
PY
)"

assert_equals "no Driver state repeats a livery" "" "$shared"

# --- The running page dresses every component the rows render -----------------------------
#
# The Driver row is drawn from several components, each with its own stylesheet. A component whose
# CSS the design system links but web/index.html does not is a row drawn with the browser's defaults
# — a sparkline as a filled black polygon rather than a line — and nothing else here catches it,
# because the markup is right and only the page that wears it is wrong.

page="$here/../web/index.html"

undressed="$(python3 - "$design/components/driver-row/driver-row.html" "$page" <<'PY'
import re, sys


def stylesheets(path):
    return set(re.findall(r'href="([^"]+\.css)"', open(path).read()))


# The component stylesheets the Driver row links, by file name, less the tokens every component
# imports and the preview.css that dresses only the design-system specimen.
def components(path):
    return {h.rsplit("/", 1)[-1] for h in stylesheets(path) if "/tokens/" not in h and not h.endswith("preview.css")}


print("\n".join(sorted(components(sys.argv[1]) - {h.rsplit("/", 1)[-1] for h in stylesheets(sys.argv[2])})))
PY
)"

assert_equals "web/index.html links a stylesheet for every component the Driver row is drawn from" \
  "" "$undressed"

# --- Every Driver state the spec names is drawn ------------------------------------------

for state in on-track out-lap pit-lane in-box retired; do
  assert_contains "the Driver row draws the $state state" \
    "$state" "$(grep -o "data-state=\"$state\"" "$design/components/driver-row/driver-row.html" | head -1)"
done

finish
