# Containers read their configuration from a build context, and the virtual machine sees no host path at all

The obvious way to give Mosquitto its configuration is the way upstream does it — bind-mount a
directory from the repository into the container. It cannot work here, and the reason is worth
recording because the failure is silent and the error message points somewhere else entirely.

Lima writes each host mount into the guest's `/etc/fstab`. `fstab` is whitespace-delimited and
Lima does not escape, and this repository's path contains a space:

    lima-ca8c39c50183d1c2	/Volumes/RAID0/002 F1/f1-live-analytics/deploy	virtiofs	ro,nofail,…

The entry parses as a truncated path, `nofail` swallows the error, and the machine boots looking
healthy with the mount absent. Docker then does what it always does with a bind source that is not
there — creates it, as a directory — so a file mount fails with *"Are you trying to mount a
directory onto a file"*, naming a host file that exists and is a file. Nothing in that message
mentions a mount that never happened.

So no host path is mounted, and the virtual machine is started with `--mount none`, which also
drops Colima's default mount of the home directory. Configuration reaches a container by being
built into its image: a build context is streamed to the daemon rather than mounted, so none of
the above applies to it.

The alternatives were considered and are worse. **Renaming the directory** to remove the space
means renaming a volume whose whole convention is numbered names with spaces, to work around a bug
in one tool. **Symlinking a space-free path** and mounting that is a second placement rule to
remember, which is precisely what
[ADR-0004](0004-the-container-toolchain-lives-on-the-raid0-and-is-reached-through-bin.md) exists to
refuse. Both trade a permanent complication for the ability to edit a config file without a
rebuild.

`--mount none` has a second effect that is arguably the better half of this decision: with no host
path visible inside the machine, "nothing is written to the internal disk" stops being a
convention the wrappers uphold and becomes something the machine is structurally unable to do.

## Consequences

- **Changing a container's configuration means rebuilding its image.** `bin/up` builds, so it is
  one command rather than a separate step, but it is not a restart.
- **Nothing can be live-edited into a running container**, which rules out the usual trick of
  mounting source for a fast edit loop. Anything in `server/` or `web/` that wants one will have
  to run on the host, outside the machine.
- **Every future service that needs host data must bake it in or use a named volume.** There is no
  third option while this holds, and a pull request that adds a bind mount is wrong rather than
  merely unusual.
- **Data still lands correctly without a second rule**: named volumes live inside the machine's
  disk, which `COLIMA_HOME` already places on the external volume.

## Revisit when

- Lima escapes whitespace in the entries it writes, or Colima stops going through `fstab`. This is
  a bug being routed around, not a design position, and the routing should go when the bug does.
- This repository moves to a path with no space in it. That removes the cause, though not the
  `--mount none` benefit, which is worth keeping on its own terms.
