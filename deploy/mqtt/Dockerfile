# The stock broker carrying this project's configuration.
#
# Baked in rather than bind-mounted because the virtual machine cannot see this repository at
# all: Lima writes host mounts into the guest's fstab without escaping, and this repository's
# path contains a space, so the mount silently never happens (ADR-0007). A build context is
# streamed to the daemon instead of mounted, so it has no such problem.
FROM eclipse-mosquitto:2.0.22

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
