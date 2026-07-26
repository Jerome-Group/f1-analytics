#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The Adapter is a boundary, and a boundary nobody checks is a convention. ADR-0003's claim that
# the data source can be changed without reaching the views rests entirely on OpenF1's field
# names stopping in server/openf1/ — so the claim is checked here rather than remembered.
#
# The test is spelling. Upstream speaks snake_case and this project speaks camelCase, so an
# upstream name is recognisable wherever it has been carried to, including into one that was
# renamed but not translated.
#
# TypeScript only, deliberately. Prose about the boundary naturally names a field on the other
# side of it — `web/design-system/tokens/teams.css` says where the team colours came from — and
# naming one is not carrying one, exactly as `CODING_STANDARDS.md` already allows for `docker`.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

repo_root="$(cd -- "$here/.." && pwd)"
adapter="server/openf1"

# Paths come out repo-relative, which is what the assertions below compare against. grep exits
# non-zero when it matches nothing, and nothing is the passing case, so the exit is left for the
# command substitution to discard rather than swallowed with a `|| true` that would also hide a
# `cd` that failed.
snake_case_in() {
  (
    cd -- "$repo_root" || return
    grep -rEn --include='*.ts' '\b[a-z][a-z0-9]*(_[a-z0-9]+)+\b' "$@"
  )
}

assert_equals "no upstream field name above the Adapter" "" \
  "$(snake_case_in domain server web | grep -v "^$adapter/")"

# Without this the assertion above passes just as happily on the day somebody deletes the Adapter
# and the names it was keeping in.
assert_contains "the Adapter still speaks upstream's language" \
  "driver_number" "$(snake_case_in "$adapter")"

# `domain/` is imported by both sides, so anything it reaches for, both sides carry. It depends on
# nothing — not on the Adapter, not on Node, not on a package.
assert_equals "domain/ imports nothing outside itself" "" \
  "$(
    cd -- "$repo_root" || exit
    grep -rEn "from '[^.]|from '\.\./" domain
  )"

finish
