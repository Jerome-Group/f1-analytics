# The upstream Ingestor is built here from a pinned commit, because nobody publishes it

[ADR-0003](0003-openf1-feeds-the-timing-screen-and-fastf1-feeds-analysis-mode.md) says upstream
changes are "pulled by image tag, not merged". There is no image tag to pull. OpenF1's own
`docker-compose.yml` builds from its working tree, and nothing is published to Docker Hub or to
GitHub Packages — checked, not assumed. So the *mechanism* in ADR-0003 does not exist, while the
rule it exists to serve — **deployed, never vendored** — still has to hold, because
[ADR-0005](0005-the-code-is-mit-and-the-system-it-runs-in-is-not.md) now leans on it to keep
ShareAlike away from MIT code.

The Ingestor is therefore cloned at a pinned commit into the runtime home *beside* this
repository, built there, and tagged with that commit. `deploy/upstream.env` holds the pin and is
the only trace of upstream in the tree; `bin/up` does the rest.

Two alternatives lose:

**Publishing our own image** to a registry means republishing somebody else's NonCommercial
software under this project's name, plus an account and a workflow to maintain, to save a build
that happens once and then caches.

**Vendoring the source** — a submodule, a subtree, a directory of copied files — is the exact
thing ADR-0003 and ADR-0005 forbid. A submodule is the tempting version because it *looks* like a
pin rather than a copy, but it commits an upstream tree object into this repository's history,
which is the distinction those two records turn on.

Cloning outside the tree keeps the pin explicit and the working tree clean: `git status` here
never sees a line of OpenF1, and moving upstream forward is a one-line change with its own pull
request.

## Consequences

- **The first `bin/up` on a clean machine needs the network and a few minutes**, because it clones
  and builds rather than pulling a layer. Every later run is cached.
- **The checkout is a working tree that nobody should edit.** It is not ignored by this
  repository's `.gitignore` — it is outside the repository entirely, which is stronger.
- **A pinned commit is not a reproducible build.** The Dockerfile installs from PyPI at build
  time, so two builds of the same pin can differ. Pinning the commit fixes *our* input, not
  upstream's.
- **The image tag carries the short commit**, so changing the pin produces a different image
  rather than silently reusing the old one under the same name.
- **ADR-0003's "pulled by image tag" is now inaccurate as written.** That record stands; this one
  supersedes the mechanism and leaves the rule it served intact.

## Revisit when

- Upstream publishes images. Then the pin becomes a tag, the clone and the build go away, and this
  record is superseded by one that says so.
- The build stops being cheap enough to run on a machine that is about to watch a Session — a
  fifteen-minute build before a race is a different trade-off from a one-minute one.
