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

**Tests live in `test/`, one file per unit under test, named `<unit>.test.sh`, and `test/run`
runs all of them.** They install nothing: a test that needs a package before it can say whether
`bin/up` places its data correctly is a test that will not be run, and this is the repository
where placement being wrong is silent. A test written in another language is driven from its
`.test.sh` and reports through `test/lib/assert.sh` with everything else, so one run reads as one
list.

**Tests assert at a seam, and there are two** (#3). Seam 1 is `server/`: a recorded input goes in
and the Session state that comes out of the WebSocket is asserted, with the process a black box.
Seam 2 is `web/`: Session state goes in and what is on screen is asserted. Nothing is asserted
between them — not the Adapter's intermediate shapes, not how Session state is held, not a
component's internals. A test that would break on a rewrite that changed no behaviour is a bad
test, and deleting it is the fix.

**A recording is cut by a committed script and is minutes, not a Session.** `bin/fixture` writes
everything under `test/fixtures/`, byte-stably, so a recording is regenerated and reviewed rather
than being an opaque blob that quietly stops representing the feed. None of it is a whole
Session: the data is Formula 1's (`docs/adr/0002`, #26), and what makes a recording worth having
is the curation, not its completeness.

**TypeScript is run by Node, not built** (`docs/adr/0011`). `server/`, `domain/` and, when it
arrives, `web/`. There is no emitted JavaScript and no runtime dependency; `npm run typecheck` is
a check like `shellcheck`, never a step before something works. Practically: every relative
import names the file it imports including its `.ts`, and nothing is written that type-stripping
cannot erase — `erasableSyntaxOnly` in `tsconfig.json` makes that a type error rather than a
crash.

**Upstream field names live under `server/openf1/` and nowhere else.** That directory is the
Adapter (`CONTEXT.md`), and ADR-0003's whole claim — that the data source can be changed without
reaching the views — is this rule and nothing else. Upstream speaks `snake_case` and this project
speaks `camelCase`, so `test/adapter.test.sh` checks the spelling of every TypeScript file above
the boundary. Prose naming a field is not carrying one, as with `docker` below.

**A value the feed did not give is absent.** Optional in `domain/` means the key is missing from
the object and missing from the wire — never `null`, never `0`, never what it was last time
(story 38). Building a domain value by spreading an upstream record, or by defaulting with `??`,
is how a zero gets in.

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

**Python is standard library only, and stays that way where it can.** `archive/` is the first
Python here. It has no dependencies and should not acquire any: the Archive is what a rebuild
starts from, and a rebuild that first needs a package index is a worse rebuild. `analysis/`, when
it arrives, is the exception — FastF1 is the whole point of it.

**`deploy/` owns no upstream source.** It holds configuration this project wrote, and a pinned
reference to software it did not (`docs/adr/0003`, `docs/adr/0006`). A file copied out of
upstream is not configuration.

**CSS states its values once, in `web/design-system/tokens/`.** A component reads a custom
property and never a literal colour or a literal column width, because a literal in a component
is invisible in review and is the one thing that cannot be corrected in one place. The column
track list is a token for the same reason: the header and every row lay out against it, and a
row that disagrees is a screen where every column right of the disagreement is quietly wrong
(`docs/adr/0010`).

**No bind mounts.** Containers get their configuration from a build context; the virtual machine
sees no host path at all (`docs/adr/0007`).

## 6. Evolution — what is rigid, what moves

- **The core (§1–§4) is rigid.** It is identical in every repository and changes only by an
  org-level decision recorded as an ADR in the management hub, then rolled out through the
  template (and to existing repositories as wanted). Do not quietly edit the core in one repo.
- **§5 moves freely** per repository, through that repository's own pull requests.
- **`MAP.md` is required everywhere, but its contents are repo-specific** and are updated
  continuously alongside the code they describe.
