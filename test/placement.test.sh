#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# What `bin/lib/placement.sh` promises: every path this project writes to is on the external
# volume, and a path that is not is refused by name rather than left to fail as a container error
# hours later (ADR-0004).
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

placement="$here/../bin/lib/placement.sh"
repo_root="$(cd -- "$here/.." && pwd)"

# Each case sources placement.sh in a subshell, so one case's overrides cannot reach the next.
# The single quotes are the point: the snippet is expanded by that subshell, not by this one.
# shellcheck disable=SC2016
placement_of() {
  local variable="$1"
  shift
  env "$@" bash -c 'source "$0" && eval "printf %s \"\$$1\""' "$placement" "$variable"
}

# shellcheck disable=SC2016
refusal() {
  env "$@" bash -c 'source "$0" && f1_require_external_volume' "$placement" 2>&1
}

refuses() {
  refusal "$@" >/dev/null 2>&1
}

assert_equals "the runtime home sits beside the repository, not inside it" \
  "$(dirname -- "$repo_root")/.runtime" \
  "$(placement_of F1_RUNTIME_HOME F1_RUNTIME_HOME=)"

assert_equals "the virtual machine lives under the runtime home" \
  "/external/.runtime/colima" \
  "$(placement_of COLIMA_HOME F1_RUNTIME_HOME=/external/.runtime)"

assert_equals "the Docker CLI's configuration lives under the runtime home" \
  "/external/.runtime/docker" \
  "$(placement_of DOCKER_CONFIG F1_RUNTIME_HOME=/external/.runtime)"

assert_equals "the upstream checkout lives under the runtime home, never in the repository" \
  "/external/.runtime/openf1" \
  "$(placement_of F1_OPENF1_CHECKOUT F1_RUNTIME_HOME=/external/.runtime)"

assert_equals "the Archive sits beside the repository, not inside it" \
  "$(dirname -- "$repo_root")/.archive" \
  "$(placement_of F1_ARCHIVE_HOME F1_ARCHIVE_HOME=)"

# The Archive has to survive the virtual machine being deleted — it is the half of the data that
# cannot be downloaded again, and `colima delete` must not be able to reach it.
assert_equals "the Archive is outside the runtime it outlives" \
  "$(dirname -- "$repo_root")/.archive" \
  "$(placement_of F1_ARCHIVE_HOME F1_ARCHIVE_HOME= F1_RUNTIME_HOME=/external/.runtime)"

assert_equals "the profile is this project's own, so the existing torrent one is untouched" \
  "f1-live-analytics" \
  "$(placement_of F1_COLIMA_PROFILE F1_RUNTIME_HOME=/external/.runtime)"

assert_equals "the home directory is on the same disk as the system, not merely the same volume" \
  "$(bash -c 'source "$0" && f1_disk_of /' "$placement")" \
  "$(bash -c 'source "$0" && f1_disk_of "$HOME"' "$placement")"

assert_fails "a runtime home on the internal disk is refused" \
  refuses "F1_RUNTIME_HOME=$HOME/.f1-runtime-that-does-not-exist"

assert_contains "the refusal says the internal disk is the reason" \
  "internal disk" \
  "$(refusal "F1_RUNTIME_HOME=$HOME/.f1-runtime-that-does-not-exist")"

assert_fails "an unmounted external volume is refused" \
  refuses "F1_RUNTIME_HOME=/Volumes/NotMounted/.runtime"

assert_contains "the refusal names the volume that is missing" \
  "/Volumes/NotMounted" \
  "$(refusal F1_RUNTIME_HOME=/Volumes/NotMounted/.runtime)"

assert_contains "the refusal says the volume is not mounted, not that a container failed" \
  "not mounted" \
  "$(refusal F1_RUNTIME_HOME=/Volumes/NotMounted/.runtime)"

finish
