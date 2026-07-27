// The live feed's accumulation, fed directly (test/live.test.sh). Each line of stdin is one MQTT
// document as `topic<TAB>json`, ingested in order; the Session state the feed builds is printed as
// JSON, so the assertions can read what the same Adapter the REST feed uses made of the stream.
//
//   printf 'v1/laps\t{"driver_number":1,...}\n' | node test/lib/live-map.ts [driver]
//
// This is to the live feed what adapter-map.ts is to the Adapter: the pure accumulation, with the
// re-publishes and change logs a finished recording cannot show handed straight in. A Driver may be
// named, which opens them (#18) — depth out of what the live subscription holds, and no more.
//
// The topics subscribed to are printed on the first line, so what the live path reads is asserted
// rather than assumed: `v1/car_data` being absent from them is the boundary between #18 and #42.

import { LIVE_TOPICS, liveFeed } from '../../server/openf1/live-feed.ts';

const feed = liveFeed();
const opened = process.argv[2];

let input = '';
for await (const chunk of process.stdin) input += chunk;

for (const line of input.split('\n')) {
  if (line.trim() === '') continue;
  const tab = line.indexOf('\t');
  feed.ingest(line.slice(0, tab), line.slice(tab + 1));
}

if (opened !== undefined) feed.open(Number(opened));

process.stdout.write(`${LIVE_TOPICS.join(' ')}\n${JSON.stringify(feed.state())}\n`);
