# AGENTS.md — <repository>

> Canonical instruction file for AI agents (Claude Code and others) working in this repo.
> `CLAUDE.md` is a symlink to this file, so the two can never drift.

## What this repo is

*(One paragraph: what this repository is for, and what it is not for. Replace this and the
heading above before the first pull request.)*

- **Visibility:** *(private | public)*
- **Organisation:** [Jerome-Group](https://github.com/Jerome-Group)

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

GitHub Issues on this repository, via the `gh` CLI.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root.

### Dependency updates

Surfaced at both ends of any session that touches a pull request. See
`docs/agents/dependencies.md`. Note its **first** merge condition: this repository auto-merges
nothing until it has deliberately opted in, and a skeleton CI has not earned that.
