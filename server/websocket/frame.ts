// RFC 6455 §5.2 framing, for the three things this server does with a socket: send a whole text
// message, read the short text a browser sends back, and close when the browser does.
//
// A server never masks what it sends (§5.1), and every message here is sent in one frame, so a
// frame it writes is a final frame and the length is the only part that varies. What it reads is the
// mirror image: a browser always masks (§5.3), and the only thing it sends up this socket is a
// Replay control — a few dozen bytes of JSON — so `clientText` reads a single short masked frame and
// leaves the fragmented and enormous cases to a day something needs them.

const FINAL_TEXT = 0x81;
const FINAL_CLOSE = 0x88;
const CLOSE_OPCODE = 0x8;
const TEXT_OPCODE = 0x1;
const MASK_BIT = 0x80;
const LENGTH_MASK = 0x7f;

const TWO_BYTE_LENGTHS_START_AT = 126;
const EIGHT_BYTE_LENGTHS_START_AT = 65_536;
const MASK_KEY_BYTES = 4;

export function textFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  return Buffer.concat([header(payload.length), payload]);
}

export function closeFrame(): Buffer {
  return Buffer.from([FINAL_CLOSE, 0]);
}

/**
 * Whether the browser has begun closing. Only the opcode is read: the payload of a close frame
 * is a status code this server has nothing to do with, and every other frame a browser can send
 * is one this server did not ask for.
 */
export function isClose(chunk: Buffer): boolean {
  return ((chunk.at(0) ?? 0) & 0x0f) === CLOSE_OPCODE;
}

/**
 * The text of a single short, masked frame a browser sent, or `undefined` for anything else — a
 * close, a fragment, a frame longer than the two-byte length form begins at. A browser must mask
 * (§5.3), so an unmasked frame is malformed and read as nothing rather than trusted. The four-byte
 * key XORs the payload back to the bytes the browser wrote.
 */
export function clientText(chunk: Buffer): string | undefined {
  const opcode = (chunk.at(0) ?? 0) & 0x0f;
  const second = chunk.at(1) ?? 0;
  const length = second & LENGTH_MASK;
  if (opcode !== TEXT_OPCODE || (second & MASK_BIT) === 0 || length >= TWO_BYTE_LENGTHS_START_AT) {
    return undefined;
  }
  const keyAt = 2;
  const payloadAt = keyAt + MASK_KEY_BYTES;
  if (chunk.length < payloadAt + length) return undefined;
  const unmasked = Buffer.alloc(length);
  for (let i = 0; i < length; i += 1) {
    unmasked[i] = (chunk[payloadAt + i] ?? 0) ^ (chunk[keyAt + (i % MASK_KEY_BYTES)] ?? 0);
  }
  return unmasked.toString('utf8');
}

function header(length: number): Buffer {
  if (length < TWO_BYTE_LENGTHS_START_AT) {
    return Buffer.from([FINAL_TEXT, length]);
  }
  if (length < EIGHT_BYTE_LENGTHS_START_AT) {
    const head = Buffer.alloc(4);
    head.writeUInt8(FINAL_TEXT, 0);
    head.writeUInt8(TWO_BYTE_LENGTHS_START_AT, 1);
    head.writeUInt16BE(length, 2);
    return head;
  }
  const head = Buffer.alloc(10);
  head.writeUInt8(FINAL_TEXT, 0);
  head.writeUInt8(127, 1);
  head.writeBigUInt64BE(BigInt(length), 2);
  return head;
}
