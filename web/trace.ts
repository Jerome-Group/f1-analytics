// The telemetry trace (#18): the per-second tier, drawn — speed, throttle, brake, gear and RPM over
// the seconds just gone.
//
// This is the one renderer in the project that draws per-second data, and it exists only because it
// is drawn for one Driver. The sparkline beside it is per-lap and says so in its own file: a point
// per lap, on a lap axis. This is the other side of that split (CONTEXT.md, "Per-second tier") — a
// point per reading, on a clock — and the two are separate files precisely so neither can quietly
// become the other.
//
// A channel the feed did not send is not drawn at all, and a stretch of seconds it stopped sending
// breaks the line rather than being sloped through: the same rule the sparkline keeps, for the same
// reason. A trace with a hole in it says the feed had a hole in it.

import type { Reading } from '../domain/index.ts';

/** The plotted area of one channel. Wider than a sparkline because it is drawn once, for the Driver
 *  who is open, rather than twenty times across a row. */
const WIDTH = 640;
const HEIGHT = 44;
const MARGIN_X = 4;
const PLOT_TOP = 6;
const PLOT_BOTTOM = 38;

/** How many ordinary sampling steps a silence has to last before it is drawn as one. Under it the
 *  feed is merely irregular, which it always is; over it, seconds are genuinely missing. */
const BREAK_AFTER_STEPS = 4;

/**
 * One channel of the trace: which value it reads off a reading, what to call it, and the range it is
 * drawn against. A fixed range is what makes a channel readable at a glance — half throttle is half
 * height whatever the lap did — so the ones that have a natural full scale carry it, and speed and
 * RPM, which do not, are drawn against what the window actually held.
 */
interface Channel {
  key: string;
  label: string;
  of: (reading: Reading) => number | undefined;
  unit: string;
  /** The full scale, where the channel has one. Absent means the window's own range. */
  scale?: readonly [number, number];
}

const CHANNELS: readonly Channel[] = [
  { key: 'speed', label: 'Speed', of: (reading) => reading.speed, unit: 'km/h' },
  { key: 'throttle', label: 'Throttle', of: (reading) => reading.throttle, unit: '%', scale: [0, 100] },
  { key: 'brake', label: 'Brake', of: (reading) => reading.brake, unit: '%', scale: [0, 100] },
  { key: 'gear', label: 'Gear', of: (reading) => reading.gear, unit: '', scale: [0, 8] },
  { key: 'rpm', label: 'RPM', of: (reading) => reading.rpm, unit: '' },
];

/** What the panel says where the Session has sent no readings at all — during a Live window, where
 *  the tier may be Gated, as much as before a car has turned a wheel. Never a blank space. */
const NOTHING = '<p class="trace-absent">No telemetry for these seconds.</p>';

/**
 * The whole trace for one Driver. Every channel shares one time axis — the span the window covers —
 * so a braking point lines up with the throttle lifting and the gear falling, which is the only
 * reason to draw five channels rather than five charts.
 */
export function trace(readings: readonly Reading[]): string {
  if (readings.length < 2) return NOTHING;
  const ordered = [...readings].sort((a, b) => a.at - b.at);
  const x = axis(ordered[0]!.at, ordered[ordered.length - 1]!.at);
  const silence = ordinaryStep(ordered) * BREAK_AFTER_STEPS;
  const drawn = CHANNELS.flatMap((channel) => {
    const points = ordered.flatMap((reading) => {
      const value = channel.of(reading);
      return value === undefined ? [] : [{ at: reading.at, value }];
    });
    return points.length < 2 ? [] : [channelRow(channel, points, x, silence)];
  });
  return drawn.length === 0 ? NOTHING : drawn.join('');
}

/** One point of one channel: when it was read, and what it read. */
interface Point {
  at: number;
  value: number;
}

/** One channel: its name, the latest value it holds, and the line over the window. */
function channelRow(channel: Channel, points: readonly Point[], x: (at: number) => number, silence: number): string {
  const values = points.map((point) => point.value);
  const [lo, hi] = channel.scale ?? [Math.min(...values), Math.max(...values)];
  const y = height(lo, hi);
  const latest = points[points.length - 1]!.value;
  const unit = channel.unit === '' ? '' : `<span class="trace__unit">${channel.unit}</span>`;
  return [
    `<div class="trace__channel" data-channel="${channel.key}">`,
    `<span class="trace__label">${channel.label}</span>`,
    `<span class="trace__now">${latest}${unit}</span>`,
    `<svg class="trace__plot" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${channel.label} over the last seconds">`,
    ...runs(points, silence).map(
      (run) =>
        `<polyline class="trace__run" points="${run.map((point) => `${round(x(point.at))},${round(y(point.value))}`).join(' ')}" />`,
    ),
    '</svg>',
    '</div>',
  ].join('');
}

/** The window's clock to horizontal position. The span is the readings' own, so the trace fills the
 *  width whether the feed sent thirty seconds of them or three. */
function axis(from: number, to: number): (at: number) => number {
  const span = to - from;
  return (at) => MARGIN_X + (span === 0 ? 0 : (at - from) / span) * (WIDTH - 2 * MARGIN_X);
}

/** Value to vertical position, larger sitting higher — full throttle at the top, where the eye
 *  expects it. A channel that held one value all window sits on the middle line. */
function height(lo: number, hi: number): (value: number) => number {
  const span = hi - lo;
  return (value) =>
    span === 0 ? (PLOT_TOP + PLOT_BOTTOM) / 2 : PLOT_BOTTOM - ((value - lo) / span) * (PLOT_BOTTOM - PLOT_TOP);
}

/** How often the feed sends, for this window: the median gap between readings. Taken from the
 *  readings rather than assumed, because the rate is upstream's and it varies. */
function ordinaryStep(readings: readonly Reading[]): number {
  const steps = readings.slice(1).map((reading, index) => reading.at - readings[index]!.at);
  steps.sort((a, b) => a - b);
  const median = steps[steps.length >> 1];
  return median === undefined || median <= 0 ? Number.POSITIVE_INFINITY : median;
}

/** The channel split into the stretches the feed actually sent it for: a break wherever more than
 *  `silence` passed between one reading and the next. */
function runs(points: readonly Point[], silence: number): Point[][] {
  const parts: Point[][] = [];
  for (const point of points) {
    const current = parts[parts.length - 1];
    if (current !== undefined && point.at - current[current.length - 1]!.at <= silence) current.push(point);
    else parts.push([point]);
  }
  return parts;
}

/** Coordinates to a tenth of a pixel — enough to place a point, short enough to keep the markup
 *  cheap to rewrite several times a second, which this one is. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}
