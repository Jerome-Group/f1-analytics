// RFC 6455 §4.2.2: an HTTP connection becomes a WebSocket when the server proves it understood
// the client's key. The proof is the key, a constant the protocol names, SHA-1 and base64.

import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const THE_ONLY_VERSION = '13';

/** The response head that opens the socket, or nothing if the request was not asking for one. */
export function acceptance(headers: IncomingHttpHeaders): string | undefined {
  const key = headers['sec-websocket-key'];
  if (typeof key !== 'string' || headers['sec-websocket-version'] !== THE_ONLY_VERSION) {
    return undefined;
  }

  const accept = createHash('sha1')
    .update(key + WEBSOCKET_GUID)
    .digest('base64');

  return [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n');
}
