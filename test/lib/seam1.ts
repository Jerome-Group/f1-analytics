// Seam 1 (#3): a recorded input goes in at one end, and the Session state that comes out of the
// WebSocket at the other is what gets asserted. `server/` is a black box here — this file spawns
// it as a process and imports nothing from it, so a rewrite behind the socket is not a test
// change.
//
//   node test/lib/seam1.ts <fixture>
//
// Prints the message the server sent, and nothing else, so the assertions live in
// test/server.test.sh with every other assertion in this repository.

import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GIVE_UP_AFTER_MS = 20_000;

const fixture = process.argv[2];
if (fixture === undefined) {
  process.stderr.write('usage: node test/lib/seam1.ts <fixture>\n');
  process.exit(64);
}

/**
 * OpenF1's REST API, answering only out of the recording. A collection the fixture does not
 * carry is a 404 rather than an empty list, so a server that starts reading a stream nobody
 * curated fails here instead of quietly seeing nothing.
 */
async function replayRecording(name: string): Promise<Server> {
  const server = createServer((request, response) => {
    const collection = new URL(request.url ?? '/', 'http://recording').pathname.replace('/v1/', '');
    readFile(`${REPO_ROOT}test/fixtures/${name}/${collection}.json`).then(
      (body) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(body);
      },
      () => {
        response.writeHead(404).end();
      },
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

const recording = await replayRecording(fixture);
const recordingPort = (recording.address() as { port: number }).port;

const server = spawn(
  process.execPath,
  [`${REPO_ROOT}server/main.ts`, '9920'],
  {
    env: {
      ...process.env,
      F1_OPENF1_URL: `http://127.0.0.1:${recordingPort}`,
      // Nought is an ephemeral port: two of these may run at once, and a fixed port would make
      // that a flaky test rather than a slow one.
      F1_PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);

function giveUp(why: string): never {
  process.stderr.write(`${why}\n`);
  server.kill();
  recording.close();
  process.exit(1);
}

const timeout = setTimeout(
  () => giveUp('the server never sent Session state'),
  GIVE_UP_AFTER_MS,
);

let announcement = '';
for await (const chunk of server.stdout) {
  announcement += chunk;
  if (announcement.includes('\n')) break;
}

const address = /ws:\/\/\S+/.exec(announcement)?.[0];
if (address === undefined) {
  giveUp(`the server announced "${announcement.trim()}", which is not a WebSocket`);
}

// A WebSocket is an EventTarget, so a failed handshake is an event and not a rejected promise.
// Without this it is twenty silent seconds instead of the reason.
const socket = new WebSocket(address);
socket.addEventListener('error', () => giveUp(`${address} refused a WebSocket`));

const [message] = (await once(socket, 'message')) as [MessageEvent];
socket.close();

clearTimeout(timeout);
server.kill();
recording.close();
process.stdout.write(`${String(message.data)}\n`);
