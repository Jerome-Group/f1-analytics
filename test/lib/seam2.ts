// Seam 2 (#3): Session state goes in and what is on screen comes out. What goes in is the
// message a browser receives — the same bytes seam 1 sends — so the two seams meet at the wire
// rather than at a shape written twice.
//
//   node test/lib/seam1.ts 2025-dutch-race | node test/lib/seam2.ts [driver]
//
// The Driver a viewer has opened is optional, and is all the rows are told about one (#18): they are
// built the same either way, and the one behind the panel is marked. Prints the Timing screen's
// markup, and nothing else, so the assertions live in test/timing-screen.test.sh with every other
// assertion in this repository.

import type { SessionStateMessage } from '../../domain/index.ts';
import { timingScreen } from '../../web/timing-screen.ts';

const opened = process.argv[2];

let json = '';
for await (const chunk of process.stdin) json += chunk;

const message = JSON.parse(json) as SessionStateMessage;
process.stdout.write(`${timingScreen(message.state, opened === undefined ? undefined : Number(opened))}\n`);
