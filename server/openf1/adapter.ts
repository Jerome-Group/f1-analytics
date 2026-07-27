// Where OpenF1 stops and this project's own model begins.
//
// Both input feeds end here — Replay's REST reader and, later, the live MQTT subscriber — and
// both hand the rest of the system the same Session state, which is what lets the Timing screen
// never branch on which one it is looking at (ADR-0003).

import type {
  Compound,
  Driver,
  DriverNumber,
  Lap,
  LapDetail,
  LapSector,
  OpenedDriver,
  Radio,
  Reading,
  SectorStatus,
  Separation,
  SessionState,
  Stint,
  Tyre,
} from '../../domain/index.ts';
import { byPosition } from '../../domain/index.ts';
import type {
  CarDataRecord,
  DriverRecord,
  IntervalRecord,
  LapRecord,
  PositionRecord,
  StintRecord,
  TeamRadioRecord,
} from './records.ts';

export function sessionStateFrom(
  sessionKey: number,
  driverRecords: readonly DriverRecord[],
  positionRecords: readonly PositionRecord[],
  intervalRecords: readonly IntervalRecord[],
  lapRecords: readonly LapRecord[],
  stintRecords: readonly StintRecord[],
): SessionState {
  const standing = latestPerDriver(positionRecords);
  const separation = latestPerDriver(intervalRecords);
  const intervals = perDriver(intervalRecords, byDate);
  const stints = perDriver(stintRecords, byLapStart);
  const laps = lapsPerDriver(lapRecords, intervals, stints);
  const drivers = driverRecords.map((record) =>
    driverFrom(
      record,
      standing.get(record.driver_number),
      separation.get(record.driver_number),
      laps.get(record.driver_number),
      stints.get(record.driver_number),
    ),
  );
  return { sessionKey, drivers: drivers.sort(byPosition) };
}

/** `/v1/position` and `/v1/intervals` are both change logs, so a Driver's current value is their
 * most recent reading. */
function latestPerDriver<Record extends { driver_number: number; date: string }>(
  records: readonly Record[],
): Map<number, Record> {
  const standing = new Map<number, Record>();
  for (const record of records) {
    const held = standing.get(record.driver_number);
    if (held === undefined || held.date <= record.date) standing.set(record.driver_number, record);
  }
  return standing;
}

/** A change log or a discrete stream split by Driver and put in order, so each Driver's history can be
 * read on its own — the intervals a lap's Gap is looked up in, the Stints a lap's tyre age comes from. */
function perDriver<Record extends { driver_number: number }>(
  records: readonly Record[],
  order: (a: Record, b: Record) => number,
): Map<number, Record[]> {
  const byDriver = new Map<number, Record[]>();
  for (const record of records) {
    const held = byDriver.get(record.driver_number) ?? [];
    held.push(record);
    byDriver.set(record.driver_number, held);
  }
  for (const held of byDriver.values()) held.sort(order);
  return byDriver;
}

const byDate = (a: IntervalRecord, b: IntervalRecord): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const byLapStart = (a: StintRecord, b: StintRecord): number => a.lap_start - b.lap_start;

/** How many recent laps the model keeps for the per-lap sparklines. Enough to read a trend from,
 * few enough that the window stays a per-lap cost and never drifts onto the per-second tier the
 * frequency split exists to keep it off (CONTEXT.md, "Per-lap tier"; the sparkline is drawn over the
 * "last twelve laps" in web/design-system). */
const RECENT_LAPS = 12;

/**
 * What a Driver's laps come to: the most recent completed lap, the quickest of the Session so far
 * (story: "best of the Session so far, not merely the last"), how many have been run, the number of
 * that latest lap, and the recent window the sparklines draw. Times in milliseconds. Built only for a
 * Driver with a completed lap — a lap in progress carries no duration — so a Driver with none is
 * simply absent from the map.
 */
interface Laps {
  last: number;
  best: number;
  completed: number;
  latestLap: number;
  recent: Lap[];
}

function lapsPerDriver(
  records: readonly LapRecord[],
  intervals: Map<number, IntervalRecord[]>,
  stints: Map<number, StintRecord[]>,
): Map<number, Laps> {
  const completed = new Map<number, Map<number, LapRecord>>();
  for (const record of records) {
    if (record.lap_duration === null) continue;
    const held = completed.get(record.driver_number) ?? new Map<number, LapRecord>();
    held.set(record.lap_number, record);
    completed.set(record.driver_number, held);
  }
  const laps = new Map<number, Laps>();
  for (const [driver, byLap] of completed) {
    laps.set(driver, summarise(byLap, intervals.get(driver), stints.get(driver)));
  }
  return laps;
}

