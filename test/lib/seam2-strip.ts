// Seam 2, for the strip: Session state in, the session-global strip out (#13). The state going in
// is the message a browser receives — the same bytes seam 1 sends — so the strip is checked against
// the same wire the rows are.
//
//   node test/lib/seam1.ts 2025-dutch-race | node test/lib/seam2-strip.ts
//
// Prints the strip's markup, and nothing else, so the assertions live in test/session-strip.test.sh
// with every other assertion in this repository.

import type { SessionStateMessage } from '../../domain/index.ts';
import { sessionStrip } from '../../web/session-strip.ts';

let json = '';
for await (const chunk of process.stdin) json += chunk;

const message = JSON.parse(json) as SessionStateMessage;
process.stdout.write(`${sessionStrip(message.state)}\n`);
