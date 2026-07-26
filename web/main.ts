// The dashboard: one WebSocket, and what it sends is what is on screen.
//
// The socket is opened back to the port this page came from — `server/` serves both, so there is
// no address to configure and no way for the page and its Session to disagree about which one
// they are showing.
//
// The protocol is snapshot then changes (#14): the first message is the whole Session, and every
// message after it is only what changed, folded into the Session already on screen. A dropped
// connection is shown rather than hidden — a frozen screen must never be mistaken for a red flag —
// and the socket reopens on its own, its fresh snapshot restoring the whole Session so a reload is
// never needed.

import type { SessionState, WireMessage } from '../domain/index.ts';
import { applyChange } from '../domain/index.ts';
import { timingScreen } from './timing-screen.ts';
import { sessionStrip } from './session-strip.ts';

function mount(selector: string, what: string): Element {
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`the page has no ${what} to draw into`);
  return element;
}

const strip = mount('.session-strip-mount', 'session strip');
const table = mount('.timing-table', 'timing table');
const connection = mount('.connection-status', 'connection status');

/** How long the screen shows the Session that connected before it dropped. Reopening is cheap and a
 * live Session should not sit visibly broken for long, so the wait is short and constant rather than
 * a backoff that would leave the last blip taking the longest to clear. */
const REOPEN_AFTER_MS = 1000;

let state: SessionState | undefined;

function render(): void {
  if (state === undefined) return;
  strip.innerHTML = sessionStrip(state);
  table.innerHTML = timingScreen(state);
}

function showConnection(status: 'live' | 'dropped'): void {
  connection.setAttribute('data-state', status);
}

function receive(message: WireMessage): void {
  if (message.type === 'session-state') {
    // A snapshot — the first message, or the first after a reconnect — is the whole Session, so it
    // replaces whatever was held rather than folding into it.
    state = message.state;
  } else if (state !== undefined) {
    state = applyChange(state, message.change);
  }
  render();
}

function connect(): void {
  const socket = new WebSocket(`ws://${location.host}`);

  socket.addEventListener('open', () => showConnection('live'));
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    receive(JSON.parse(event.data) as WireMessage);
  });

  // A close and an error are the same thing to the viewer — the pipeline is gone — and the same
  // thing to do about it: mark it on screen, keep the last Session visible, and reopen.
  // `atMostOnce` guards the pair firing together from reopening twice.
  const dropped = atMostOnce(() => {
    showConnection('dropped');
    setTimeout(connect, REOPEN_AFTER_MS);
  });
  socket.addEventListener('close', dropped);
  socket.addEventListener('error', dropped);
}

function atMostOnce(run: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    run();
  };
}

connect();
