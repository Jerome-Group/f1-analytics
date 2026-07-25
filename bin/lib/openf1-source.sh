# shellcheck shell=bash
# The upstream Ingestor's source: checked out beside the repository, at the commit pinned in
# deploy/upstream.env, and built there. Sourced; requires placement.sh.
#
# It is fetched rather than pulled as an image because upstream publishes none, and it is kept
# outside this working tree because no line of it may be committed here (ADR-0003, ADR-0006).

# shellcheck source-path=SCRIPTDIR
# shellcheck source=../../deploy/upstream.env
source "$F1_REPO_ROOT/deploy/upstream.env"

# The tag names the pin, so a changed pin is a different image rather than a silently reused one.
F1_OPENF1_IMAGE="f1-live-analytics/openf1:$(printf '%s' "$OPENF1_COMMIT" | cut -c1-12)"

f1_ensure_openf1_checkout() {
  if [ ! -d "$F1_OPENF1_CHECKOUT/.git" ]; then
    printf 'Fetching the upstream Ingestor into %s\n' "$F1_OPENF1_CHECKOUT"
    git clone --quiet "$OPENF1_REPOSITORY" "$F1_OPENF1_CHECKOUT"
  fi

  [ "$(git -C "$F1_OPENF1_CHECKOUT" rev-parse HEAD)" = "$OPENF1_COMMIT" ] && return 0

  git -C "$F1_OPENF1_CHECKOUT" fetch --quiet origin
  git -C "$F1_OPENF1_CHECKOUT" checkout --quiet --detach "$OPENF1_COMMIT"
}