/** A Driver's completed laps, keyed by lap number, read down to what the row and its sparklines show.
 * The recent window is taken by lap *number*, not by count, so a lap the feed never sent leaves a gap
 * of the right width in the window rather than pulling an older lap in to fill it. Each window lap
 * carries its time, and the Gap and tyre age that stood when it ran — a lap without a placed Gap, or
 * before the feed named the tyre, is missing that fact rather than holding a nought (#16). */
function summarise(
  byLap: Map<number, LapRecord>,
  intervals: IntervalRecord[] | undefined,
  stints: StintRecord[] | undefined,
): Laps {
  const numbers = [...byLap.keys()].sort((a, b) => a - b);
  const latest = numbers[numbers.length - 1]!;
  const windowStart = latest - RECENT_LAPS + 1;
  const durations = numbers.map((number) => seconds(byLap.get(number)!.lap_duration!));
  return {
    last: seconds(byLap.get(latest)!.lap_duration!),
    best: Math.min(...durations),
    completed: numbers.length,
    latestLap: latest,
    recent: numbers.filter((number) => number >= windowStart).map((number) => lapOf(byLap.get(number)!, intervals, stints)),
  };
}

/** One window lap as the model holds it: its time always, its Gap and tyre age where the feed placed
 * them. Absence stays absence, so the trend breaks across it rather than drawing an invented value. */
function lapOf(record: LapRecord, intervals: IntervalRecord[] | undefined, stints: StintRecord[] | undefined): Lap {
  const lap: Lap = { number: record.lap_number, time: seconds(record.lap_duration!) };
  const gap = gapAt(intervals, lapCompletedAt(record));
  const stint = stintAt(stints, record.lap_number);
  const age = tyreAge(stint, record.lap_number);
  if (gap !== undefined) lap.gap = gap;
  if (age !== undefined) lap.tyreAge = age;
  if (stint !== undefined) lap.stint = stint.stint_number;
  return lap;
}

/**
 * When a lap's fact became true — its start plus its duration — in epoch milliseconds, or absent for a
 * lap the recording did not date (a whole-Session read, which has no clock to place laps on and no Gap
 * trend to draw). Defined once here because both the Gap trend and the Replay clock read it: the
 * timeline counts a lap only once `now` has passed this moment (timeline.ts), so the two cannot drift.
 */
export function lapCompletedAt(record: LapRecord): number | undefined {
  if (record.date_start == null || record.lap_duration === null) return undefined;
  const started = Date.parse(record.date_start);
  return Number.isNaN(started) ? undefined : started + seconds(record.lap_duration);
}

/** The Gap to the leader that stood when a lap ended: the most recent intervals reading at or before
 * the lap's completion. A reading a lap or more down is not a duration to plot, so it is absent here —
 * the Gap trend breaks rather than spiking, exactly as the model keeps laps-down and seconds apart. */
function gapAt(intervals: IntervalRecord[] | undefined, completed: number | undefined): number | undefined {
  if (intervals === undefined || completed === undefined) return undefined;
  let lo = 0;
  let hi = intervals.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Date.parse(intervals[mid]!.date) <= completed) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return undefined;
  const separation = separationOf(intervals[found]!.gap_to_leader);
  return separation !== undefined && 'millis' in separation ? separation.millis : undefined;
}

/** The Stint a lap ran in: the one whose span of laps covers it. */
function stintAt(stints: StintRecord[] | undefined, lap: number): StintRecord | undefined {
  return stints?.find((record) => record.lap_start <= lap && lap <= record.lap_end);
}

/** The tyre's age at a given lap of its Stint: the age the set was fitted carrying, plus the laps it
 * has turned since (CONTEXT.md, "Stint"). Absent where no Stint covers the lap, or the feed gave no
 * age. */
function tyreAge(stint: StintRecord | undefined, lap: number): number | undefined {
  if (stint === undefined || stint.tyre_age_at_start === null) return undefined;
  return stint.tyre_age_at_start + (lap - stint.lap_start);
}

const COMPOUNDS: Record<string, Compound> = {
  SOFT: 'soft',
  MEDIUM: 'medium',
  HARD: 'hard',
  INTERMEDIATE: 'intermediate',
  WET: 'wet',
};

/** The set on the car now, drawn as the tyre badge and its age (#11): the Stint covering the latest
 * completed lap, its compound and the rubber's age there, the laps run in it, and the stops it took to
 * reach it. Absent where no Stint covers that lap or the feed gave no compound. */
interface CurrentTyre {
  tyre: Tyre;
  stint: number;
  stintLaps: number;
  pitStops: number;
}

