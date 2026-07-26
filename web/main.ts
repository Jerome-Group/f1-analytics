// The dashboard: one WebSocket, and what it sends is what is on screen.
//
// The socket is opened back to the port this page came from — `server/` serves both, so there is
// no address to configure and no way for the page and its Session to disagree about which one
// they are showing.

import type { SessionStateMessage } from '../domain/index.ts';
import { timingScreen } from './timing-screen.ts';
import { sessionStrip } from './session-strip.ts';

const strip = document.querySelector('.session-strip-mount');
const table = document.querySelector('.timing-table');
if (strip === null) throw new Error('the page has no session strip to draw into');
if (table === null) throw new Error('the page has no timing table to draw into');

const socket = new WebSocket(`ws://${location.host}`);

socket.addEventListener('message', (event: MessageEvent<string>) => {
  const message = JSON.parse(event.data) as SessionStateMessage;
  strip.innerHTML = sessionStrip(message.state);
  table.innerHTML = timingScreen(message.state);
});
