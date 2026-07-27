// Seam 1 for the live path (#17): a recording goes into a broker at one end, and the Session state
// that comes out of the WebSocket at the other is what gets asserted — the same black box as seam1.ts,
// but fed over MQTT instead of REST. `server/live.ts` is spawned as a process and nothing is imported
// from it, so this proves the whole live path — broker to feed to Adapter to socket — produces a
// Session no view can tell from a Replay's, carrying `mode: 'live'` and nothing else new.
//
// The recording here is synthetic, built in this file. The real live fixture the ticket also asks for
// can only be cut from a live Session (it is the one input that cannot be re-derived from the
// Archive), so it awaits a Live window; this stream exists to exercise the path, not to stand in for
// that capture. It carries the cases a Timing screen turns on: a leader with no separation, two cars
// placed behind, completed laps, and a tyre off a Stint.
//
// The browser's own fold (domain/wire.ts, applyChange) reassembles snapshot-then-changes to detect
// when the Session is whole; the Session then *printed* is a fresh connection's snapshot, which is
// what a browser opening mid-Session actually receives — the authoritative whole Session the server
// holds, carrying the Session key the change stream by design never re-sends (#14, wire.ts).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyChange, type SessionState, type WireMessage } from '../../domain/index.ts';
import { startBroker } from './mqtt-broker.ts';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The synthetic recording, as `[topic, document]` pairs the broker publishes in order. */
const RECORDING: [string, Record<string, unknown>][] = [
  ['v1/drivers', { driver_number: 81, name_acronym: 'PIA', team_name: 'McLaren', session_key: 9 }],
  ['v1/drivers', { driver_number: 4, name_acronym: 'NOR', team_name: 'McLaren', session_key: 9 }],
  ['v1/drivers', { driver_number: 1, name_acronym: 'VER', team_name: 'Red Bull Racing', session_key: 9 }],
  ['v1/position', { driver_number: 81, date: '2025-08-31T13:29:00Z', position: 1, session_key: 9 }],
  ['v1/position', { driver_number: 4, date: '2025-08-31T13:29:00Z', position: 2, session_key: 9 }],
  ['v1/position', { driver_number: 1, date: '2025-08-31T13:29:00Z', position: 3, session_key: 9 }],
  ['v1/intervals', { driver_number: 81, date: '2025-08-31T13:29:00Z', gap_to_leader: 0, interval: 0, session_key: 9 }],
  ['v1/intervals', { driver_number: 4, date: '2025-08-31T13:29:00Z', gap_to_leader: 3.2, interval: 3.2, session_key: 9 }],
  ['v1/intervals', { driver_number: 1, date: '2025-08-31T13:29:00Z', gap_to_leader: 5.6, interval: 2.4, session_key: 9 }],
  // Driver 1's first lap is re-published: first with no duration (in progress), then completed. The
  // feed must upsert the two into one completed lap, exactly as the Stores do.
  ['v1/laps', { driver_number: 1, lap_number: 1, lap_duration: null, session_key: 9 }],
  ['v1/laps', { driver_number: 1, lap_number: 1, lap_duration: 90.0, session_key: 9 }],
  ['v1/laps', { driver_number: 1, lap_number: 2, lap_duration: 89.5, session_key: 9 }],
  ['v1/stints', { driver_number: 1, stint_number: 1, lap_start: 1, lap_end: 2, compound: 'MEDIUM', tyre_age_at_start: 0, session_key: 9 }],
];

const broker = await startBroker((connection) => {
  for (const [topic, document] of RECORDING) connection.publish(topic, JSON.stringify(document));
});

const server = spawn(process.execPath, [`${REPO_ROOT}server/live.ts`], {
  env: { ...process.env, F1_MQTT_URL: '127.0.0.1', F1_MQTT_PORT: String(broker.port), F1_PORT: '0' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

async function announced(): Promise<string> {
  let line = '';
  for await (const chunk of server.stdout ?? []) {
    line += chunk;
    if (line.includes('\n')) break;
  }
  const url = /ws:\/\/\S+/.exec(line)?.[0];
  if (url === undefined) throw new Error(`server/live.ts announced "${line.trim()}"`);
  return url;
}

const url = await announced();
const socket = new WebSocket(url);
socket.addEventListener('error', () => fail(`${url} refused a WebSocket`));

let state: SessionState | undefined;
const giveUp = setTimeout(() => fail('the live path never produced the whole Session'), 20_000);

socket.addEventListener('message', (event: MessageEvent) => {
  const message = JSON.parse(String(event.data)) as WireMessage;
  state = message.type === 'session-state' ? message.state : applyChange(state!, message.change);
  // Whole once all three Drivers are placed and Driver 1's two laps have both landed — no earlier
  // state satisfies this, so the print is of the settled Session and not a frame mid-accumulation.
  const one = state.drivers.find((driver) => driver.number === 1);
  if (state.drivers.length === 3 && one?.lapsCompleted === 2) settled();
});

/** The Session is whole. Open a second connection and print the snapshot it is sent — the whole
 * Session as a mid-Session browser receives it, not the empty one this harness started folding from. */
function settled(): void {
  socket.close();
  const fresh = new WebSocket(url);
  fresh.addEventListener('error', () => fail(`${url} refused the second WebSocket`));
  fresh.addEventListener('message', (event: MessageEvent) => {
    const message = JSON.parse(String(event.data)) as WireMessage;
    if (message.type !== 'session-state') return;
    clearTimeout(giveUp);
    process.stdout.write(`${JSON.stringify(message.state)}\n`);
    fresh.close();
    cleanup();
    process.exit(0);
  });
}

function fail(reason: string): void {
  process.stderr.write(`${reason}\n`);
  cleanup();
  process.exit(1);
}

function cleanup(): void {
  socket.close();
  server.kill();
  void broker.close();
}
