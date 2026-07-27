// A broker that speaks just enough MQTT to stand in for Mosquitto in a test, so the live client and
// the live path can be exercised end to end without the container stack. It parses the client's
// packets with the same decoder the client uses (server/mqtt/protocol.ts), answers CONNECT,
// SUBSCRIBE and the heartbeat, and hands each subscribed connection to a caller that publishes to it.
//
// It is the counterpart to spawn-server.ts's fake REST API: the upstream half of a seam, replaced by
// something that answers only out of a script, so what is being tested is this project's code and not
// a live Session.

import { createServer, type Server, type Socket } from 'node:net';
import { once } from 'node:events';
import { CONNECT, PINGREQ, SUBSCRIBE, decodePackets } from '../../server/mqtt/protocol.ts';
import { framePublish } from './mqtt-frame.ts';

/** A connection the client has opened and subscribed on: publish documents to it, or drop it to make
 * the client reconnect. */
export interface BrokerConnection {
  publish(topic: string, payload: string): void;
  /** Close the socket, so the client's reconnect can be exercised. */
  drop(): void;
}

export interface Broker {
  readonly port: number;
  close(): Promise<void>;
}

/** Start a broker on an ephemeral port. `onReady` is called once per connection, after the client has
 * connected and subscribed — the moment a real broker would begin delivering. */
export async function startBroker(onReady: (connection: BrokerConnection, index: number) => void): Promise<Broker> {
  let connections = 0;
  const server = createServer((socket) => {
    const index = connections++;
    let buffer: Buffer = Buffer.alloc(0);
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk: Buffer) => {
      const { packets, rest } = decodePackets(Buffer.concat([buffer, chunk]));
      buffer = rest;
      for (const packet of packets) {
        if (packet.type === CONNECT) socket.write(Buffer.from([0x20, 0x02, 0x00, 0x00])); // CONNACK, accepted.
        else if (packet.type === PINGREQ) socket.write(Buffer.from([0xd0, 0x00])); // PINGRESP.
        else if (packet.type === SUBSCRIBE) {
          socket.write(suback(packet.body));
          onReady(connectionOf(socket), index);
        }
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: (server.address() as { port: number }).port,
    close: () => closed(server),
  };
}

function connectionOf(socket: Socket): BrokerConnection {
  return {
    publish: (topic, payload) => socket.write(framePublish(topic, payload)),
    drop: () => socket.destroy(),
  };
}

/** SUBACK echoing the SUBSCRIBE's packet id and granting QoS 0 for each topic it named. The client
 * ignores it, so only its shape has to be right. */
function suback(subscribe: Buffer): Buffer {
  const packetId = subscribe.subarray(0, 2);
  let topics = 0;
  let offset = 2;
  while (offset < subscribe.length) {
    const topicLength = subscribe.readUInt16BE(offset);
    offset += 2 + topicLength + 1; // topic, then its one requested-QoS byte.
    topics++;
  }
  const granted = Buffer.alloc(topics, 0x00);
  const body = Buffer.concat([packetId, granted]);
  return Buffer.concat([Buffer.from([0x90, body.length]), body]);
}

async function closed(server: Server): Promise<void> {
  server.close();
  await once(server, 'close');
}
