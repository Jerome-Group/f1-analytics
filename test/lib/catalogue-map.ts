// The catalogue mapping, fed directly (#15): meetings, sessions and the set of Session keys that are
// on disk go in, and the domain `Catalogue` the picker renders comes out. Handed straight in, the way
// the Adapter's other mappings are (adapter-map.ts), because what matters here is the grouping, the
// ordering and the one fact the records do not carry — Backfilled or merely known.
//
//   node test/lib/catalogue-map.ts <<<'{ "meetings": [...], "sessions": [...], "backfilled": [9920] }'
//
// Prints the catalogue as JSON, and nothing else, so the assertions live in test/picker.test.sh.

import { catalogueFrom } from '../../server/openf1/catalogue.ts';

let json = '';
for await (const chunk of process.stdin) json += chunk;
const input = JSON.parse(json);

const catalogue = catalogueFrom(
  input.meetings ?? [],
  input.sessions ?? [],
  new Set<number>(input.backfilled ?? []),
);
process.stdout.write(`${JSON.stringify(catalogue)}\n`);
