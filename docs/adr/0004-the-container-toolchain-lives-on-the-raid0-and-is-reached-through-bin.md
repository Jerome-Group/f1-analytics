# The container toolchain lives on the RAID0 and is reached only through `bin/`

Nothing this project installs may land on the internal disk — not the container runtime, not its
virtual machine, not MongoDB's data, not the FastF1 cache. The constraint is the Organisation's,
it is not negotiable, and it is not something a reader can infer from a compose file.

On macOS a Linux container cannot run natively; something has to run a Linux virtual machine, and
Docker Desktop is one such virtual machine with a graphical interface around it. This machine
already has **Colima** and no Docker Desktop — the `docker` binary present is the client alone,
with no daemon, which is why `docker compose` reports an unknown command. So Colima is not chosen
over Docker; Colima is what Docker *is* here.

It is also the better fit for the constraint. Docker Desktop relocates its storage through a
setting in a preferences window, which is a thing a person remembers or forgets. Colima reads
**`COLIMA_HOME`**, and the Docker CLI reads **`DOCKER_CONFIG`** — both environment variables, both
settable by a script. That makes the placement enforceable rather than remembered, and it is the
same shape as the Organisation's `bin/tf`, which relocates `HOME` for exactly this reason.

Hence the rule: **the runtime is never invoked directly.** Every container command goes through a
wrapper in `bin/` that sets both variables first. A bare `docker compose up` in this repository is
a bug, because it will silently use the default profile on the internal disk and appear to work.

A dedicated Colima profile is created rather than reusing the existing `torrent` one, which sits
under `~/.colima` on the internal disk with a 20 GiB cap — the wrong disk and, against a backfilled
season, the wrong size. The new profile is provisioned at **250 GiB sparse, 8 GiB RAM, 4 CPU**;
sparse means the disk consumes only what is written, so the figure is a ceiling rather than a
reservation.

## Consequences

- **Nothing runs when the RAID0 is not mounted.** The virtual machine's disk is on it. This is
  correct behaviour rather than a fault, and the failure should say so plainly instead of
  appearing as a container error.
- **`bin/` is a required interface, not a convenience.** Any command that reaches the runtime
  belongs there. Documentation that tells a reader to run `docker` directly is wrong and should be
  treated as such in review.
- **A bare `colima` or `docker` command sees none of this and reports empty.** They read
  `~/.colima` and `~/.docker`; the instance and its config live under the RAID0 `COLIMA_HOME` and
  `DOCKER_CONFIG`. So `colima list` printing "no instance found", or `docker ps` printing nothing,
  is *not* evidence the stack is down — it is evidence the query skipped the wrapper that sets the
  variables. This false negative is the read-side twin of the silent-wrong-disk bug above, and it
  is how a reader talks themselves into a needless `bin/up`. The honest status check is
  `bin/compose ps`.
- **The existing `torrent` profile is untouched and stays on the internal disk.** Fixing it is out
  of scope here; a different `COLIMA_HOME` gives a wholly separate set of profiles, so the two
  cannot collide.
- **The compose plugin has to be installed before anything works at all**, under the RAID0
  `DOCKER_CONFIG` rather than through Homebrew, which would put it in the home directory.
- **A container runtime on an external volume is a real dependency on that volume staying
  present.** An unmount or a sleep with the drive detached will take MongoDB down mid-session.

## Revisit when

- The runtime is replaced. OrbStack is materially faster and also supports a custom data location;
  the rule that placement is set by a wrapper survives the swap, only the variable names change.
- A second project on this machine wants the same profile. Sharing one is fine; sharing it by
  accident, because two repositories both defaulted to it, is not.
