# shellcheck shell=bash
# Where this project's container runtime, its virtual machine and every byte it writes live.
# Sourced by each wrapper in bin/; nothing here reaches the runtime.
#
# `COLIMA_HOME` and `DOCKER_CONFIG` are the whole mechanism: they are why placement is enforced
# by a script rather than remembered by a person, and why a bare `docker` command — which would
# read the defaults in the home directory, on the internal disk, and appear to work — is a bug
# here (ADR-0004).

F1_REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

# Beside the repository rather than inside it: `git clean -xdf` in a working tree that contained
# the virtual machine's disk would destroy it.
F1_RUNTIME_HOME="${F1_RUNTIME_HOME:-$(dirname -- "$F1_REPO_ROOT")/.runtime}"

export COLIMA_HOME="$F1_RUNTIME_HOME/colima"
export DOCKER_CONFIG="$F1_RUNTIME_HOME/docker"

# Beside the runtime rather than inside it: the Archive outlives any virtual machine, and a
# `colima delete` must not be able to take fifteen gigabytes of unrepeatable download with it.
F1_ARCHIVE_HOME="${F1_ARCHIVE_HOME:-$(dirname -- "$F1_REPO_ROOT")/.archive}"

F1_COLIMA_PROFILE="f1-live-analytics"
F1_OPENF1_CHECKOUT="$F1_RUNTIME_HOME/openf1"

# The physical disk backing a path, whether or not the path exists yet. Comparing mount points
# instead would not do: macOS splits the boot disk into a read-only system volume at `/` and a
# data volume at `/System/Volumes/Data`, so `/Users/...` is on a different volume from `/` while
# being on the same internal disk — which is the thing that must not be written to.
f1_disk_of() {
  local path="$1"
  while [ ! -e "$path" ] && [ "$path" != "/" ]; do
    path="$(dirname -- "$path")"
  done
  df -P -- "$path" | awk 'NR == 2 { print $1 }' | sed -E 's|^(/dev/disk[0-9]+).*|\1|'
}

# The volume the runtime home is meant to be on, named by the path itself.
f1_intended_volume() {
  case "$F1_RUNTIME_HOME" in
    /Volumes/*/*) printf '%s' "$F1_RUNTIME_HOME" | cut -d/ -f1-3 ;;
    *) printf '' ;;
  esac
}

f1_require_external_volume() {
  local intended
  intended="$(f1_intended_volume)"

  if [ -n "$intended" ] && [ ! -d "$intended" ]; then
    cat >&2 <<EOF
$intended is not mounted.

This project keeps its container runtime, its virtual machine and all of its data on that
volume and nowhere else (docs/adr/0004). Mount it and run this again.
EOF
    return 1
  fi

  if [ "$(f1_disk_of "$F1_RUNTIME_HOME")" = "$(f1_disk_of /)" ]; then
    cat >&2 <<EOF
$F1_RUNTIME_HOME is on the internal disk.

Nothing this project installs may land on the internal disk (docs/adr/0004). Set
F1_RUNTIME_HOME to a path on an external volume, or unset it to use the default beside the
repository.
EOF
    return 1
  fi
}

f1_ensure_runtime_home() {
  f1_require_external_volume || return 1
  mkdir -p "$COLIMA_HOME" "$DOCKER_CONFIG"
}
