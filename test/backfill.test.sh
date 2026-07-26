#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Backfilling names a Session, and a Session is three keys. Getting one of them wrong has to be
# an argument error at the prompt, not an hour of ingesting the wrong Session.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

backfill="$here/../bin/backfill"

# The volume is deliberately absent: a usage error is answered from the arguments alone, before
# anything asks where the runtime lives.
misuse() {
  env F1_RUNTIME_HOME=/Volumes/NotMounted/.runtime "$backfill" "$@" 2>&1
}

assert_fails "bin/backfill with no arguments" misuse
assert_fails "bin/backfill with a Meeting but no Session" misuse 2025 1267
assert_fails "bin/backfill with a Session key that is not a key" misuse 2025 1267 monza
assert_fails "bin/backfill with more than a Session" misuse 2025 1267 9920 laps

# `*[!0-9]*` does not match an empty argument, and the Session key reaches MongoDB as an
# interpolated literal. A usage error is the only failure here that does not depend on the volume
# being absent, so it is what the assertion looks for.
assert_contains "bin/backfill refuses an empty Session key as a usage error" \
  "is not a key" \
  "$(misuse 2025 1267 "")"

assert_contains "bin/backfill with no arguments says what it takes" \
  "bin/backfill <year> <meeting-key> <session-key>" \
  "$(misuse)"

assert_contains "bin/backfill names the argument that is wrong" \
  "monza" \
  "$(misuse 2025 1267 monza)"

finish
