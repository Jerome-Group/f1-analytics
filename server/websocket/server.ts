// The one WebSocket the browser reads.
//
// One socket rather than one per stream, because a future public deployment fans one upstream
// connection out to many browsers and that cannot be retrofitted onto a frontend holding several
// (#3). It is written here rather than taken from a package for the reason in ADR-0011: the cost
// of a dependency is that `test/run` would first have to install one.

import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import type { SessionState, SessionStateMessage } from '../../domain/index.ts';
import { closeFrame, isClose, textFrame } from './frame.ts';
import { acceptance } from './handshake.ts';

export interface SessionStateServer {
  /** Where a browser connects. The port is only known once it is listening. */
  readonly url: string;
  close(): Promise<void>;
}

/**
 * Serves one Session's state to every browser that connects. The state is encoded once: a
 * finished Session does not change, and twenty Drivers is the same bytes for every viewer.
 */
export async function serveSessionState(
  state: SessionState,
  port: number,
): Promise<SessionStateServer> {
  const message: SessionStateMessage = { type: 'session-state', state };
  const snapshot = textFrame(JSON.stringify(message));
  const open = new Set<Duplex>();

  const http = createServer((_request, response) => {
    response
      .writeHead(426, { 'content-type': 'text/plain', upgrade: 'websocket' })
      .end('This port serves Session state over a WebSocket.\n');
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
    async close() {
      for (const socket of open) socket.destroy();
      http.close();
      await once(http, 'close');
    },
  };
}
