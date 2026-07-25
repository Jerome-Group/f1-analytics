#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The wrappers refuse before they reach the runtime, so a missing external volume reads as a
# missing external volume rather than as a container error twenty seconds later.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

bin="$here/../bin"
unmounted="F1_RUNTIME_HOME=/Volumes/NotMounted/.runtime"

refusal() {
  env "$unmounted" "$1" 2>&1
}

refuses() {
  env "$unmounted" "$1" >/dev/null 2>&1
}

for wrapper in up down compose; do
  assert_fails "bin/$wrapper refuses when the external volume is not mounted" \
    refuses "$bin/$wrapper"

  assert_contains "bin/$wrapper names the volume rather than reporting a container error" \
    "/Volumes/NotMounted is not mounted" \
    "$(refusal "$bin/$wrapper")"
done

finish