function tyreOf(stints: StintRecord[] | undefined, latestLap: number): CurrentTyre | undefined {
  const current = stintAt(stints, latestLap);
  if (current === undefined) return undefined;
  const compound = current.compound === null ? undefined : COMPOUNDS[current.compound.toUpperCase()];
  const ageInLaps = tyreAge(current, latestLap);
  if (compound === undefined || ageInLaps === undefined) return undefined;
  return {
    tyre: { compound, ageInLaps },
    stint: current.stint_number,
    stintLaps: latestLap - current.lap_start + 1,
    // Each Stint after the first was reached by a stop, so the current Stint number less one is how
    // many times the set has been changed — the pit count the row shows (#11).
    pitStops: current.stint_number - 1,
  };
}

function driverFrom(
  record: DriverRecord,
  position: PositionRecord | undefined,
  separation: IntervalRecord | undefined,
  laps: Laps | undefined,
  stints: StintRecord[] | undefined,
): Driver {
  const driver: Driver = { number: record.driver_number };
  // Assigned only when the feed gave something, so that what it did not give is absent from the
  // object and absent from the wire. `?? undefined` would leave the key there, holding nothing.
  const code = text(record.name_acronym);
  const team = text(record.team_name);
  const place = ordinal(position?.position);
  // Gap reads its own field and Interval reads its own — the transposition #9 forbids at the render
  // is a line the Adapter cannot write here either, because the two are never the same expression.
  const gap = separationOf(separation?.gap_to_leader);
  const interval = separationOf(separation?.interval);
  if (code !== undefined) driver.code = code;
  if (team !== undefined) driver.team = team;
  if (place !== undefined) driver.position = place;
  if (gap !== undefined) driver.gap = gap;
  if (interval !== undefined) driver.interval = interval;
  if (laps !== undefined) {
    driver.lastLap = laps.last;
    driver.bestLap = laps.best;
    driver.lapsCompleted = laps.completed;
    driver.recentLaps = laps.recent;
    const tyre = tyreOf(stints, laps.latestLap);
    if (tyre !== undefined) {
      driver.tyre = tyre.tyre;
      driver.stintLaps = tyre.stintLaps;
      driver.stint = tyre.stint;
      driver.pitStops = tyre.pitStops;
    }
  }
  return driver;
}

// --- The opened Driver (#18) -------------------------------------------------------------------
//
// Depth for one Driver: the Stint history behind the badge on their row, their laps sector by
// sector, what their engineer said, and the per-second trace. A separate entry point rather than a
// wider `sessionStateFrom`, because it is asked for separately — nothing below is built for a Driver
// nobody opened, and that, rather than any filter downstream, is what makes the per-second tier
// affordable (CONTEXT.md, "Per-second tier").

/**
 * Everything behind one Driver, from the same laps and Stints the twenty rows are built from plus
 * the two streams nothing else reads. `lapRecords` is the whole field's, not this Driver's: which
 * sector times are purple is settled against everyone, exactly as it is for the row (#10). Each part
 * is left out where the feed gave nothing for it, so a Session with no radio carries no radio rather
 * than an empty list standing in for one.
 */
export function openedDriverFrom(
  number: DriverNumber,
  lapRecords: readonly LapRecord[],
  stintRecords: readonly StintRecord[],
  radioRecords: readonly TeamRadioRecord[],
  readings: readonly CarDataRecord[],
): OpenedDriver {
  const own = lapRecords
    .filter((record) => record.driver_number === number)
    .sort((a, b) => a.lap_number - b.lap_number);
  const session = bestSectors(lapRecords);
  const personal = bestSectors(own);

  const opened: OpenedDriver = { number };
  const stints = stintsOf(stintRecords, number, own[own.length - 1]?.lap_number ?? 0);
  const radio = radioOf(radioRecords, number);
  const telemetry = telemetryOf(readings, number);
  if (own.length > 0) opened.laps = own.map((record) => lapDetailOf(record, session, personal));
  if (stints.length > 0) opened.stints = stints;
  if (radio.length > 0) opened.radio = radio;
  if (telemetry.length > 0) opened.telemetry = telemetry;
  return opened;
}

/** Each sector of a lap, in the order they are run. One list, so a sector is read by its number
 *  everywhere below rather than by three near-identical expressions. */
const SECTORS: readonly ((record: LapRecord) => number | null | undefined)[] = [
  (record) => record.duration_sector_1,
  (record) => record.duration_sector_2,
  (record) => record.duration_sector_3,
];

/** The quickest each sector has been over a set of laps — the whole field's for the purple, one
 *  Driver's for the green. Absent for a sector nobody has a time in yet. */
function bestSectors(records: readonly LapRecord[]): readonly (number | undefined)[] {
  return SECTORS.map((of) => {
    const times = records.flatMap((record) => {
      const value = of(record);
      return typeof value === 'number' && value > 0 ? [seconds(value)] : [];
    });
    return times.length === 0 ? undefined : Math.min(...times);
  });
}

