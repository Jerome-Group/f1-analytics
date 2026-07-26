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

import type { ReplayClock, ReplayControl, SessionState, WireMessage } from '../domain/index.ts';
import { applyChange } from '../domain/index.ts';
import { timingScreen } from './timing-screen.ts';
import { sessionStrip } from './session-strip.ts';
import { replayControls, replayElapsed } from './replay-controls.ts';
import { mount } from './mount.ts';

const strip = mount('.session-strip-mount', 'session strip');
const table = mount('.timing-table', 'timing table');
const controls = mount('.replay-controls-mount', 'replay controls');
const connection = mount('.connection-status', 'connection status');

/** How long the screen shows the Session that connected before it dropped. Reopening is cheap and a
 * live Session should not sit visibly broken for long, so the wait is short and constant rather than
 * a backoff that would leave the last blip taking the longest to clear. */
const REOPEN_AFTER_MS = 1000;

let state: SessionState | undefined;
let socket: WebSocket | undefined;

function render(): void {
  if (state === undefined) return;
  strip.innerHTML = sessionStrip(state);
  table.innerHTML = timingScreen(state);
  drawControls(state.replay);
}

// The clock republishes several times a second while playing, so the controls are *updated*, not
// rebuilt: rebuilding would recreate the scrub handle four times a second and tear it out from under
// a viewer dragging it. The bar's structure is drawn once — when a Replay's clock first appears, and
// removed when it is not one — and thereafter only the values that moved are written in place. It is
// chrome: the rows are rendered the same whether or not this draws anything (#3).
let dragging = false;

function drawControls(clock: ReplayClock | undefined): void {
  if (clock === undefined) {
    if (controls.childElementCount > 0) controls.replaceChildren();
    return;
  }
  if (controls.querySelector('.replay-controls') === null) {
    controls.innerHTML = replayControls({ sessionKey: 0, drivers: [], replay: clock });
    return;
  }

  const play = controls.querySelector('.replay-controls__play');
  play?.setAttribute('aria-pressed', String(clock.playing));
  if (play !== null) play.textContent = clock.playing ? 'Pause' : 'Play';

  const time = controls.querySelector('.replay-controls__time');
  if (time !== null) time.textContent = replayElapsed(clock);

  // The handle a viewer is holding is left alone until they let go, so a scrub is never yanked back
  // by a frame that crossed it on the wire.
  const scrub = controls.querySelector('.replay-controls__scrub') as HTMLInputElement | null;
  if (scrub !== null && !dragging) {
    scrub.min = String(clock.start);
    scrub.max = String(clock.end);
    scrub.value = String(clock.position);
  }

  for (const button of controls.querySelectorAll('.replay-controls__speed')) {
    button.setAttribute('aria-pressed', String(Number(button.getAttribute('data-speed')) === clock.speed));
  }
}

function send(control: ReplayControl): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(control));
}

// The controls send back what they were rendered to say: a click reads the button's own
// `data-action` and `aria-pressed`, so the page never holds a second copy of what state a control is
// in. Delegated from the mount rather than each control, because `render` rewrites its contents on
// every frame and a listener on the mount survives that; the socket a control rides is whichever is
// open now, so a reconnect swaps it underneath without the controls knowing.
controls.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest('[data-action]');
  const action = button?.getAttribute('data-action');
  if (action === 'playpause') {
    send({ type: 'replay-control', action: button?.getAttribute('aria-pressed') === 'true' ? 'pause' : 'play' });
  } else if (action === 'speed') {
    send({ type: 'replay-control', action: 'speed', speed: Number(button?.getAttribute('data-speed')) });
  }
});
// A scrub in progress: `input` fires as the handle moves and `change` when it is let go. Holding
// `dragging` across that span keeps `drawControls` from writing over the handle mid-drag.
controls.addEventListener('input', (event) => {
  const scrub = event.target as HTMLInputElement | null;
  if (scrub?.getAttribute('data-action') === 'scrub') {
    dragging = true;
    send({ type: 'replay-control', action: 'scrub', position: Number(scrub.value) });
  }
});
controls.addEventListener('change', (event) => {
  if ((event.target as HTMLInputElement | null)?.getAttribute('data-action') === 'scrub') {
    dragging = false;
  }
});

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
  // The page carries which Session it is showing in its own query (the picker put it there); the
  // socket names it too, so the server knows which one to play back before it sends the first frame.
  socket = new WebSocket(`ws://${location.host}/${location.search}`);

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
