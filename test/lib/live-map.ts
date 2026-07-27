// The live feed's accumulation, fed directly (test/live.test.sh). Each line of stdin is one MQTT
// document as `topic<TAB>json`, ingested in order; the Session state the feed builds is printed as
// JSON, so the assertions can read what the same Adapter the REST feed uses made of the stream.
//
//   printf 'v1/laps\t{"driver_number":1,...}\n' | node test/lib/live-map.ts
//
// This is to the live feed what adapter-map.ts is to the Adapter: the pure accumulation, with the
// re-publishes and change logs a finished recording cannot show handed straight in.

import { liveFeed } from '../../server/openf1/live-feed.ts';

const feed = liveFeed();

let input = '';
for await (const chunk of process.stdin) input += chunk;

for (const line of input.split('\n')) {
  if (line.trim() === '') continue;
  const tab = line.indexOf('\t');
  feed.ingest(line.slice(0, tab), line.slice(tab + 1));
}

process.stdout.write(`${JSON.stringify(feed.state())}\n`);
