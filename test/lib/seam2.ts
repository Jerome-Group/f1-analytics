// Seam 2 (#3): Session state goes in and what is on screen comes out. What goes in is the
// message a browser receives — the same bytes seam 1 sends — so the two seams meet at the wire
// rather than at a shape written twice.
//
//   node test/lib/seam1.ts 2025-dutch-race | node test/lib/seam2.ts
//
// Prints the Timing screen's markup, and nothing else, so the assertions live in
// test/timing-screen.test.sh with every other assertion in this repository.

import type { SessionStateMessage } from '../../domain/index.ts';
import { timingScreen } from '../../web/timing-screen.ts';

let json = '';
for await (const chunk of process.stdin) json += chunk;

const message = JSON.parse(json) as SessionStateMessage;
process.stdout.write(`${timingScreen(message.state)}\n`);
