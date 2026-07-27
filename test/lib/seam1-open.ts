// Seam 1 for the opened Driver (#18): the same black box as seam1.ts — the server spawned as a
// process, imported from nowhere — with a viewer opening a Driver and closing them again over the
// socket. What is asserted is what a browser receives, so the criterion this exists for ("the
// per-second tier is not sent for unopened Drivers") is checked where it is actually paid for.
//
//   node test/lib/seam1-open.ts <fixture> <driver> [seconds to scrub back]
//
// Prints one JSON object per line: the opening snapshot, the change opening the Driver brings, the
// change a scrub brings while they are open where seconds were asked for, and the change closing
// them brings. The scrub is optional because a recording with no timed streams in it has nowhere to
// scrub to — its clock has one moment — and asking for a change that cannot come is a test that
// hangs rather than fails. The assertions live in test/driver-detail.test.sh.

import { once } from 'node:events';
import { spawnServer } from './spawn-server.ts';
import type { WireMessage } from '../../domain/index.ts';

const [fixture, driver, back] = process.argv.slice(2);
if (fixture === undefined || driver === undefined) {
  process.stderr.write('usage: node test/lib/seam1-open.ts <fixture> <driver> [seconds back]\n');
  process.exit(64);
}

const server = await spawnServer(fixture);
const socket = new WebSocket(server.url);
socket.addEventListener('error', () => {
  process.stderr.write(`${server.url} refused a WebSocket\n`);
  server.stop();
  process.exit(1);
});
await once(socket, 'open');

/** The next message the server sends, parsed. */
async function next(): Promise<WireMessage> {
  const [event] = (await once(socket, 'message')) as [MessageEvent];
  return JSON.parse(String(event.data)) as WireMessage;
}

const snapshot = await next();
if (snapshot.type !== 'session-state') throw new Error('the first message was not a snapshot');

// Opening reads two streams nothing else reads, so the change comes back once they are read rather
// than in the same breath as the request.
socket.send(JSON.stringify({ type: 'open-driver', driver: Number(driver) }));
const opened = await next();
if (opened.type !== 'session-change') throw new Error('opening a Driver produced no change');

// Back down the Session, with the Driver still open. What comes back has to be both things at once:
// the twenty rows as they stood then, and this Driver's depth as it stood then.
const lines = [JSON.stringify(snapshot.state), JSON.stringify(opened.change)];
if (back !== undefined) {
  const clock = snapshot.state.replay;
  socket.send(
    JSON.stringify({ type: 'replay-control', action: 'scrub', position: (clock?.end ?? 0) - Number(back) * 1000 }),
  );
  const moved = await next();
  if (moved.type !== 'session-change') throw new Error('a scrub while a Driver was open produced no change');
  lines.push(JSON.stringify(moved.change));
}

// Closing carries no Driver at all — absence is how the wire says nobody is open (domain/wire.ts).
socket.send(JSON.stringify({ type: 'open-driver' }));
const closed = await next();
if (closed.type !== 'session-change') throw new Error('closing a Driver produced no change');

socket.close();
server.stop();
lines.push(JSON.stringify(closed.change));
process.stdout.write(`${lines.join('\n')}\n`);
