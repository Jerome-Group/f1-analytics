// The one WebSocket the browser reads, on the port it read its page from.
//
// One socket rather than one per stream, because a future public deployment fans one upstream
// connection out to many browsers and that cannot be retrofitted onto a frontend holding several
// (#3). It is written here rather than taken from a package for the reason in ADR-0011: the cost
// of a dependency is that `test/run` would first have to install one.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import type { SessionChangeMessage, SessionStateMessage } from '../../domain/index.ts';
import type { SessionSource } from '../session.ts';
import { closeFrame, isClose, textFrame } from './frame.ts';
import { acceptance } from './handshake.ts';

export interface SessionStateServer {
  /** Where a browser connects. The port is only known once it is listening. */
  readonly url: string;
  /**
   * Where the viewer opens the dashboard. The same port: one origin, so the page and the socket
   * cannot disagree about which Session they are showing.
   */
  readonly page: string;
  close(): Promise<void>;
}

/** What a browser gets when it asks this port for a page instead of upgrading to a socket. */
export type Page = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

/**
 * Serves one Session's evolving state to every browser that connects, and the dashboard that renders
 * it. A connecting browser is sent the whole Session as it stands (a snapshot); thereafter every
 * browser is sent only what changed, encoded once and written to all of them. That single encode
 * fanned out to many sockets is the whole reason `server/` and `web/` are separate processes (#3):
 * a browser opening its own upstream connection could never be one of many.
 *
 * A finished Session never changes, so the finished-Session path sends a snapshot and nothing after
 * it; the live and Replay feeds drive `source.update`, and this needs no change to carry them.
 */
export async function serveSessionState(
  source: SessionSource,
  port: number,
  page: Page,
): Promise<SessionStateServer> {
  const open = new Set<Duplex>();

  const unsubscribe = source.subscribe((change) => {
    const message: SessionChangeMessage = { type: 'session-change', change };
    const frame = textFrame(JSON.stringify(message));
    for (const socket of open) socket.write(frame);
  });

  const http = createServer((request, response) => {
    void page(request, response);
  });

  http.on('upgrade', (request, socket) => {
    const head = acceptance(request.headers);
    if (head === undefined) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    open.add(socket);
    socket.on('close', () => open.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      if (isClose(chunk)) socket.end(closeFrame());
    });

    // Encoded per connection, not once at startup: a browser connecting mid-Session — the reload
    // this protocol exists to make cheap — must be sent the Session as it stands now, not as it
    // stood when the server began.
    const snapshot: SessionStateMessage = { type: 'session-state', state: source.state };
    socket.write(head);
    socket.write(textFrame(JSON.stringify(snapshot)));
  });

  http.listen(port, '127.0.0.1');
  await once(http, 'listening');
  const listening = http.address() as AddressInfo;

  return {
    url: `ws://127.0.0.1:${listening.port}`,
    page: `http://127.0.0.1:${listening.port}/`,
    async close() {
      unsubscribe();
      for (const socket of open) socket.destroy();
      http.close();
      await once(http, 'close');
    },
  };
}
