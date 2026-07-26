// The dashboard: one WebSocket, and what it sends is what is on screen.
//
// The socket is opened back to the port this page came from — `server/` serves both, so there is
// no address to configure and no way for the page and its Session to disagree about which one
// they are showing.

import type { SessionStateMessage } from '../domain/index.ts';
import { timingScreen } from './timing-screen.ts';

const table = document.querySelector('.timing-table');
if (table === null) throw new Error('the page has no timing table to draw into');

const socket = new WebSocket(`ws://${location.host}`);

socket.addEventListener('message', (event: MessageEvent<string>) => {
  const message = JSON.parse(event.data) as SessionStateMessage;
  table.innerHTML = timingScreen(message.state);
});
