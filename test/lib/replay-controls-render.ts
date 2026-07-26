// The Replay controls' render (#15), fed a Session state the way seam 2 feeds the strip. The render
// is a pure function of the state — the clock draws the bar, and a Live Session with no clock draws
// nothing — so it is checked here with a state handed straight in, and the listeners that send a
// control back are left to the wiring they belong to.
//
//   node test/lib/replay-controls-render.ts <<<'{ "sessionKey": 0, "drivers": [], "replay": {...} }'
//
// Prints the controls' markup, and nothing else, so the assertions live in test/replay-controls.test.sh.

import type { SessionState } from '../../domain/index.ts';
import { replayControls } from '../../web/replay-controls.ts';

let json = '';
for await (const chunk of process.stdin) json += chunk;
const state = JSON.parse(json) as SessionState;
process.stdout.write(`${replayControls(state)}\n`);
