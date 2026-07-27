// The Adapter's mapping, fed directly. A recording cut from a real Session (test/server.test.sh)
// carries the numbers and the absences, but a finished Session with no lapped car cannot carry the
// one case the model draws differently — a car a lap or more down — and a transposition is easier
// to see against numbers chosen to make it obvious. So the pure mapping is exercised here with
// records handed straight in, exactly as seam 2 hands the render fabricated Session state.
//
//   node test/lib/adapter-map.ts <<<'{ "drivers": [...], "intervals": [...], ... }'
//
// Prints the Drivers the Adapter produced as JSON, and nothing else, so the assertions live in
// test/adapter.test.sh with every other assertion in this repository.

import { sessionStateFrom } from '../../server/openf1/adapter.ts';

let json = '';
for await (const chunk of process.stdin) json += chunk;
const input = JSON.parse(json);

const state = sessionStateFrom(
  input.sessionKey ?? 0,
  input.drivers ?? [],
  input.position ?? [],
  input.intervals ?? [],
  input.laps ?? [],
  input.stints ?? [],
);
process.stdout.write(`${JSON.stringify(state.drivers)}\n`);
