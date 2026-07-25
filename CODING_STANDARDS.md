# Coding standards

This file is what `/code-review`'s **Standards** axis reads. It is layered:

- **The core** (§1–§4) — shared by every repository, seeded from the template. Treat it as
  fixed; it changes only by an org-level decision (see §6).
- **Repo-specific standards** (§5) — each repository fills these in and evolves them freely.

## 1. The principle: the code explains itself

Every unit is written to be understood from the code alone by the next reader — increasingly
an LLM agent — so that reader can take exactly what it needs without a human in the loop. Prose
is a poor substitute for legible code: if a piece of code needs a paragraph to be understood,
the code is wrong, not under-documented. **The burden is on the code, not on the docs.**

## 2. What the code must do

These are checkable; `/code-review` holds a change against them.

- **Self-explanatory.** Names state what a thing is and does; control flow reads plainly. No
  cleverness that needs a comment to decode. A comment earns its place only for a genuine *why*
  the code cannot carry (a workaround, a non-obvious constraint) — never to restate *what*.
- **Placed predictably.** Files live where their purpose says they belong — the file system is
  itself a map. A reader guesses where something lives from its role and is right.
- **Small, cohesive units.** One concern per file and per function, sized so an agent can load
  it and reason about it without dragging in the whole repository.
- **Interface separated from implementation.** The public surface — types, signatures, the
  contract — is separable from how it is carried out, so a reader takes just the interface it
  needs and ignores the rest.
- **Deep, not shallow.** A unit's public surface is small relative to what it does, and it hides
  its internals. Prefer a few powerful, well-named entry points over many thin pass-throughs.
- **Few, obvious dependencies.** What a unit needs is explicit at its edge, not reached for
  through globals or hidden state. Minimise what a reader must hold in their head at once.
- **Formatted by tooling, not by hand.** Formatting and lint are automated so they are never a
  review topic; review is about design, not whitespace.
- **No dead weight.** No unused code, commented-out blocks, or speculative generality. If it
  isn't used now, it isn't here.

## 3. Documentation boundary

Docs carry only what the code cannot say — the *why*, the decisions, the domain language, the
constraints outside the code. That layer already exists and is required:

- **`docs/adr/`** — the decisions and their rationale.
- **`CONTEXT.md`** — the ubiquitous language (the glossary).

Do not narrate the code in prose. If you are writing documentation that explains *what the code
does*, fix the code until it says so itself.

## 4. `MAP.md` is required

Every repository carries a **`MAP.md`** at its root — a one-screen orientation map so an agent
finds its way fast. This is navigation, not explanation: it points at where things are; it never
restates what the code already says. Keep it light so it stays true:

- One line: what this repository is.
- The top-level areas **only** — each a single line: *what lives there* and its *entry point*.
  Do not mirror the directory tree; list the handful of places that matter.
- A "start here" pointer for a newcomer.

`MAP.md` is part of the definition of done: a change that adds, moves, or removes a top-level
area updates `MAP.md` in the **same** pull request. A stale map is worse than none, so
`/code-review` treats a drifted `MAP.md` as a Standards finding.

## 5. Repo-specific standards

*(Each repository fills this in and owns it.)* Language and framework conventions, the seams
where tests are written, naming or layout rules particular to this codebase, and anything the
core leaves open. Add them here; they evolve through this repository's normal pull-request flow.

The application code is not written yet, so what follows covers `bin/`, `deploy/` and `test/`.
Add to it when a language arrives.

**Tests live in `test/`, one file per unit under test, named `<unit>.test.sh`, and `test/run`
runs all of them.** They install nothing: a test that needs a package before it can say whether
`bin/up` places its data correctly is a test that will not be run, and this is the repository
where placement being wrong is silent.

**Shell.** `bash`, and every path quoted — this repository lives at a path with a space in it,
and an unquoted expansion is a bug that only shows up here. Executables in `bin/` use
`set -euo pipefail` and take their name from what they do (`up`, not `start-stack.sh`); test
files use `set -uo pipefail`, because a failing assertion must report and carry on rather than
abort the file. Sourced files go in `bin/lib/`, define functions prefixed `f1_` and the values
those functions need, and **do nothing observable when sourced** — no container started, no file
written, no network touched.

**The runtime is never invoked directly.** `docker` and `colima` appear only inside `bin/`, which
sets `COLIMA_HOME` and `DOCKER_CONFIG` first. Anywhere else in this repository — in a script, in
a test, in a documented command someone is meant to type — invoking them is a Standards finding,
because it will use the internal disk and appear to work (`docs/adr/0004`). Prose *about* the
rule naturally names the command it forbids; that is not an invocation.

**`deploy/` owns no upstream source.** It holds configuration this project wrote, and a pinned
reference to software it did not (`docs/adr/0003`, `docs/adr/0006`). A file copied out of
upstream is not configuration.

**No bind mounts.** Containers get their configuration from a build context; the virtual machine
sees no host path at all (`docs/adr/0007`).

## 6. Evolution — what is rigid, what moves

- **The core (§1–§4) is rigid.** It is identical in every repository and changes only by an
  org-level decision recorded as an ADR in the management hub, then rolled out through the
  template (and to existing repositories as wanted). Do not quietly edit the core in one repo.
- **§5 moves freely** per repository, through that repository's own pull requests.
- **`MAP.md` is required everywhere, but its contents are repo-specific** and are updated
  continuously alongside the code they describe.
