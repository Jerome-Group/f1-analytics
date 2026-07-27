// A per-lap trend, drawn (#16). The one place a value the feed never sent has to be drawn as
// nothing at all: the axis is the lap the value belongs to, not its position in the list, so a lap
// the feed skipped keeps its width and the line breaks across it rather than sloping through a value
// the race never ran. Joining the two ends would invent a lap time; leaving the space out would
// quietly rewrite the race.
//
// Only per-lap values are ever handed here. A per-second trace for twenty Drivers is the cost the
// whole frequency tiering exists to avoid (CONTEXT.md, "Per-lap tier"), so the shape of this file —
// a point per lap, and a gap per lap the feed did not send — is the shape that keeps it out.

/** One plotted lap: where it sits on the axis, and how high. `at` is the lap number or the tyre's
 *  age — an integer that steps by one from lap to lap, so a step of more than one is a lap missing. */
export interface Plot {
  at: number;
  value: number;
}

// The cell the design system lays out for a sparkline: 160 by 36, the run inside a four-pixel margin,
// the values between 8 and 30, and the floor the missing stub is drawn on at 33 (web/design-system).
const WIDTH = 160;
const MARGIN_X = 4;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 30;
const FLOOR = 33;
const HEAD_RADIUS = 3;

/**
 * The sparkline for one trend. Fewer than two laps is not a trend and is not an empty chart either,
 * so it says so with an em dash rather than a flat line. The optional `datum` is the dotted rule the
 * shape is read against — the Driver's own best — drawn only where one is given, and always inside the
 * plotted range so the run is placed against it.
 */
export function sparkline(points: readonly Plot[], label: string, datum?: number): string {
  if (points.length < 2) return '<span class="sparkline-absent">&mdash;</span>';

  const ordered = [...points].sort((a, b) => a.at - b.at);
  const x = axis(ordered.map((point) => point.at));
  const y = height([...ordered.map((point) => point.value), ...(datum === undefined ? [] : [datum])]);

  const marks: string[] = [];
  if (datum !== undefined) marks.push(`<line class="sparkline__datum" x1="0" y1="${round(y(datum))}" x2="${WIDTH}" y2="${round(y(datum))}" />`);

  const runs = split(ordered);
  runs.forEach((run, index) => {
    marks.push(`<polyline class="sparkline__run" points="${run.map((p) => `${round(x(p.at))},${round(y(p.value))}`).join(' ')}" />`);
    const next = runs[index + 1];
    // The laps between one run and the next are the laps the feed never sent: a dotted stub on the
    // floor, spanning exactly their width, so the absence is drawn rather than interpolated over.
    if (next !== undefined) marks.push(`<path class="sparkline__missing" d="M${round(x(run[run.length - 1]!.at))} ${FLOOR} H${round(x(next[0]!.at))}" />`);
  });

  const head = ordered[ordered.length - 1]!;
  marks.push(`<circle class="sparkline__now" cx="${round(x(head.at))}" cy="${round(y(head.value))}" r="${HEAD_RADIUS}" />`);

  return `<svg class="sparkline" viewBox="0 0 ${WIDTH} 36" role="img" aria-label="${label}">${marks.join('')}</svg>`;
}

/** Lap number to horizontal position, across the whole span the laps cover. A single lap number would
 *  divide by zero, but a sparkline of one point never gets here — two laps is the floor above. */
function axis(ats: readonly number[]): (at: number) => number {
  const lo = Math.min(...ats);
  const hi = Math.max(...ats);
  const span = hi - lo;
  return (at) => MARGIN_X + (span === 0 ? 0 : (at - lo) / span) * (WIDTH - 2 * MARGIN_X);
}

/** Value to vertical position, smaller sitting higher — a quicker lap and a smaller Gap both read as
 *  up. A run all at one value would divide by zero, so it sits on the middle line instead. */
function height(values: readonly number[]): (value: number) => number {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  return (value) => (span === 0 ? (PLOT_TOP + PLOT_BOTTOM) / 2 : PLOT_TOP + ((value - lo) / span) * (PLOT_BOTTOM - PLOT_TOP));
}

/** The laps split into runs: a break wherever the axis skips a lap, because a lap the feed did not
 *  send is a gap the line must not cross. Consecutive laps step by one; anything more is a hole. */
function split(ordered: readonly Plot[]): Plot[][] {
  const runs: Plot[][] = [];
  for (const point of ordered) {
    const current = runs[runs.length - 1];
    if (current !== undefined && point.at - current[current.length - 1]!.at === 1) current.push(point);
    else runs.push([point]);
  }
  return runs;
}

/** Coordinates to a tenth of a pixel — enough to place a point, short enough to keep the markup a
 *  timing screen can afford to rewrite twenty times a frame. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}