/** One lap of the opened Driver, sector by sector. A sector the feed never timed is a hole in the
 *  list rather than a nought, and the status is the same purple/green/yellow the row draws. */
function lapDetailOf(
  record: LapRecord,
  session: readonly (number | undefined)[],
  personal: readonly (number | undefined)[],
): LapDetail {
  const sectors: LapSector[] = SECTORS.map((of, index) => {
    const value = of(record);
    if (typeof value !== 'number' || value <= 0) return null;
    const millis = seconds(value);
    return { millis, status: sectorStatus(millis, session[index], personal[index]) };
  });
  const lap: LapDetail = { number: record.lap_number, sectors };
  if (record.lap_duration !== null) lap.time = seconds(record.lap_duration);
  return lap;
}

/** How good a sector time is: the fastest anyone has set is purple, the Driver's own best green,
 *  anything slower yellow. Compared with `<=` so the lap that *set* a best wears it. */
function sectorStatus(millis: number, session: number | undefined, personal: number | undefined): SectorStatus {
  if (session !== undefined && millis <= session) return 'session-best';
  if (personal !== undefined && millis <= personal) return 'personal-best';
  return 'set';
}

/**
 * The Stint history: every set the Driver has run so far, oldest first. A Stint that has not started
 * by `lapsRun` is not history yet, and one still running ends at the last lap actually run rather
 * than at the lap the feed already knows it will end on — a Replay scrubbed back to lap ten must not
 * show a Stint ending on lap thirty.
 */
function stintsOf(records: readonly StintRecord[], number: DriverNumber, lapsRun: number): Stint[] {
  return records
    .filter((record) => record.driver_number === number && record.lap_start <= lapsRun)
    .sort((a, b) => a.stint_number - b.stint_number)
    .map((record) => {
      const stint: Stint = {
        number: record.stint_number,
        fromLap: record.lap_start,
        toLap: Math.min(record.lap_end, lapsRun),
      };
      const compound = record.compound === null ? undefined : COMPOUNDS[record.compound.toUpperCase()];
      if (compound !== undefined) stint.compound = compound;
      if (record.tyre_age_at_start !== null) stint.tyreAgeAtStart = record.tyre_age_at_start;
      return stint;
    });
}

/** The Driver's radio, newest first — what was just said explains what just happened. A clip with
 *  no recording behind it is not a clip. */
function radioOf(records: readonly TeamRadioRecord[], number: DriverNumber): Radio[] {
  return records
    .flatMap((record) => {
      const at = Date.parse(record.date);
      if (record.driver_number !== number || record.recording_url === null || Number.isNaN(at)) return [];
      return [{ at, url: record.recording_url }];
    })
    .sort((a, b) => b.at - a.at);
}

/** The trace, oldest first: one reading per document, each channel carried across only where the
 *  feed sent it. Upstream's DRS is deliberately not among them (records.ts). */
function telemetryOf(records: readonly CarDataRecord[], number: DriverNumber): Reading[] {
  return records
    .flatMap((record) => {
      const at = Date.parse(record.date);
      if (record.driver_number !== number || Number.isNaN(at)) return [];
      const reading: Reading = { at };
      if (typeof record.speed === 'number') reading.speed = record.speed;
      if (typeof record.throttle === 'number') reading.throttle = record.throttle;
      if (typeof record.brake === 'number') reading.brake = record.brake;
      if (typeof record.n_gear === 'number') reading.gear = record.n_gear;
      if (typeof record.rpm === 'number') reading.rpm = record.rpm;
      return [reading];
    })
    .sort((a, b) => a.at - b.at);
}

function text(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

/** Positions are one-based, so a nought is upstream saying nothing rather than saying first. */
function ordinal(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/**
 * One separation, as the model holds it. Seconds behind become a duration; upstream's `"+1 LAP"` /
 * `"+2 LAPS"` becomes that many whole laps, so a lapped car is never a two-minute time; and absence
 * stays absence — `null`, and a nought, both mean the feed has not placed the Driver against the one
 * ahead (the leader is not zero seconds behind themselves), so both are absent rather than `+0.000`.
 */
function separationOf(value: number | string | null | undefined): Separation | undefined {
  if (typeof value === 'number') return value > 0 ? { millis: seconds(value) } : undefined;
  if (typeof value === 'string') {
    const lapsDown = /^\+?\s*(\d+)\s+laps?$/i.exec(value);
    return lapsDown ? { laps: Number(lapsDown[1]) } : undefined;
  }
  return undefined;
}

/** OpenF1 measures time in seconds; the model measures it in whole milliseconds. */
function seconds(value: number): number {
  return Math.round(value * 1000);
}
