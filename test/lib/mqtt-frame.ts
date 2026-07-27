// A QoS 0 PUBLISH, framed the way a broker sends one (mqtt-v3.1.1 §3.3): type nibble 3, the
// remaining length, a two-byte topic length, the topic, then the payload — no packet identifier,
// because QoS 0 carries none. This is the shape the Ingestor publishes documents in.
//
// It lives in the test library and not in server/mqtt because this project only ever *receives*
// PUBLISH; its encoder has no place in the shipped protocol. Two test tools need it — the stand-in
// broker (mqtt-broker.ts) and the wire-format check (mqtt-map.ts) — so it is written once here.

import { PUBLISH } from '../../server/mqtt/protocol.ts';

export function framePublish(topic: string, payload: string): Buffer {
  const topicBytes = Buffer.from(topic, 'utf8');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(topicBytes.length);
  const body = Buffer.concat([length, topicBytes, Buffer.from(payload, 'utf8')]);

  // Remaining length by the same seven-bits-per-byte rule the decoder reads (§2.2.3), so a long
  // payload exercises its multi-byte form.
  const remaining: number[] = [];
  let value = body.length;
  do {
    let byte = value & 0x7f;
    value >>= 7;
    if (value > 0) byte |= 0x80;
    remaining.push(byte);
  } while (value > 0);

  return Buffer.concat([Buffer.from([PUBLISH << 4]), Buffer.from(remaining), body]);
}
