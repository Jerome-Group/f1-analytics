# 10. The repository holds the design system, and Claude Design mirrors it

Date: 2026-07-26

## Status

Accepted.

## Context

The Timing screen is designed in a Claude Design design-system project — `f1-live-analytics`,
`cbb59fd7-74d2-472f-a0c1-4b91de85a7c5` — and kept in sync with a component library through the
`/design-sync` skill. That leaves one question the tooling does not answer: which of the two is
the original.

The pull is towards the design project, because that is where the work is looked at. But pushing
to it is not something an agent can do on its own. Reads are unprompted; every write passes
through `finalize_plan`, a deliberate human approval boundary, and an interactively authenticated
connection may be absent altogether in a background run. A source of truth that can only be
written when a person is at the keyboard would make every component change wait for one.

There is a second pull, towards a design-tool export format. It would make the design project
richer, and it would mean the frontend re-implements by eye what the design system already
states — the drift this whole arrangement exists to prevent.

## Decision

`web/design-system/` in this repository is the design system. The Claude Design project is a
mirror of it, pushed to when a person is present, and never the other way round.

The library is plain CSS custom properties and plain HTML, so the tokens the design states are
literally the tokens the dashboard ships — team colours, tyre compounds, sector status, the type
scale, the column track list. A component reads tokens and never a literal colour; `test/` holds
that to it, along with the density budget, because both are arithmetic and neither should be
discovered during a Session.

## Consequences

An agent may design, build and check components at any time, in any session, and the pull request
is finished without a design push. Syncing is a deliberate step at the end of a component's work,
taken with the author present, and it is incremental — one component at a time, never a wholesale
replace, because the mirror is not the thing being protected.

The design project cannot carry anything the repository does not. Anything drawn only there is
lost at the next sync, and that is the intended asymmetry: it is the same asymmetry as the Archive
and the Stores, one file down.
