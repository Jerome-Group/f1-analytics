// The Replay timeline, fed directly. A recording cut from a real Session (test/server.test.sh)
// carries a whole finished Session, which is only the timeline's last frame; the frames *before*
// it — a Session mid-flight, and the same clock moved backwards onto an earlier one — are the whole
// point of #15, and they are easiest to pin against records with dates chosen to make the boundary
// obvious. So the reconstruction is exercised here with records handed straight in, exactly as the
// Adapter's own mapping is (adapter-map.ts).
//
//   node test/lib/replay-timeline.ts <position> <<<'{ "drivers": [...], "position": [...], ... }'
//
// Prints the Session state the timeline reconstructs at `position` as JSON — its bounds and its
// Drivers — and nothing else, so the assertions live in test/replay.test.sh with every other one.

import { timelineFrom } from '../../server/openf1/timeline.ts';

const at = process.argv[2];
if (at === undefined) {
  process.stderr.write('usage: node test/lib/replay-timeline.ts <position>\n');
  process.exit(64);
}

let json = '';
for await (const chunk of process.stdin) json += chunk;
const input = JSON.parse(json);

const timeline = timelineFrom(
  input.sessionKey ?? 0,
  input.drivers ?? [],
  input.position ?? [],
  input.intervals ?? [],
  input.laps ?? [],
  input.stints ?? [],
);

// `end` and `start` are printed as offsets from `start`, so the assertions read in Session-relative
// seconds rather than in epoch milliseconds nobody can eyeball.
const position = at === 'end' ? timeline.end : at === 'start' ? timeline.start : timeline.start + Number(at) * 1000;
const state = timeline.at(position);
process.stdout.write(
  `${JSON.stringify({ span: (timeline.end - timeline.start) / 1000, drivers: state.drivers })}\n`,
);
