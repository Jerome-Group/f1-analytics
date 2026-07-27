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

/**
 * Where a Driver is, so that a stationary car is never misread as a slow one (story 14). On track
 * is the ordinary state and carries no chip; the other four are the exceptions worth marking. A
 * Driver who has retired stays in the field, plainly out of it, rather than freezing in place.
 */
export type DriverState = 'on-track' | 'pit-lane' | 'in-box' | 'out-lap' | 'retired';

/**
 * One completed lap of a Driver's recent history — the per-lap facts the sparklines are drawn from
 * (#16), and only those. Nothing on this type updates more than once per lap, which is the whole of
 * the rule the frequency tiering rests on: a lap-time trend redraws once per Driver per lap, where a
 * throttle trace would redraw several times a second (CONTEXT.md, "Per-lap tier").
 *
 * Every measurement beyond the lap number is optional in the model's usual sense — a lap the feed
 * timed but never placed against the field carries a `time` and no `gap` — and a lap the feed never
 * sent at all is simply absent from the Driver's list, so the sparkline breaks across it rather than
 * drawing a line the race never ran (story 38). The lap number is what makes that break the right
 * width: it is the axis, not the position in the list.
 */
export interface Lap {
  /** Which lap this is, one-based. The x-axis the lap-time and Gap trends share, so a lap the feed
   *  skipped keeps its width as a gap in the line rather than being closed over. */
  number: number;
  /** The lap's duration in milliseconds — the height of the lap-time trend, and the pace the tyre-age
   *  trend plots. Absent for a lap still on the road, or one the feed never timed. */
  time?: number;
  /** The Gap to the leader as the lap completed, in milliseconds — the height of the Gap trend. A car
   *  a lap or more down has no duration to plot (CONTEXT.md, "Gap"), so its Gap is absent here rather
   *  than an enormous time. */
  gap?: number;
  /** The tyre's age in laps as the lap ran — the x-axis of pace against tyre age, which falls back
   *  when a fresh set goes on and the trend starts a new Stint. */
  tyreAge?: number;
  /** Which Stint this lap ran in, one-based. The tyre-age trend draws the current set alone — a pit
   *  stop resets the age, and an earlier set's laps would send the axis backwards — so the renderer
   *  reads this to know where the current Stint begins rather than inferring it from the age falling. */
  stint?: number;
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
  /** Where the Driver is now. Absent means on track — the ordinary state, drawn without a chip. */
  state?: DriverState;
  /**
   * The grid slot the Driver started from, one-based (#12). The change against their current
   * position is what says who is having a good afternoon. Its source is the timing feed's position
   * at lights out rather than a scrape of formula1.com, recorded in docs/adr/0012; absent until
   * that position has been settled, and for a Driver who started from the pit lane.
   */
  gridPosition?: number;
  /**
   * The Driver's recent laps, oldest first — what the per-lap sparklines draw (#16). A window rather
   * than the whole Session: a trend is read from the last dozen or so laps, and holding only those is
   * how the per-lap tier stays clear of the per-second cost it exists to avoid. Absent before the
   * Driver's first completed lap.
   */
  recentLaps?: readonly Lap[];
  /**
   * How many laps the Driver has completed — the last column of the row. Not the length of
   * `recentLaps`, which is only the window that is drawn: a Driver forty laps in still shows a dozen.
   * Absent before their first completed lap.
   */
  lapsCompleted?: number;
}

/** Which mode the screen is in. Chrome only (#3): no Driver fact ever branches on it. */
export type Mode = 'live' | 'replay';

/**
 * Where a Replay's Session clock stands, so the controls can be drawn (#15). Every field is chrome:
 * the scrub bar and the play button read it, and no Driver view ever does — which is the whole of
 * "no view branches on which mode is active, only the chrome differs".
 *
 * The bounds and the position are milliseconds since the epoch — Session wall-clock, the same axis
 * the feed's records carry — so the controls can place the handle without a second time system to
 * keep in step. A Live Session has no such clock, so this is absent there and present in Replay.
 */
export interface ReplayClock {
  /** The Session's first recorded moment: the far-left of the scrub bar. */
  start: number;
  /** The Session's last recorded moment: the far-right, and where a Replay opens (#15). */
  end: number;
  /** Where the clock stands now, between `start` and `end`. */
  position: number;
  /** Whether the clock is running. A Replay opens paused at `end`, so nothing moves until asked. */
  playing: boolean;
  /** How many Session-seconds pass per wall-clock second while playing — 1 is real time. */
  speed: number;
}

/**
 * The track's condition, drawn as a band across the whole strip because it is the one thing that
 * must read without looking at anything (#13). Safety car is a flag here rather than a separate
 * field, because on the strip it is one of the conditions the band shows.
 */
export type Flag = 'green' | 'yellow' | 'red' | 'safety-car' | 'chequered';

/** Which Session this is — the words, as opposed to what happened in it (CONTEXT.md, "Catalogue"). */
export interface SessionIdentity {
  /** The Meeting — a whole Grand Prix weekend, e.g. "Belgian Grand Prix". */
  meeting?: string;
  /** The Session within it, e.g. "Race", "Qualifying". */
  session?: string;
  /** The circuit it is run at. */
  circuit?: string;
}

/**
 * How much of the Session is left. Time and laps both, because a race counts down laps and a
 * practice counts down time, and either may be the one that is running. Each absent until the feed
 * has said, so a Session with no lap count does not read as being on lap zero of zero.
 */
export interface SessionClock {
  /** Time remaining, as the feed gives it, e.g. "1:12:04". */
  remaining?: string;
  currentLap?: number;
  totalLaps?: number;
}

/** One race control message — an incident, an investigation, a penalty — as the feed sent it. */
export interface RaceControlMessage {
  /** Wall-clock time it was issued, as the feed gave it, e.g. "14:38:12". */
  time?: string;
  text: string;
}

/** The conditions, so a strategy change can be anticipated before it happens (story 18). */
export interface Weather {
  /** Track temperature, in degrees Celsius. */
  trackTemp?: number;
  /** Air temperature, in degrees Celsius. */
  airTemp?: number;
  /** Relative humidity, as a percentage. */
  humidity?: number;
  /** Wind speed, in metres per second. */
  windSpeed?: number;
  /** Whether it is raining. Absent where the feed has not said, never a default of dry. */
  raining?: boolean;
}

export interface SessionState {
  /** Upstream's key for the Session. The dashboard does not invent its own. */
  sessionKey: number;
  /** In position order, a Driver the feed has not placed sorting last. */
  drivers: Driver[];
  /** Which Session this is, for the strip. Absent until the catalogue has named it. */
  identity?: SessionIdentity;
  /** The Session's own status, e.g. "Running", "Suspended", "Finished". Always meant to be shown. */
  status?: string;
  /** The track's condition. Absent until the feed has stated one, never assumed green. */
  flag?: Flag;
  /** How much of the Session remains. */
  clock?: SessionClock;
  /** Race control messages, newest first: what just happened explains what is on screen now. */
  raceControl?: readonly RaceControlMessage[];
  /** The conditions. */
  weather?: Weather;
  /** Live or Replay, for the strip's chrome. The one field the two modes may differ in (#3). */
  mode?: Mode;
  /** Where the Replay's Session clock stands, for the controls. Absent in a Live Session (#15). */
  replay?: ReplayClock;
}
