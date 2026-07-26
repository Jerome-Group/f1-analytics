// Reads a backfilled Session out of the Stores, serves the dashboard, and sends it that Session
// over one WebSocket. One port, so there is nothing to point at anything.
//
//   node server/main.ts 9920
//
// The Session is read once, at startup. A finished Session does not change, and playing it back
// against a Session clock is Replay's job (#11), not this program's.
//
//   F1_OPENF1_URL   where the self-hosted OpenF1 API is answering
//   F1_PORT         the port the browser connects to; nought asks the operating system for one

import { readSession } from './openf1/rest-feed.ts';
import { servePage } from './dashboard.ts';
import { sessionSource } from './session.ts';
import { serveSessionState } from './websocket/server.ts';

const DEFAULT_API = 'http://localhost:8000';
const DEFAULT_PORT = '8080';

const [key] = process.argv.slice(2);
if (key === undefined || !/^\d+$/.test(key) || process.argv.length > 3) {
  process.stderr.write(
    'usage: node server/main.ts <session-key>\n\n' +
      'Serves one backfilled Session over a WebSocket. Bring the stack up with bin/up and put\n' +
      'the Session in the stores with bin/backfill first.\n',
  );
  process.exit(64);
}

const api = new URL(process.env['F1_OPENF1_URL'] ?? DEFAULT_API);
const sessionKey = Number(key);

// Read once and never updated: a finished Session does not move, so a browser gets one snapshot and
// no changes. The source is here rather than the bare state so the live and Replay feeds (#15, #17)
// have the thing to call `update` on without the socket or this program changing shape.
const source = sessionSource(await readSession(api, sessionKey));
const server = await serveSessionState(
  source,
  Number(process.env['F1_PORT'] ?? DEFAULT_PORT),
  servePage,
);

// One line, and the port is in it: the caller may have asked for an ephemeral one, and a test
// harness has nothing else to wait for. The viewer wants the other address on the same line.
process.stdout.write(
  `${server.url} is serving Session ${sessionKey}, ${source.state.drivers.length} Drivers` +
    ` — watch it at ${server.page}\n`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
