// The Replay controls (#15): the play button, the scrub bar, the clock readout and the speeds a
// viewer moves a past Session with. Drawn from `state.replay` and nothing else — so in a Live
// Session, which carries no such clock, there is nothing to draw and the bar is simply absent. That
// is the whole of "Live versus Replay is unmistakable, and no view branches on the mode": the rows
// do not know which mode they are in, and the presence of this bar is the difference.
//
// A pure function of the state, like the strip and the rows (session-strip.ts) — which is why it is
// here and not in `main.ts`: the render is testable without a DOM, and the `data-action` and
// `aria-pressed` attributes it writes are all `main.ts` needs to turn a click into a control.

import type { ReplayClock, SessionState } from '../domain/index.ts';

/** The speeds offered, in Session-seconds per wall-clock second. Real time in the middle, with a
 * half-speed for a close look and up to eight times for the long green stretches. */
const SPEEDS = [0.5, 1, 2, 4, 8];

/** The controls' markup, or nothing at all when the Session is not a Replay. */
export function replayControls(state: SessionState): string {
  const clock = state.replay;
  if (clock === undefined) return '';
  return [
    '<div class="replay-controls">',
    playButton(clock.playing),
    scrubBar(clock),
    `<span class="replay-controls__time">${replayElapsed(clock)}</span>`,
    speeds(clock.speed),
    '</div>',
  ].join('');
}

function playButton(playing: boolean): string {
  // One button that is whichever it is not doing: it says Pause while playing, so pressing it always
  // does what it says. `aria-pressed` carries the playing state for a reader that cannot see the word.
  return (
    `<button class="replay-controls__play" data-action="playpause"` +
    ` aria-pressed="${playing}">${playing ? 'Pause' : 'Play'}</button>`
  );
}

function scrubBar(clock: ReplayClock): string {
  // A range over the clock's own millisecond axis: the same numbers the server reconstructs against,
  // so what the handle says is exactly what a scrub asks for. A tenth-second step is finer than the
  // clock republishes at, so the handle never snaps away from where a viewer left it.
  return (
    `<input class="replay-controls__scrub" type="range" data-action="scrub"` +
    ` min="${clock.start}" max="${clock.end}" value="${clock.position}" step="100"` +
    ` aria-label="Session clock" />`
  );
}

function speeds(current: number): string {
  const buttons = SPEEDS.map(
    (speed) =>
      `<button class="replay-controls__speed" data-action="speed" data-speed="${speed}"` +
      ` aria-pressed="${speed === current}">${speed}&times;</button>`,
  ).join('');
  return `<div class="replay-controls__speeds">${buttons}</div>`;
}

/** How far into the Session the clock stands, over the whole of it: "12:04 / 1:28:33". Exported so
 * `main.ts` can refresh just this text on a tick without rebuilding the bar and losing the scrub
 * handle a viewer is dragging. */
export function replayElapsed(clock: ReplayClock): string {
  return `${clockText(clock.position - clock.start)} / ${clockText(clock.end - clock.start)}`;
}

function clockText(millis: number): string {
  const total = Math.max(0, Math.round(millis / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
