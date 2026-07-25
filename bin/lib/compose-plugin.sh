# shellcheck shell=bash
# The `docker compose` plugin, installed under this project's own `DOCKER_CONFIG`.
#
# Homebrew would put it in the home directory, on the internal disk, and would hand it to every
# other project on this machine at whatever version it happened to have (ADR-0004). Sourced;
# requires placement.sh.

F1_COMPOSE_VERSION="v5.3.1"
F1_COMPOSE_PLUGIN="$DOCKER_CONFIG/cli-plugins/docker-compose"

f1_compose_asset() {
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) printf 'docker-compose-darwin-aarch64' ;;
    Darwin-x86_64) printf 'docker-compose-darwin-x86_64' ;;
    *)
      printf 'These wrappers run containers in a Colima virtual machine and are macOS-only.\n' >&2
      return 1
      ;;
  esac
}

# Downloads land in the runtime home. `mktemp -d` on its own would use $TMPDIR, which is on the
# internal disk — a seventy-megabyte write to exactly the place this project may not write to.
f1_compose_download_dir() {
  mktemp -d "$F1_RUNTIME_HOME/compose-plugin.XXXXXX"
}

f1_compose_plugin_is_current() {
  [ -x "$F1_COMPOSE_PLUGIN" ] &&
    [ "$("$F1_COMPOSE_PLUGIN" version --short 2>/dev/null)" = "${F1_COMPOSE_VERSION#v}" ]
}

f1_ensure_compose_plugin() {
  f1_compose_plugin_is_current && return 0

  local asset url download
  asset="$(f1_compose_asset)" || return 1
  url="https://github.com/docker/compose/releases/download/$F1_COMPOSE_VERSION/$asset"
  download="$(f1_compose_download_dir)"

  printf 'Installing docker compose %s into %s\n' \
    "$F1_COMPOSE_VERSION" "$(dirname -- "$F1_COMPOSE_PLUGIN")"
  curl --fail --silent --show-error --location --output "$download/$asset" "$url"
  curl --fail --silent --show-error --location --output "$download/$asset.sha256" "$url.sha256"

  if (cd "$download" && shasum --algorithm 256 --check --status "$asset.sha256"); then
    mkdir -p "$(dirname -- "$F1_COMPOSE_PLUGIN")"
    install -m 755 "$download/$asset" "$F1_COMPOSE_PLUGIN"
    rm -rf "$download"
  else
    rm -rf "$download"
    printf 'The downloaded docker compose plugin does not match its published checksum.\n' >&2
    return 1
  fi
}
