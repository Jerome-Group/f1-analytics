// Seam 2 for the opened Driver (#18): Session state goes in and what is on screen comes out, the
// same as seam2.ts — only what comes out is the panel rather than the twenty rows.
//
//   node test/lib/seam2-opened.ts <driver> < a session-state message
//
// The state going in is the message a browser receives, so the two seams are checked against each
// other rather than against a shape written out twice. Prints the panel's markup and nothing else,
// so the assertions live in test/opened-driver.test.sh.

import type { SessionStateMessage } from '../../domain/index.ts';
import { openedDriverPanel } from '../../web/opened-driver.ts';

const driver = process.argv[2];

let json = '';
for await (const chunk of process.stdin) json += chunk;

const message = JSON.parse(json) as SessionStateMessage;
// No Driver named is the closed panel, which is the case worth being able to ask for: it must draw
// nothing at all rather than an empty frame.
process.stdout.write(`${openedDriverPanel(message.state, driver === undefined ? undefined : Number(driver))}\n`);
