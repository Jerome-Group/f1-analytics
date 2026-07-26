#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The catalogue is a season, and a season is one number. Anything else has to be an argument error
# at the prompt rather than a scrape of the wrong year.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

catalogue="$here/../bin/catalogue"

# The volume is deliberately absent: a usage error is answered from the arguments alone, before
# anything asks where the runtime lives.
misuse() {
  env F1_RUNTIME_HOME=/Volumes/NotMounted/.runtime "$catalogue" "$@" 2>&1
}

assert_fails "bin/catalogue with no arguments" misuse
assert_fails "bin/catalogue with a year that is not a year" misuse zandvoort
assert_fails "bin/catalogue with a Session as well as a year" misuse 2025 9920

assert_contains "bin/catalogue with no arguments says what it takes" \
  "bin/catalogue <year>" \
  "$(misuse)"

assert_contains "bin/catalogue names the argument that is wrong" \
  "zandvoort" \
  "$(misuse zandvoort)"

# An empty argument is not a year, and `*[!0-9]*` does not match it. The year reaches MongoDB as
# an interpolated literal, so an empty one has to be refused here rather than become a syntax
# error in somebody else's database — and refused as a usage error, which is the only failure that
# does not depend on the volume being absent.
assert_contains "bin/catalogue refuses an empty year as a usage error" \
  "is not a year" \
  "$(misuse "")"

# A Session key looks like a plausible second argument and is not one — the catalogue is
# per-season, and taking a Session here would mean re-scraping the whole season for each of them.
assert_contains "bin/catalogue says a Session is not its unit" \
  "bin/catalogue <year>" \
  "$(misuse 2025 9920)"

finish
