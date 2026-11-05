// The live path (#17): subscribe to the broker the Ingestor publishes to, and serve the Session it
// builds over the same WebSocket a Replay is served over — the point of the whole product.
//
//   node server/live.ts
//
// There is no Session key on the command line, because a Live Session is the one that is happening:
// the Ingestor names it in the records themselves, and the feed reads it from there (live-feed.ts).
// Start this ahead of the Session — an hour for a race, fifteen minutes for practice or qualifying —
// so the connection is open when the first records arrive, and run it from a residential connection,
// because Formula 1 IP-blocks datacentre ranges (#17).
//
// Nothing below the socket knows this is Live rather than Replay: the feed produces a `SessionState`
// like any other (ADR-0003), and the one thing that differs is the `mode` this stamps on it, which
// the strip reads to draw the Gated streams as unavailable rather than leaving them silently
// blank (#13, session-strip.ts). That single field is the whole of "Live versus Replay is
// unmistakable, and no view branches on the mode".
//
//   F1_MQTT_URL    the broker host the Ingestor publishes to
//   F1_MQTT_PORT   the broker port
//   F1_PORT        the port the browser connects to; nought asks the operating system for one

import type { SessionState } from '../domain/index.ts';
import { subscribe } from './mqtt/client.ts';
import { LIVE_TOPICS, liveFeed } from './openf1/live-feed.ts';
import { servePage } from './dashboard.ts';
import { sessionSource } from './session.ts';
import { serveSessionState } from './websocket/server.ts';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_MQTT_PORT = '1883';
const DEFAULT_PORT = '8080';

const feed = liveFeed();

// The one thing a live frame carries that a Replay's does not: `mode: 'live'`, on every frame and not
// only the first, so the strip marks the Gated streams throughout (#13). Stated once here so the seed
// and every update cannot drift.
const liveState = (): SessionState => ({ ...feed.state(), mode: 'live' });

// Seeded with the empty Session, in Live mode, so a browser that connects before the first record
// still sees a Timing screen with its Gated streams marked — an empty grid, not a broken page.
const source = sessionSource(liveState());

// A burst of documents — twenty Drivers' intervals in one breath — should rebuild the Session once,
// not twenty times, so a message marks the state dirty and the rebuild is deferred to the end of the
// current batch of reads. `source.update` sends nothing when nothing moved, so a rebuild that changes
// only a stream no view shows is silent (session.ts).
let pending = false;
function refresh(): void {
  if (pending) return;
  pending = true;
  setImmediate(() => {
    pending = false;
    source.update(liveState());
  });
}

const connection = subscribe({
  host: process.env['F1_MQTT_URL'] ?? DEFAULT_HOST,
  port: Number(process.env['F1_MQTT_PORT'] ?? DEFAULT_MQTT_PORT),
  topics: LIVE_TOPICS,
  onMessage: (topic, payload) => {
    feed.ingest(topic, payload.toString('utf8'));
    refresh();
  },
  onStatus: (up) => process.stderr.write(up ? 'connected to the broker\n' : 'lost the broker, reconnecting\n'),
});

// A Live Session has no clock to move, so the one control it answers is a viewer opening a Driver
// (#18) — depth for one, out of what the subscription above already holds.
const server = await serveSessionState(
  source,
  Number(process.env['F1_PORT'] ?? DEFAULT_PORT),
  servePage,
  (control) => {
    if (control.type !== 'open-driver') return;
    feed.open(control.driver);
    source.update(liveState());
  },
);

// One line, and the port is in it: a test harness has nothing else to wait for, and the viewer wants
// the other address on the same line (mirrors main.ts).
process.stdout.write(`${server.url} is serving a Live Session — watch it at ${server.page}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    connection.close();
    void server.close().then(() => process.exit(0));
  });
}
