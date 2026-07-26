// Seam 1 for the Replay controls (#15): the same black box as seam1.ts — the server spawned as a
// process, imported from nowhere — but exercising the socket in *both* directions. A control goes up
// the way a browser sends it, and what the server publishes back down is asserted, so the frame
// reader, the control guard, the clock and the fan-out are all under test at once without any of
// them being named.
//
//   node test/lib/replay-socket.ts <fixture>
//
// Prints one normalised line for the opening snapshot and one for each control's reply, and nothing
// else, so the assertions live in test/replay.test.sh with every other one.

import { once } from 'node:events';
import { spawnServer } from './spawn-server.ts';
import type { Driver, ReplayClock, WireMessage } from '../../domain/index.ts';

const fixture = process.argv[2];
if (fixture === undefined) {
  process.stderr.write('usage: node test/lib/replay-socket.ts <fixture>\n');
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

/** How many Drivers the field has placed — the plainest fact that a moved clock changed the state. */
function placed(drivers: readonly Driver[]): number {
  return drivers.filter((driver) => driver.position !== undefined).length;
}

function clockLine(clock: ReplayClock | undefined, atEnd: boolean, drivers: number): string {
  if (clock === undefined) return 'no clock';
  const where = clock.position === clock.start ? 'start' : atEnd ? 'end' : String(clock.position);
  return `position=${where} playing=${clock.playing} speed=${clock.speed} placed=${drivers}`;
}

const lines: string[] = [];

const snapshot = await next();
if (snapshot.type !== 'session-state') throw new Error('the first message was not a snapshot');
const opening = snapshot.state;
lines.push(
  `mode=${opening.mode} ${clockLine(opening.replay, opening.replay?.position === opening.replay?.end, placed(opening.drivers))}`,
);

// Scrub to the very start of the Session: a Replay opens at the end, so this is the clock moving
// backwards — the state that comes back must be the start's, with far fewer Drivers placed, not the
// finished Session's left stale.
socket.send(JSON.stringify({ type: 'replay-control', action: 'scrub', position: opening.replay?.start }));
const scrubbed = await next();
if (scrubbed.type !== 'session-change') throw new Error('a scrub did not produce a change');
lines.push(clockLine(scrubbed.change.replay, false, placed(scrubbed.change.drivers ?? [])));

// A change of speed is chrome only: it moves nothing, so the Drivers do not change and the reply
// carries the new speed and the position it was already at.
socket.send(JSON.stringify({ type: 'replay-control', action: 'speed', speed: 4 }));
const respeed = await next();
if (respeed.type !== 'session-change') throw new Error('a speed change did not produce a change');
lines.push(
  `speed-change replay.speed=${respeed.change.replay?.speed} drivers-in-change=${respeed.change.drivers?.length ?? 0}`,
);

socket.close();
server.stop();
process.stdout.write(`${lines.join('\n')}\n`);
