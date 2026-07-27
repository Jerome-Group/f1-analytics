// The client's reconnect, exercised against a real broker (test/live.test.sh). The broker publishes
// one document, drops the connection, and — when the client dials back — publishes another. If both
// documents reach the client, it reconnected and resubscribed on its own, which is the connection
// half of the ticket's reconnect guarantee (the state half is the feed's, and shown separately).
//
// Prints the driver number from each document, in the order they arrived, so the assertion reads that
// the second — the one only the second connection carried — got through.

import { subscribe } from '../../server/mqtt/client.ts';
import { startBroker } from './mqtt-broker.ts';

const received: number[] = [];

const broker = await startBroker((connection, index) => {
  if (index === 0) {
    connection.publish('v1/drivers', JSON.stringify({ driver_number: 1, session_key: 9 }));
    // Drop only once the document is on its way, so the client sees it before the connection goes.
    setTimeout(() => connection.drop(), 50);
  } else {
    connection.publish('v1/drivers', JSON.stringify({ driver_number: 44, session_key: 9 }));
  }
});

const connection = subscribe({
  host: '127.0.0.1',
  port: broker.port,
  topics: ['v1/drivers'],
  onMessage: (_topic, payload) => {
    const record = JSON.parse(payload.toString('utf8')) as { driver_number: number };
    received.push(record.driver_number);
    if (received.length === 2) done();
  },
});

const giveUp = setTimeout(() => {
  process.stderr.write(`the client received ${received.length} of 2 documents before giving up\n`);
  connection.close();
  void broker.close().then(() => process.exit(1));
}, 15_000);

function done(): void {
  clearTimeout(giveUp);
  process.stdout.write(`${received.join(' ')}\n`);
  connection.close();
  void broker.close().then(() => process.exit(0));
}
