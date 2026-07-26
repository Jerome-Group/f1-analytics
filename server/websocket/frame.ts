// RFC 6455 §5.2 framing, for the two things this server does with a socket: send a whole text
// message, and close when the browser does.
//
// A server never masks what it sends (§5.1), and every message here is sent in one frame, so a
// frame is a final frame and the length is the only part that varies.

const FINAL_TEXT = 0x81;
const FINAL_CLOSE = 0x88;
const CLOSE_OPCODE = 0x8;

const TWO_BYTE_LENGTHS_START_AT = 126;
const EIGHT_BYTE_LENGTHS_START_AT = 65_536;

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
