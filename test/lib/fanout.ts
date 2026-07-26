// The wire protocol over a real socket (#14). One update to the source is encoded once and reaches
// every connected browser — the fan-out the two-process split exists for — and a browser that
// connects *after* the update is sent a snapshot equal to what an earlier browser reached by folding
// the change into its own copy. That second equality is the reconnect guarantee: snapshot-then-change
// and a reconnected snapshot land on the identical Session.
//
//   node test/lib/fanout.ts
//
// Prints four JSON values, one per line — the change two browsers received, the Session one of them
// folded it into, and the snapshot a late browser was sent — so the equalities are asserted in
// test/wire.test.sh with every other assertion.

import { once } from 'node:events';
import { serveSessionState } from '../../server/websocket/server.ts';
import { sessionSource } from '../../server/session.ts';
import { applyChange } from '../../domain/index.ts';
import type { SessionChangeMessage, SessionState, WireMessage } from '../../domain/index.ts';

const initial: SessionState = {
  sessionKey: 9920,
  flag: 'green',
  drivers: [
    { number: 81, position: 1, code: 'PIA', lastLap: 75_573 },
    { number: 1, position: 2, code: 'VER', lastLap: 76_710 },
    { number: 27, position: 3, code: 'HUL', lastLap: 78_100 },
  ],
};

// VER takes the lead and sets a new last lap; the flag goes yellow. Two Drivers move (VER up, PIA
// down) and one — HUL — does not, so "only what changed" is a claim the change can be measured
// against. Every other Driver fact is untouched, which is what a whole-Driver replace must preserve.
const next: SessionState = {
  sessionKey: 9920,
  flag: 'yellow',
  drivers: [
    { number: 1, position: 1, code: 'VER', lastLap: 75_100 },
    { number: 81, position: 2, code: 'PIA', lastLap: 75_573 },
    { number: 27, position: 3, code: 'HUL', lastLap: 78_100 },
  ],
};

const source = sessionSource(initial);
const server = await serveSessionState(source, 0, () => {});

async function snapshotOf(url: string): Promise<{ socket: WebSocket; state: SessionState }> {
  const socket = new WebSocket(url);
  const [message] = (await once(socket, 'message')) as [MessageEvent];
  const wire = JSON.parse(String(message.data)) as WireMessage;
  if (wire.type !== 'session-state') throw new Error(`expected a snapshot, got ${wire.type}`);
  return { socket, state: wire.state };
}

async function changeOf(socket: WebSocket): Promise<SessionChangeMessage['change']> {
  const [message] = (await once(socket, 'message')) as [MessageEvent];
  const wire = JSON.parse(String(message.data)) as WireMessage;
  if (wire.type !== 'session-change') throw new Error(`expected a change, got ${wire.type}`);
  return wire.change;
}

// Two browsers connect and take their snapshots.
const a = await snapshotOf(server.url);
const b = await snapshotOf(server.url);

// The next message each will receive is the change; listen before the update so neither is missed.
const changeA = changeOf(a.socket);
const changeB = changeOf(b.socket);
source.update(next);
const [foldInputA, receivedB] = [await changeA, await changeB];

// A third browser connects only now — the reconnect — and is sent the Session as it now stands.
const late = await snapshotOf(server.url);

a.socket.close();
b.socket.close();
late.socket.close();
await server.close();

const lines = [
  foldInputA,
  receivedB,
  applyChange(a.state, foldInputA),
  late.state,
];
process.stdout.write(`${lines.map((value) => JSON.stringify(value)).join('\n')}\n`);
