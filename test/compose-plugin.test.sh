#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Installing the plugin is the one step that downloads seventy megabytes, so it is the one step
# that can quietly put them on the internal disk (ADR-0004).
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

runtime_home="$(mktemp -d)"
export F1_RUNTIME_HOME="$runtime_home"

# shellcheck source=../bin/lib/placement.sh
source "$here/../bin/lib/placement.sh"
# shellcheck source=../bin/lib/compose-plugin.sh
source "$here/../bin/lib/compose-plugin.sh"

assert_equals "the plugin is installed under the runtime home, not in the home directory" \
  "$runtime_home/docker/cli-plugins/docker-compose" \
  "$F1_COMPOSE_PLUGIN"

download="$(f1_compose_download_dir)"
assert_contains "the download lands in the runtime home rather than in \$TMPDIR" \
  "$runtime_home/" \
  "$download"
rmdir "$download"

rm -rf "$runtime_home"
finish
