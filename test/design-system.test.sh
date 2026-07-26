#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The density budget is the design. Twenty-five columns and twenty rows either fit inside
# 2560 x 1440 or the screen is unreadable, and a row that lays out against a different track
# list than its header is the failure this project was warned about: plausible on screen and
# wrong. Both are arithmetic, so both are checked here rather than noticed during a Session.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

design="$here/../web/design-system"

# --- The budget fits ---------------------------------------------------------------------

budget() {
  python3 - "$design/tokens/layout.css" "$1" <<'PY'
import re, sys

css = open(sys.argv[1]).read()
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def token(name):
    return int(re.search(rf"--{name}:\s*(\d+)", css).group(1))


tracks = [int(px) for px in re.findall(r"(\d+)px", re.search(r"--row-columns:(.*?);", css, re.S).group(1))]

width = sum(tracks) + (len(tracks) - 1) * token("column-gap") + 2 * token("screen-pad")
height = token("strip-height") + token("header-height") + token("row-count") * token("row-height")

print({
    "columns": len(tracks),
    "width": width,
    "screen-width": token("screen-width"),
    "height": height,
    "screen-height": token("screen-height"),
}[sys.argv[2]])
PY
}

assert_equals "the row is twenty-five columns wide" "25" "$(budget columns)"
assert_at_most "the columns fit the screen width" "$(budget screen-width)" "$(budget width)"
assert_at_most "the strip and twenty rows fit the screen height" \
  "$(budget screen-height)" "$(budget height)"

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

for page in "$design/components/driver-row/driver-row.html" "$design/timing-screen.html"; do
  assert_equals "every row in $(basename "$page") has twenty-five cells" \
    "25" "$(cells_per_row "$page")"
done

# --- Colour lives in tokens/, and nowhere else --------------------------------------------
#
# A literal colour in a component is the drift the token files exist to prevent: it is invisible
# in review and it is the one thing that cannot be corrected in one place.

literals="$(grep -rEn '#[0-9a-fA-F]{3,8}\b' "$design" --include='*.css' --include='*.html' |
  grep -v '/tokens/' || true)"

assert_equals "no colour literal outside tokens/" "" "$literals"

# --- Every Driver state the spec names is drawn ------------------------------------------

for state in on-track out-lap pit-lane in-box retired; do
  assert_contains "the Driver row draws the $state state" \
    "$state" "$(grep -o "data-state=\"$state\"" "$design/components/driver-row/driver-row.html" | head -1)"
done

finish
