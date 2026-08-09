# AGENTS.md — f1-analytics

> Canonical instruction file for AI agents (Claude Code and others) working in this repo.
> `CLAUDE.md` is a symlink to this file, so the two can never drift.

## What this repo is

A dashboard for watching a live Formula 1 session — the official timing screen, expanded, with
all twenty drivers on screen at once and per-driver depth behind a toggle. It runs on one machine
for one viewer, against a self-hosted OpenF1 pipeline, and replays a past session through the same
views. It is not a hosted service, not telemetry analysis (that is deferred, `docs/adr/0003`), and
not affiliated with Formula 1. `README.md` is the long version and `CONTEXT.md` the vocabulary.

- **Visibility:** public
- **Organisation:** [Jerome-Group](https://github.com/Jerome-Group)

## Getting it running

Node runs the TypeScript as written — there is no build step, and the only package here is the
type checker (`docs/adr/0011`). `.nvmrc` names the Node this repository is run on, and it is the
same answer `bin/` and CI read.

    bin/up                        # api, live ingestor, MongoDB and Mosquitto, building what is missing
    bin/down                      # and the virtual machine with them, so the volume can be unplugged
    bin/compose ps                # the honest check on whether the stack is up

    bin/archive 2025              # mirror a season's raw files; 2025 1267 9920 for one session
    bin/catalogue 2025            # a season's meetings and sessions — names and clocks
    bin/backfill 2025 1267 9920   # one past session into the stores, whole
    bin/fixture                   # re-cut the committed test recording from the running stores

    node server/main.ts 9920      # the picker and replay of backfilled sessions, on :8080

    test/run                      # every test; installs nothing
    npm ci && npm run typecheck   # the type checker, a check rather than a build step
    shellcheck -x bin/* test/run test/*.test.sh   # what CI lints, minus bin/lib

The first `bin/up` clones and builds the upstream Ingestor and takes minutes; later runs take
about thirty seconds. The API is then on `localhost:8000` and the broker on `localhost:1883`.
Nothing is imported by `bin/up` — a past session arrives only through `bin/backfill`, one at a
time, and running it again for the same session replaces it (`docs/adr/0008`).

**Where these may be run:** on the machine holding the external volume this repository lives on,
and nowhere else. The container runtime, its virtual machine and every byte of data are placed
there by the `bin/` wrappers (`docs/adr/0004`); `.runtime/` and `.archive/` sit beside the working
tree, outside it and never committed. The Archive is the one thing here that cannot be rebuilt —
Formula 1 has already removed seasons from its own servers.

## Conventions

- Default branch: `main`.
- Domain glossary lives in `CONTEXT.md`; decisions are recorded as ADRs in `docs/adr/`.
- Keep secrets out of the repo. **Never commit a token.**
- **The container stack is invisible to bare `colima`/`docker`.** Its Colima instance keeps
  `COLIMA_HOME` and `DOCKER_CONFIG` on the RAID0, set by the `bin/` wrappers (ADR-0004), so a plain
  `colima list`, `docker ps` or `docker compose ps` reads `~/.colima`/`~/.docker` and shows
  nothing. **An empty result never means the stack is down** — it means the query skipped the
  wrapper. Check the real state with `bin/compose ps`; the stack may well already be up.

## Code standards

Code explains itself — full version in `CODING_STANDARDS.md`. In short: the burden is on the
code, not on docs. Write code an LLM can read and take from directly — self-explanatory names,
predictable file placement, small cohesive units, and the interface separated from the
implementation. Documentation (`docs/adr/`, `CONTEXT.md`) is only for what code *can't* say —
the *why* — never to explain what the code does. Every repo keeps a **required** `MAP.md` at
its root — a one-screen navigation map, updated in the same pull request as any top-level
change; it points at where things are, it never restates the code.

## How work flows

`CONTRIBUTING.md` is the full version, and every repository in the Organisation shares it — it
is served from `Jerome-Group/.github` unless this repository has committed its own copy. In
short: an issue first, then a pull request; no commit lands on `main` directly.

**A change is finished when its pull request is open — not when the commit exists.** This holds
for every change to this repository, a one-line fix as much as a feature, and it is the agent's
own job: branch, commit, **push, and open the pull request**, without asking whether to. Pushing
a branch and opening a pull request here need no confirmation; they are the expected end of the
work, and nothing is merged by them.

This outranks any instruction that stops earlier. A skill, prompt or checklist whose last step is
"commit your work" has described the middle of the job, not the end of it — open the pull request
anyway. The only thing that stops you is the author saying, in this conversation, that they want
the commit alone.

## Commit & PR attribution

Every commit message and pull-request body ends with attribution **trailers as its last
lines**, in this order:

    Assisted-by: <exact model, plus effort/mode only when a discrete one is set>
    Co-authored-by: <bare name> <verified email>

- **`Assisted-by:`** names the exact model that materially helped — e.g. `Claude Opus 4.8`,
  `GPT-5-Codex`. Append an effort suffix *only* when one is explicitly set: `(reasoning:
  <level>)` for Claude/Codex/Grok, `(thinking: <level>)` for Gemini. This line is our own
  convention — the tools don't emit it. (Ultracode is a mode, not an effort — never record it
  as a reasoning level.)
- **`Co-authored-by:`** is added **only for a model whose identity is verified**. Allowlist:

  | Model | `Co-authored-by:` |
  |-------|-------------------|
  | Claude  | `Claude <noreply@anthropic.com>` |
  | Codex   | `Codex <noreply@openai.com>` |
  | Copilot | `Copilot <198982749+Copilot@users.noreply.github.com>` |

- **Any other model** (Gemini, Jules, Grok, or a new tool) gets an `Assisted-by:` line
  **only** — never a `Co-authored-by:` with an unverified address, which would misattribute to
  a stranger or a non-existent account. Add a model to the table above only after confirming
  its address resolves to the vendor's real bot/account.
- Keep the co-author **name bare** (`Claude`, not `Claude Opus 4.8`) — the model and effort
  live once, in `Assisted-by`.

## Agent skills

### Issue tracker

GitHub Issues on this repository, via the `gh` CLI. See `docs/agents/issue-tracker.md` — it
carries the operations, not just the choice, including the wayfinding ones (`/wayfinder` reads
that section and silently falls back to local markdown when it is missing).

### Triage labels

The five canonical roles, label strings unchanged. See `docs/agents/triage-labels.md`. They are
created here by the hub's Terraform, so they are not editable in this repository.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Dependency updates

Surfaced at both ends of any session that touches a pull request. See
`docs/agents/dependencies.md`. Note its **first** merge condition: this repository auto-merges
nothing until it has deliberately opted in, and a skeleton CI has not earned that.

## Repository notes

- **This is the Organisation's one public repository.** Anything written here is published — no
  internal detail, no path that is nobody else's business, no credential. The system needs no
  Formula 1 account and holds no token at all (`docs/adr/0002`), so a secret appearing here would
  be one that wandered in from somewhere else.
- **What the running system costs is measured, not estimated** — `docs/measurements/`, one file
  per measurement. A number quoted in prose links to the file that took it.
- **`analysis/` does not exist yet.** `MAP.md` names it so the pull request that creates it is
  placing it rather than inventing it.
