// The Session clock a viewer moves (#15): it holds where the Replay stands and, while it is playing,
// walks that position forward in Session-time at the chosen speed, publishing each new frame through
// the same `SessionSource` a Live feed would.
//
// Nothing downstream can tell a Replay frame from a Live one — it is a `SessionState` like any other
// (ADR-0003) — except the chrome, which reads the `replay` clock this attaches. The Drivers come
// from the timeline, reconstructed from scratch at each position, so this file never has to make a
// backward step correct: it only has to ask the timeline for the right moment (timeline.ts).
//
// The wall-clock and the scheduler are taken as arguments so the walk can be driven a tick at a time
// in a test without waiting for real seconds to pass; in the program they are `Date.now` and
// `setInterval`.

import type { ReplayControl, SessionState } from '../../domain/index.ts';
import type { SessionSource } from '../session.ts';
import type { Timeline } from '../openf1/timeline.ts';

/** How often the clock republishes while playing. Four times a second is smooth enough for a
 * scrub handle and a countdown without flooding the socket with frames a viewer cannot read. */
const TICK_MS = 250;

/** The wall-clock and scheduler the clock runs against, so a test can supply its own. */
export interface Ticker {
  now(): number;
  /** Start ticking; return the way to stop. */
  every(ms: number, tick: () => void): () => void;
}

const REAL: Ticker = {
  now: () => Date.now(),
  every(ms, tick) {
    const handle = setInterval(tick, ms);
    return () => clearInterval(handle);
  },
};

export interface Replay {
  /** Apply a control a viewer sent — play, pause, scrub, or a change of speed. */
  control(control: ReplayControl): void;
  /**
   * Publish the current moment again, unmoved. For when the log beneath the clock has changed rather
   * than the position on it — a Driver opened, so frames now carry their depth (#18). The clock is
   * not what changed, so it does not pretend to have moved.
   */
  refresh(): void;
  /** Stop the clock for good, when the server is closing. */
  stop(): void;
}

/**
 * Drive `source` from `timeline`. Opens paused at the end of the Session — the whole finished
 * Session, the same state a straight read would give — so a Replay begins showing where it ended and
 * the viewer scrubs back into it. Publishes that opening frame at once, then again on every control
 * and, while playing, on every tick.
 */
export function replayClock(source: SessionSource, timeline: Timeline, ticker: Ticker = REAL): Replay {
  let position = timeline.end;
  let playing = false;
  let speed = 1;
  let last = ticker.now();

  const stopTicking = ticker.every(TICK_MS, () => {
    if (!playing) return;
    const now = ticker.now();
    advance((now - last) * speed);
    last = now;
  });

  function advance(byMillis: number): void {
    position = Math.min(position + byMillis, timeline.end);
    // Running off the end is where a Replay stops on its own: there is no next frame to walk to.
    if (position >= timeline.end) playing = false;
    publish();
  }

  function publish(): void {
    const frame: SessionState = {
      ...timeline.at(position),
      mode: 'replay',
      replay: { start: timeline.start, end: timeline.end, position, playing, speed },
    };
    source.update(frame);
  }

  publish();

  return {
    control(control) {
      switch (control.action) {
        case 'play':
          // Playing from the end is a request to watch it again, so it rewinds to the start rather
          // than sitting still with nowhere to go.
          if (position >= timeline.end) position = timeline.start;
          playing = true;
          last = ticker.now();
          publish();
          break;
        case 'pause':
          playing = false;
          publish();
          break;
        case 'scrub':
          position = Math.min(Math.max(control.position, timeline.start), timeline.end);
          publish();
          break;
        case 'speed':
          speed = control.speed;
          publish();
          break;
      }
    },
    refresh: publish,
    stop: stopTicking,
  };
}
