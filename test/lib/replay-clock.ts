// The Session clock (#15), driven a step at a time. The clock walks Session-time forward against a
// wall-clock and a scheduler, and both are arguments to it (clock.ts) precisely so a test can supply
// its own and take the steps by hand rather than waiting for real seconds. A fake timeline stands in
// for the reconstruction — that is exercised on its own (replay-timeline.ts) — so what is asserted
// here is only the clock's own behaviour: where it opens, what a control does, and how a tick and a
// speed combine to move it.
//
// Prints the published `replay` clock after each scripted step, one per line, and nothing else, so
// the assertions live in test/replay.test.sh.

import { sessionSource } from '../../server/session.ts';
import { replayClock, type Ticker } from '../../server/replay/clock.ts';
import type { Timeline } from '../../server/openf1/timeline.ts';

// A Session that runs from 0 to 40s. `at` is irrelevant to the clock's own logic, so it returns an
// empty field — the Drivers are the timeline's business, and it has its own test.
const timeline: Timeline = { start: 0, end: 40_000, at: () => ({ sessionKey: 1, drivers: [] }) };

// A wall-clock the script moves by hand, and a scheduler that hands back its tick to be pulled.
let wall = 1_000_000;
let pull = (): void => {};
const ticker: Ticker = {
  now: () => wall,
  every: (_ms, tick) => {
    pull = tick;
    return () => {};
  },
};

const source = sessionSource({ sessionKey: 1, drivers: [] });
const lines: string[] = [];
source.subscribe((change) => {
  const clock = change.replay;
  if (clock !== undefined) {
    lines.push(`position=${clock.position} playing=${clock.playing} speed=${clock.speed}`);
  }
});

// Subscribed above, so the opening frame the clock publishes as it starts is the first line captured.
const replay = replayClock(source, timeline, ticker);

/** Move the wall-clock on and pull the scheduler's tick, as real time passing would. */
function tick(wallMillis: number): void {
  wall += wallMillis;
  pull();
}

replay.control({ type: 'replay-control', action: 'speed', speed: 2 });
replay.control({ type: 'replay-control', action: 'scrub', position: 10_000 });
replay.control({ type: 'replay-control', action: 'play' });
tick(3_000); // 3 wall-seconds at 2x → 6 Session-seconds → 16_000
tick(20_000); // 20 wall-seconds at 2x → 40 Session-seconds → past the end, so it clamps and stops
replay.control({ type: 'replay-control', action: 'play' }); // from the end → rewinds to the start
replay.control({ type: 'replay-control', action: 'pause' });

replay.stop();
process.stdout.write(`${lines.join('\n')}\n`);
