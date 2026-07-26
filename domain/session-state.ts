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

/**
 * How good a sector time is against the field and against the Driver themselves — the
 * purple/green/yellow everyone already reads without a legend (CONTEXT.md, "Timing screen").
 * `session-best` is the fastest anyone has set (purple), `personal-best` the Driver's own best
 * (green), `set` a time slower than their own best (yellow). Which one it is depends on the whole
 * field, so it is settled where the whole field is — above the row, never in it.
 */
export type SectorStatus = 'session-best' | 'personal-best' | 'set';

/** One sector of the current lap: the time, and how good it is. */
export interface Sector {
  millis: number;
  status: SectorStatus;
}

/**
 * The three sectors of the lap in progress. A slot is absent until the Driver crosses that
 * sector's line this lap, so a sector not yet set reads as absent and never as last lap's time
 * (story: "a sector not yet set reads as absent"). Always three, because a Formula 1 lap is.
 */
export type Sectors = readonly [Sector?, Sector?, Sector?];

/**
 * The Driver's own best in each of the three sectors so far, drawn beside the live sector. It
 * persists across the lap boundary — a sector the current lap has not reached yet still shows what
 * the Driver has done in it — so it is held apart from `Sectors`, which is only ever this lap.
 */
export type SectorBests = readonly [number?, number?, number?];

/** The five dry and wet compounds, each with its own colour everyone reads (CONTEXT.md, "Stint"). */
export type Compound = 'soft' | 'medium' | 'hard' | 'intermediate' | 'wet';

/**
 * The set of tyres a Driver is on now. `ageInLaps` is the age of the rubber — every lap it has
 * turned, including any it was fitted already carrying — and is deliberately not the number of laps
 * run in the current Stint: a set can be fitted scrubbed, and drawing the two as one number would
 * misrepresent every used set on the grid (CONTEXT.md, "Stint"). The distinction is the point of
 * this type, so laps run in the Stint lives on the Driver, apart, and the two are never merged.
 */
export interface Tyre {
  compound: Compound;
  ageInLaps: number;
}

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
  /** The lap in progress, sector by sector. Absent slots are sectors not yet crossed this lap. */
  sectors?: Sectors;
  /** The Driver's own best in each sector so far, drawn beside the live sector times. */
  sectorBests?: SectorBests;
  /** The speed trap reading for the current lap, in km/h. Absent where the feed has not sent it. */
  speedTrap?: number;
  /** The set of tyres the Driver is on now. Absent before the feed has said what they are on. */
  tyre?: Tyre;
  /**
   * Laps run in the current Stint. Held apart from the tyre's age so a set fitted with laps already
   * on it reads as older than the Stint is long, which is the whole distinction (CONTEXT.md).
   */
  stintLaps?: number;
  /** The current Stint number, one-based: a Driver on their first set of tyres is on Stint one. */
  stint?: number;
  /** How many times the Driver has pitted this Session. Zero before their first stop, absent
   * before the feed has said. */
  pitStops?: number;
}

export interface SessionState {
  /** Upstream's key for the Session. The dashboard does not invent its own. */
  sessionKey: number;
  /** In position order, a Driver the feed has not placed sorting last. */
  drivers: Driver[];
}
