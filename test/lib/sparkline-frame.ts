// What a frame of the Timing screen costs to build, with every one of twenty rows carrying its three
// per-lap sparklines (#16). The browser rebuilds the whole table on each update (web/main.ts:
// `table.innerHTML = timingScreen(state)`), so the string this builds is the per-frame work the JS is
// responsible for, and its size is what the browser then parses. Measured rather than assumed.
//
//   node test/lib/sparkline-frame.ts
//
// Prints the per-frame build time and the markup size, so the measurement in
// docs/measurements/twenty-rows-of-sparklines.md is reproduced by running it rather than trusted.

import type { Driver, Lap, SessionState } from '../../domain/index.ts';
import { timingScreen } from '../../web/timing-screen.ts';

const RECENT_LAPS = 12;
const FIELD = 20;
const FRAMES = 5000;

/** A Driver mid-race with a full window of laps behind them: every sparkline drawn, none absent, so
 *  the frame measured is the most expensive one the screen ever builds. */
function driver(position: number): Driver {
  const recentLaps: Lap[] = [];
  for (let lap = 40; lap < 40 + RECENT_LAPS; lap += 1) {
    // Deterministic but varied — a lap time that drifts, a Gap that opens, a tyre that ages — so the
    // sparklines have real shape rather than a straight line the browser draws for free.
    recentLaps.push({
      number: lap,
      time: 89_000 + ((lap * 37) % 900),
      gap: position * 900 + (lap - 40) * 130,
      tyreAge: lap - 28,
    });
  }
  const behind: Partial<Driver> = position === 1 ? {} : { gap: { millis: position * 900 }, interval: { millis: 900 } };
  return {
    number: position,
    code: `D${String(position).padStart(2, '0')}`,
    team: 'Ferrari',
    position,
    ...behind,
    lastLap: recentLaps[recentLaps.length - 1]!.time ?? 89_000,
    bestLap: 88_900,
    sectors: [
      { millis: 28_400, status: 'set' },
      { millis: 31_100, status: 'personal-best' },
      { millis: 29_600, status: 'set' },
    ],
    sectorBests: [28_300, 31_000, 29_400],
    speedTrap: 320 + position,
    tyre: { compound: 'medium', ageInLaps: 12 },
    stintLaps: 12,
    stint: 2,
    pitStops: 1,
    gridPosition: position,
    recentLaps,
    lapsCompleted: 40 + RECENT_LAPS - 1,
  };
}

const state: SessionState = {
  sessionKey: 9920,
  drivers: Array.from({ length: FIELD }, (_, index) => driver(index + 1)),
};

// A warm-up the timing does not count, so the figure is the steady state rather than the first build
// paying for the JIT.
for (let frame = 0; frame < 500; frame += 1) timingScreen(state);

const times: number[] = [];
let markup = '';
for (let frame = 0; frame < FRAMES; frame += 1) {
  const before = process.hrtime.bigint();
  markup = timingScreen(state);
  times.push(Number(process.hrtime.bigint() - before) / 1_000_000);
}

times.sort((a, b) => a - b);
const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
const median = times[Math.floor(times.length / 2)]!;
const p95 = times[Math.floor(times.length * 0.95)]!;
const bytes = Buffer.byteLength(markup, 'utf8');

process.stdout.write(
  [
    `field:       ${FIELD} Drivers, ${RECENT_LAPS} laps each, three sparklines per row`,
    `frames:      ${FRAMES}`,
    `mean:        ${mean.toFixed(3)} ms`,
    `median:      ${median.toFixed(3)} ms`,
    `p95:         ${p95.toFixed(3)} ms`,
    `frame budget:16.67 ms at 60 fps`,
    `markup:      ${(bytes / 1024).toFixed(1)} KiB`,
  ].join('\n') + '\n',
);
