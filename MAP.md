# Map

A dashboard for watching a live Formula 1 session, fed by a self-hosted data pipeline.

Start here: `README.md`, then `AGENTS.md`. The design is recorded before the code exists — read
`CONTEXT.md` for the vocabulary and `docs/adr/` for why the shape is the shape.

| Area | What lives there | Entry point |
|------|------------------|-------------|
| The Archive | Mirrors what Formula 1 publishes, raw. Depends on nothing else here, and is the only data that cannot be rebuilt | `archive/`, `bin/archive` |
| The pipeline | The self-hosted OpenF1 stack. Upstream software, run here and never vendored | `deploy/` |
| The backend | MQTT subscriber, canonical session state, the WebSocket the browser reads | `server/` |
| The dashboard | The timing screen | `web/` |
| Shared types | The canonical model, imported by both `server/` and `web/` | `domain/` |
| Analysis mode | Deferred. Offline FastF1 work; the dashboard never calls it | `analysis/` |
| Running anything | Wrappers that place the container runtime and its data on the external volume. **The runtime is never invoked directly** | `bin/up`, `bin/down`, `bin/compose`, `bin/backfill` |
| Tests | One file per unit under test, run by a script with no dependencies to install | `test/run` |
| Working here | Agent + contributor conventions, commit/attribution rules | `AGENTS.md` (= `CLAUDE.md`) |
| Code standards | How code is written and reviewed | `CODING_STANDARDS.md` |
| Domain language | The glossary — this repository's ubiquitous language | `CONTEXT.md` |
| Decisions | Architecture decision records | `docs/adr/` |
| Measurements | What the running system costs, measured rather than estimated | `docs/measurements/` |
| Agent skills | The routines an agent follows here, one file per skill | `docs/agents/` |
| Automation | The workflows that run on a pull request, and dependency updates | `.github/` |

`archive/`, `bin/`, `deploy/` and `test/` exist. The rest do not yet — they are where the code
goes, recorded here so the first pull request that creates one is placing it rather than
inventing it.

The runtime itself lives *outside* this repository, in `.runtime/` beside it on the same volume:
the virtual machine, the Docker CLI's configuration, and the upstream checkout. The Archive is in
`.archive/`, beside both — outside the runtime because it outlives any virtual machine, and
outside the working tree because it is Formula 1's data. Nothing in either is committed, and
nothing in either is on the internal disk.

Update this file in the same pull request whenever a top-level area is added, moved, or removed.
