// The MQTT wire format, driven from the command line so the assertions live in test/mqtt.test.sh
// with every other assertion in this repository. Encoding is checked as the hex a broker would read;
// decoding is checked by building the PUBLISH frames a broker sends — including one split across two
// reads and one whose length needs two bytes — and reading them back through the real decoder.
//
//   node test/lib/mqtt-map.ts connect
//   node test/lib/mqtt-map.ts roundtrip
//
// A PUBLISH is built here rather than in server/mqtt because this project never publishes, so its
// encoder has no place in the shipped protocol — the test fabricates the bytes the broker would.

import {
  DISCONNECT_PACKET,
  PINGREQ_PACKET,
  PUBLISH,
  decodePackets,
  encodeConnect,
  encodeSubscribe,
  parsePublish,
} from '../../server/mqtt/protocol.ts';
import { framePublish } from './mqtt-frame.ts';

function publishes(buffer: Buffer): string[] {
  const { packets } = decodePackets(buffer);
  return packets
    .filter((packet) => packet.type === PUBLISH)
    .map((packet) => {
      const { topic, payload } = parsePublish(packet);
      return `${topic}|${payload.toString('utf8')}`;
    });
}

const command = process.argv[2];
switch (command) {
  case 'connect':
    process.stdout.write(`${encodeConnect('client', 30).toString('hex')}\n`);
    break;
  case 'subscribe':
    process.stdout.write(`${encodeSubscribe(1, ['v1/laps', 'v1/stints']).toString('hex')}\n`);
    break;
  case 'ping':
    process.stdout.write(`${PINGREQ_PACKET.toString('hex')}\n`);
    break;
  case 'disconnect':
    process.stdout.write(`${DISCONNECT_PACKET.toString('hex')}\n`);
    break;
  case 'roundtrip': {
    // Two whole PUBLISH frames back to back in one read: both come out, in order, nothing left over.
    const buffer = Buffer.concat([framePublish('v1/laps', '{"a":1}'), framePublish('v1/drivers', '{"b":2}')]);
    const { rest } = decodePackets(buffer);
    process.stdout.write(`${publishes(buffer).join(' ')} rest=${rest.length}\n`);
    break;
  }
  case 'partial': {
    // One frame split across two reads. The first read holds no whole packet, so it yields none and
    // keeps every byte as `rest`; the two reads together yield the one frame.
    const whole = framePublish('v1/intervals', '{"gap_to_leader":1.5}');
    const cut = Math.floor(whole.length / 2);
    const first = decodePackets(whole.subarray(0, cut));
    process.stdout.write(`first=${first.packets.length} rest=${first.rest.length} `);
    process.stdout.write(`whole=${publishes(whole).join(' ')}\n`);
    break;
  }
  case 'long': {
    // A payload past 127 bytes needs a two-byte remaining length; it must survive the round trip whole.
    const payload = JSON.stringify({ note: 'x'.repeat(300) });
    const [read] = publishes(framePublish('v1/position', payload));
    process.stdout.write(`${read === `v1/position|${payload}` ? 'intact' : 'torn'} len=${payload.length}\n`);
    break;
  }
  default:
    process.stderr.write(`unknown command: ${String(command)}\n`);
    process.exit(64);
}
