# Map

A dashboard for watching a live Formula 1 session, fed by a self-hosted data pipeline.

Start here: `README.md`, then `AGENTS.md`. The design is recorded before the code exists — read
`CONTEXT.md` for the vocabulary and `docs/adr/` for why the shape is the shape.

| Area | What lives there | Entry point |
|------|------------------|-------------|
| The Archive | Mirrors what Formula 1 publishes, raw. Depends on nothing else here, and is the only data that cannot be rebuilt | `archive/`, `bin/archive` |
| The pipeline | The self-hosted OpenF1 stack. Upstream software, run here and never vendored | `deploy/` |
| The backend | MQTT subscriber, canonical session state, the WebSocket the browser reads, and the page it reads it into | `server/` |
| The dashboard | The timing screen, the picker that chooses a Session to replay, and the design system they are built from — tokens, components, and the full-screen assembly that proves the density budget | `web/index.html`, `web/picker.html`, `web/design-system/` |
| Shared types | The canonical model, imported by both `server/` and `web/` | `domain/` |
| Analysis mode | Deferred. Offline FastF1 work; the dashboard never calls it | `analysis/` |
| Running anything | Wrappers that place the container runtime and its data on the external volume. **The runtime is never invoked directly** | `bin/up`, `bin/down`, `bin/compose`, `bin/backfill`, `bin/catalogue`, `bin/fixture` |
| Tests | One file per unit under test, run by a script with no dependencies to install. The recordings the tests replay are cut from a real Session by `bin/fixture` | `test/run`, `test/fixtures/` |
| Working here | Agent + contributor conventions, commit/attribution rules | `AGENTS.md` (= `CLAUDE.md`) |
| Code standards | How code is written and reviewed | `CODING_STANDARDS.md` |
| Domain language | The glossary — this repository's ubiquitous language | `CONTEXT.md` |
| Decisions | Architecture decision records | `docs/adr/` |
| Measurements | What the running system costs, measured rather than estimated | `docs/measurements/` |
| Agent skills | The routines an agent follows here, one file per skill | `docs/agents/` |
| Automation | The workflows that run on a pull request, and dependency updates | `.github/` |

Everything above exists except `analysis/`, which is where that code goes, recorded here so the
first pull request that creates it is placing it rather than inventing it.

`server/`, `domain/` and `web/` are TypeScript that Node runs as written: there is no build step
and no runtime dependency, and the one package in the repository is the type checker
(`docs/adr/0011`). `web/` is checked against a browser's globals rather than Node's, which is
what `tsconfig.web.json` is for; the browser is given it with the types stripped out on the way
past, so there is still nothing built.

The runtime itself lives *outside* this repository, in `.runtime/` beside it on the same volume:
the virtual machine, the Docker CLI's configuration, and the upstream checkout. Because the `bin/`
wrappers point `COLIMA_HOME` and `DOCKER_CONFIG` there rather than at `~`, a bare `colima list` or
`docker ps` sees nothing — an empty result is the query missing the wrapper, not the stack being
down. `bin/compose ps` is the honest check (ADR-0004). The Archive is in
`.archive/`, beside both — outside the runtime because it outlives any virtual machine, and
outside the working tree because it is Formula 1's data. Nothing in either is committed, and
nothing in either is on the internal disk.

Update this file in the same pull request whenever a top-level area is added, moved, or removed.
