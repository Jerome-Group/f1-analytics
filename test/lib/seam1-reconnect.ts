// Seam 1, the reconnect guarantee (#14): a browser connects, drops, and reconnects, and what it is
// sent the second time is the whole Session again — so a mid-Session reload costs nothing. The
// server is the same black box seam1.ts spawns; this file just connects to it twice.
//
//   node test/lib/seam1-reconnect.ts <fixture>
//
// Prints the two snapshots the two connections received, one per line, so the assertion that they
// are identical — that a reconnect restores the Session rather than a reduced view of it — lives in
// test/server.test.sh with every other assertion.

import { once } from 'node:events';
import { spawnServer } from './spawn-server.ts';

const fixture = process.argv[2];
if (fixture === undefined) {
  process.stderr.write('usage: node test/lib/seam1-reconnect.ts <fixture>\n');
  process.exit(64);
}

const server = await spawnServer(fixture);

/** Connect, take the one message the server opens with, and close as a browser navigating away
 * would. The next call is the reconnect. */
async function connectAndReceive(): Promise<string> {
  const socket = new WebSocket(server.url);
  socket.addEventListener('error', () => {
    process.stderr.write(`${server.url} refused a WebSocket\n`);
    server.stop();
    process.exit(1);
  });
  const [message] = (await once(socket, 'message')) as [MessageEvent];
  socket.close();
  await once(socket, 'close');
  return String(message.data);
}

const first = await connectAndReceive();
const second = await connectAndReceive();
server.stop();
process.stdout.write(`${first}\n${second}\n`);
