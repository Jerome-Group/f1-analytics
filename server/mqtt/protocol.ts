// MQTT 3.1.1 over a byte stream, only as far as this project speaks it (OASIS mqtt-v3.1.1).
//
// The live path subscribes to a broker on this machine and receives whole JSON documents; it never
// publishes, never uses a will, and asks for QoS 0. So this file encodes the three packets a
// subscriber sends — CONNECT, SUBSCRIBE, and the PINGREQ that keeps the connection alive — and
// decodes the ones it receives, of which only PUBLISH carries anything the feed reads. It is written
// here rather than taken from a package for the reason `server/websocket/` is: a dependency would
// make `test/run` install one before it could say whether the browser gets the right state
// (ADR-0011). Like that server, anything the protocol offers and this does not use — QoS 1 and 2, a
// will, retained-message flags on the way out — is absent rather than stubbed.
//
// This half is pure: bytes in, packets out, and no socket. `client.ts` holds the socket, so the wire
// format can be pinned on its own (test/mqtt.test.sh).

// The MQTT control packet types this project names — the high nibble of a packet's first byte
// (mqtt-v3.1.1 §2.2.1). Only those this code reads or writes are here: a subscriber acts on CONNACK
// and PUBLISH and sends the other three, so SUBACK and PINGRESP — received and deliberately ignored —
// have no constant, exactly as the WebSocket server names no frame it does not use (ADR-0011).
export const CONNECT = 1;
export const CONNACK = 2;
export const PUBLISH = 3;
export const SUBSCRIBE = 8;
export const PINGREQ = 12;
export const DISCONNECT = 14;

/** One decoded control packet: its type, the four flag bits of the first byte, and the remaining
 * bytes (the variable header and payload) left for a type-specific reader below. */
export interface Packet {
  type: number;
  flags: number;
  body: Buffer;
}

/** A received PUBLISH, read down to what the feed uses: the topic it arrived on and its payload. */
export interface Publish {
  topic: string;
  payload: Buffer;
}

/**
 * CONNECT for a clean, anonymous subscriber (mqtt-v3.1.1 §3.1). Clean session because this project
 * keeps its own accumulated state and wants none of the broker's held across a reconnect; no
 * username, password or will, because the broker allows anonymous connections and this holds no
 * credential (ADR-0002). `keepalive` is the seconds after which, hearing nothing, the broker may
 * drop the connection — the client sends a PINGREQ inside that window to hold it open.
 */
export function encodeConnect(clientId: string, keepaliveSeconds: number): Buffer {
  const variableHeader = Buffer.concat([
    encodeString('MQTT'), // Protocol name.
    Buffer.from([0x04]), // Protocol level 4 is 3.1.1.
    Buffer.from([0x02]), // Connect flags: clean session, nothing else.
    beUint16(keepaliveSeconds),
  ]);
  return packet(CONNECT, 0, Buffer.concat([variableHeader, encodeString(clientId)]));
}

/**
 * SUBSCRIBE to one or more topic filters, all at QoS 0 (mqtt-v3.1.1 §3.8). The packet identifier is
 * echoed in the SUBACK, so it must be non-zero; the caller supplies it. QoS 0 is what the Ingestor
 * publishes at, and it means an inbound PUBLISH carries no packet identifier to acknowledge.
 */
export function encodeSubscribe(packetId: number, topics: readonly string[]): Buffer {
  const requests = topics.map((topic) => Buffer.concat([encodeString(topic), Buffer.from([0x00])]));
  const body = Buffer.concat([beUint16(packetId), ...requests]);
  // SUBSCRIBE's flags nibble is a fixed 0b0010, not zero, unlike every other packet this sends.
  return packet(SUBSCRIBE, 0b0010, body);
}

/** PINGREQ and DISCONNECT carry nothing, so each is its two-byte fixed header and no more. */
export const PINGREQ_PACKET = packet(PINGREQ, 0, Buffer.alloc(0));
export const DISCONNECT_PACKET = packet(DISCONNECT, 0, Buffer.alloc(0));

/**
 * Take as many whole packets as `buffer` holds, and hand back the bytes left over — a packet split
 * across two reads leaves its start in `rest` to be prefixed to the next chunk. A stream is a stream,
 * so a reader that assumed one read is one packet would tear frames in half under load.
 */
export function decodePackets(buffer: Buffer): { packets: Packet[]; rest: Buffer } {
  const packets: Packet[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const header = buffer.readUInt8(offset);
    const length = decodeRemainingLength(buffer, offset + 1);
    // The remaining length itself may be incomplete, or complete but promising more body than has
    // arrived — either way the packet is unfinished, so stop and keep everything from here.
    if (length === undefined || offset + 1 + length.width + length.value > buffer.length) break;
    const start = offset + 1 + length.width;
    packets.push({
      type: header >> 4,
      flags: header & 0x0f,
      body: buffer.subarray(start, start + length.value),
    });
    offset = start + length.value;
  }
  return { packets, rest: buffer.subarray(offset) };
}

/**
 * Read a PUBLISH body (mqtt-v3.1.1 §3.3): the topic name, then — only when the packet's QoS is above
 * zero — a two-byte packet identifier, then the payload. This project subscribes at QoS 0, so in
 * practice there is no identifier; the QoS is read from the flags rather than assumed so a broker
 * that upgrades a message is parsed rather than misaligned.
 */
export function parsePublish(packet: Packet): Publish {
  const topicLength = packet.body.readUInt16BE(0);
  const topic = packet.body.toString('utf8', 2, 2 + topicLength);
  const qos = (packet.flags >> 1) & 0b11;
  const payloadStart = 2 + topicLength + (qos > 0 ? 2 : 0);
  return { topic, payload: packet.body.subarray(payloadStart) };
}

/** A CONNACK's return code (mqtt-v3.1.1 §3.2.2.3): 0 is "connection accepted", anything else a
 * refusal the client should not treat as connected. The first body byte is the session-present
 * flag, which a clean session ignores. */
export function connackReturnCode(packet: Packet): number {
  return packet.body.readUInt8(1);
}

/** A UTF-8 string as MQTT frames one: a two-byte big-endian length, then the bytes (§1.5.3). */
function encodeString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([beUint16(bytes.length), bytes]);
}

function beUint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

/** A whole packet: the type and flags in the first byte, the variable-length remaining length, and
 * the body (§2.2). */
function packet(type: number, flags: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([(type << 4) | flags]), encodeRemainingLength(body.length), body]);
}

/**
 * The remaining length as MQTT encodes it (§2.2.3): seven bits of the value per byte, the top bit set
 * on every byte but the last. A length under 128 is a single byte; the scheme runs to four bytes and
 * 268,435,455, which no packet this receives approaches.
 */
function encodeRemainingLength(length: number): Buffer {
  const bytes: number[] = [];
  let remaining = length;
  do {
    let byte = remaining & 0x7f;
    remaining >>= 7;
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return Buffer.from(bytes);
}

/**
 * Decode a remaining length beginning at `offset`, returning its value and how many bytes it took —
 * or `undefined` when the buffer stops in the middle of it, which is a packet that has not fully
 * arrived. Four bytes is the most the encoding uses; a continuation bit on a fifth is malformed.
 */
function decodeRemainingLength(buffer: Buffer, offset: number): { value: number; width: number } | undefined {
  let value = 0;
  let multiplier = 1;
  for (let width = 0; width < 4; width++) {
    if (offset + width >= buffer.length) return undefined;
    const byte = buffer.readUInt8(offset + width);
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value, width: width + 1 };
    multiplier *= 128;
  }
  return undefined;
}
