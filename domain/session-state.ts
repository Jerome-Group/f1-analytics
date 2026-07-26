// The canonical model: what the backend holds and the browser renders, identical whether the
// Session is live or replayed (CONTEXT.md, "Session state").
//
// Nothing upstream reaches this file. An OpenF1 field name here is the moment ADR-0003's
// source-swappability claim stops being true, so `test/adapter.test.sh` checks it rather than
// trusting that nobody did it.
//
// Every field beyond the Driver's number is optional, and optional means *absent*: a value the
// feed has not given is missing from the object and missing from the wire, never zero and never
// a value left over from before. Story 38 is the whole reason the model is shaped this way.

/** A Driver's identity for a whole Session, and the one thing the feed never omits. */
export type DriverNumber = number;

/**
 * How far one car is behind another. A time while the two are on the same lap; whole laps once
 * they are not, because a lapped car's time behind is meaningless as a duration and enormous as
 * one (story: "a lap down is a lap down, not a two-minute gap"). The two forms are distinct so a
 * renderer cannot draw laps-down as though it were seconds.
 *
 * Named for the shape rather than for either measurement: a Gap and an Interval are both a
 * Separation, but neither is the other (CONTEXT.md), and calling the shared type `Gap` would make
 * the glossary's one forbidden sentence — "an Interval is a Gap" — the type signature.
 */
export type Separation = { millis: number } | { laps: number };

export interface Driver {
  number: DriverNumber;
  /** The three-letter code the Timing screen shows — `VER`, `NOR`. */
  code?: string;
  team?: string;
  /** Current classified position. One-based, so a Driver on track is never at position zero. */
  position?: number;
  /**
   * To the leader (CONTEXT.md, "Gap"). Absent for the leader themselves — a leader is not zero
   * seconds behind themselves, they are not behind anyone — and absent when the feed has not
   * placed the Driver against the field yet.
   */
  gap?: Separation;
  /**
   * To the car immediately ahead (CONTEXT.md, "Interval"). Not a synonym for `gap`: the two are
   * the point of this ticket and are kept apart so a transposition is a type the code cannot
   * write, not a mistake it can. Absent for the leader, who has no car ahead.
   */
  interval?: Separation;
  /** The Driver's most recently completed lap, in milliseconds. Absent before their first. */
  lastLap?: number;
  /** The Driver's best lap of the Session so far, in milliseconds. Absent before their first. */
  bestLap?: number;
}

export interface SessionState {
  /** Upstream's key for the Session. The dashboard does not invent its own. */
  sessionKey: number;
  /** In position order, a Driver the feed has not placed sorting last. */
  drivers: Driver[];
}
