# The live path is TypeScript that Node runs, and nothing is installed to run it

`server/`, `domain/` and `web/` are TypeScript, decided in #3 and for the reason story 54 gives:
the model the backend holds and the browser renders is one set of types, so changing it is a
compile error rather than a runtime surprise. This record is about what that costs, because the
usual answer — a package manifest, a build step and a `node_modules` between a clone and a
running program — would take away things this repository has already paid for.

**Node runs the TypeScript directly.** Since v22.18 it strips the types out and runs what is
left, so `node server/main.ts` is the program. There is no build step, no emitted JavaScript, and
no directory of compiled output that can be stale. What it costs is that the source must be
*erasable*: no enum, no parameter property, no import that a compiler would have to resolve.
`tsconfig.json` sets `erasableSyntaxOnly` and `verbatimModuleSyntax` so that a syntax Node cannot
run is a type error rather than a crash, and imports name the file they import, extension and all.

**The one package is the type checker, and it is a development one.** `npm ci && npm run
typecheck` is a check, like `shellcheck`. It is not a prerequisite for running the program or for
running the tests, which is the property being protected: `test/run` installs nothing, states so
in `CODING_STANDARDS.md`, and the moment a test needs a package it becomes a test that does not
get run.

**So the WebSocket server is written here.** `ws` is the obvious dependency and would be a
reasonable one in most projects. Here it is the only thing that would make an install mandatory
before `test/run` could say whether the browser receives the right Session state — and what it
would carry is a handshake (a SHA-1 of the client's key, RFC 6455 §4.2.2) and a frame header
(RFC 6455 §5.2) for the one thing this server does with a socket: send a whole text message. That
is `server/websocket/`, and it is smaller than the paragraph justifying it.

Node's built-in `WebSocket` is the *client* half of the same protocol, which is what seam 1
connects with — so the hand-written server is checked against an implementation this project did
not write, on every test run.

## Consequences

- **A clone runs.** `bin/up`, `bin/backfill`, `node server/main.ts` and `test/run`, with nothing
  installed that was not already needed.
- **The type checker is a check, not a build.** It runs in CI and it may be skipped locally. A
  change that only a type checker would catch is caught on the pull request, which is where the
  other checks catch things too.
- **`erasableSyntaxOnly` narrows the language.** Some idioms are unavailable, and the narrowing
  is deliberate: what Node runs and what `tsc` reads are then the same text.
- **The WebSocket server is this project's to maintain.** It covers what this project sends and
  no more. Anything the protocol offers that is not used — fragmentation, compression, binary
  frames, subprotocols — is absent rather than stubbed, and adding one is a change here.
- **npm is now an ecosystem in this repository**, so `.github/dependabot.yml` gained it. It has
  one manifest and two development dependencies to move.

## Revisit when

- `web/` needs a bundler. A frontend build is a different question from a backend build, and it
  may well answer differently; it does not drag `server/` with it.
- The WebSocket server needs something the protocol has and this does not — compression for
  twenty-two rows of per-second telemetry is the plausible one. Taking `ws` at that point is a
  fair trade and this record is where the trade was set up, not where it was forbidden.
- Node's type stripping changes its terms. It is what removes the build step; without it the
  calculation above is a different one.
