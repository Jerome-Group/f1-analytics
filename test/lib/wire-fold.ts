// The wire protocol's two halves, fed directly (#14): `computeChange` says what moved between one
// Session state and the next, and `applyChange` folds that back onto the first. A Session played as
// snapshot-then-changes must land where it would as one whole snapshot — including the case a
// recording cannot show, a fact the feed *stops* sending, which must go absent rather than linger
// (story 38). So the pair is exercised here with states handed straight in.
//
//   node test/lib/wire-fold.ts <<<'{ "initial": { ... }, "steps": [ { ... } ] }'
//
// Prints two JSON lines — the change computed at each step, and the Session left after folding all
// of them — so the assertions live in test/wire.test.sh with every other assertion.

import { computeChange } from '../../server/session.ts';
import { applyChange } from '../../domain/index.ts';
import type { SessionChange, SessionState } from '../../domain/index.ts';

let json = '';
for await (const chunk of process.stdin) json += chunk;
const input = JSON.parse(json) as { initial: SessionState; steps: SessionState[] };

const changes: (SessionChange | null)[] = [];
let folded = input.initial;
for (const step of input.steps) {
  const change = computeChange(folded, step);
  changes.push(change ?? null);
  // Fold what the browser would be sent, not the whole next state — that is the thing under test.
  if (change !== undefined) folded = applyChange(folded, change);
}

process.stdout.write(`${JSON.stringify(changes)}\n${JSON.stringify(folded)}\n`);
