// Seam 1 (#3): a recorded input goes in at one end, and the Session state that comes out of the
// WebSocket at the other is what gets asserted. `server/` is a black box here — this file spawns
// it as a process ([[spawn-server]]) and imports nothing from it, so a rewrite behind the socket is
// not a test change.
//
//   node test/lib/seam1.ts <fixture>
//
// Prints the message the server sent, and nothing else, so the assertions live in
// test/server.test.sh with every other assertion in this repository.

import { once } from 'node:events';
import { spawnServer } from './spawn-server.ts';

const fixture = process.argv[2];
if (fixture === undefined) {
  process.stderr.write('usage: node test/lib/seam1.ts <fixture>\n');
  process.exit(64);
}

const server = await spawnServer(fixture);

// A WebSocket is an EventTarget, so a failed handshake is an event and not a rejected promise.
// Without this it is twenty silent seconds instead of the reason.
const socket = new WebSocket(server.url);
socket.addEventListener('error', () => {
  process.stderr.write(`${server.url} refused a WebSocket\n`);
  server.stop();
  process.exit(1);
});

const [message] = (await once(socket, 'message')) as [MessageEvent];
socket.close();
server.stop();
process.stdout.write(`${String(message.data)}\n`);
