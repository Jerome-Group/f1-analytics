# shellcheck shell=bash
# The virtual machine this project's containers run in. Sourced; requires placement.sh.
#
# A dedicated profile rather than the machine's existing `torrent` one, which is capped at 20 GiB
# — the wrong size against a backfilled season. `COLIMA_HOME` already puts this profile in a
# wholly separate set, so the two cannot collide (ADR-0004).

F1_COLIMA_CPUS=4
F1_COLIMA_MEMORY=8
# GiB, and sparse: the disk consumes only what is written, so this is a ceiling and not a
# reservation.
F1_COLIMA_DISK=250

f1_vm_is_running() {
  colima status --profile "$F1_COLIMA_PROFILE" >/dev/null 2>&1
}

f1_start_vm() {
  f1_vm_is_running && return 0
  # No host directory is mounted, and none can be: Lima writes mounts into the guest's fstab
  # without escaping, and this repository's path contains a space (ADR-0007). Everything the
  # stack writes goes to a named volume inside this machine's disk, which is on the external
  # volume already.
  colima start \
    --profile "$F1_COLIMA_PROFILE" \
    --cpus "$F1_COLIMA_CPUS" \
    --memory "$F1_COLIMA_MEMORY" \
    --disk "$F1_COLIMA_DISK" \
    --vm-type vz \
    --mount none
}

f1_stop_vm() {
  f1_vm_is_running || return 0
  colima stop --profile "$F1_COLIMA_PROFILE"
}

f1_require_vm() {
  f1_vm_is_running && return 0
  printf 'The %s virtual machine is not running. Start the stack with bin/up.\n' \
    "$F1_COLIMA_PROFILE" >&2
  return 1
}
