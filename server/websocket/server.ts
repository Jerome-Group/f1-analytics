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
import type { SessionState, SessionStateMessage } from '../../domain/index.ts';
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
 * Serves one Session's state to every browser that connects, and the dashboard that renders it.
 * The state is encoded once: a finished Session does not change, and a field is the same bytes
 * for every viewer.
 */
export async function serveSessionState(
  state: SessionState,
  port: number,
  page: Page,
): Promise<SessionStateServer> {
  const message: SessionStateMessage = { type: 'session-state', state };
  const snapshot = textFrame(JSON.stringify(message));
  const open = new Set<Duplex>();

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

    socket.write(head);
    socket.write(snapshot);
  });

  http.listen(port, '127.0.0.1');
  await once(http, 'listening');
  const listening = http.address() as AddressInfo;

  return {
    url: `ws://127.0.0.1:${listening.port}`,
    page: `http://127.0.0.1:${listening.port}/`,
    async close() {
      for (const socket of open) socket.destroy();
      http.close();
      await once(http, 'close');
    },
  };
}
