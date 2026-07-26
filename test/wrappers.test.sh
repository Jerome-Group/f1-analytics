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
  env "$unmounted" "$@" 2>&1
}

# Each wrapper is invoked the way it is meant to be invoked — bin/backfill answers a usage error
# from its arguments alone, so an argument-less call would never reach the placement check.
refuses_before_reaching_the_runtime() {
  local wrapper="$bin/$1"
  shift

  assert_fails "bin/$(basename -- "$wrapper") refuses when the external volume is not mounted" \
    refusal "$wrapper" "$@"

  assert_contains \
    "bin/$(basename -- "$wrapper") names the volume rather than reporting a container error" \
    "/Volumes/NotMounted is not mounted" \
    "$(refusal "$wrapper" "$@")"
}

refuses_before_reaching_the_runtime up
refuses_before_reaching_the_runtime down
refuses_before_reaching_the_runtime compose
refuses_before_reaching_the_runtime backfill 2025 1267 9920
refuses_before_reaching_the_runtime catalogue 2025

finish
