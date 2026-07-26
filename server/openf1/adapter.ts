// Where OpenF1 stops and this project's own model begins.
//
// Both input feeds end here — Replay's REST reader and, later, the live MQTT subscriber — and
// both hand the rest of the system the same Session state, which is what lets the Timing screen
// never branch on which one it is looking at (ADR-0003).

import type { Driver, Separation, SessionState } from '../../domain/index.ts';
import type { DriverRecord, IntervalRecord, LapRecord, PositionRecord } from './records.ts';

export function sessionStateFrom(
  sessionKey: number,
  driverRecords: readonly DriverRecord[],
  positionRecords: readonly PositionRecord[],
  intervalRecords: readonly IntervalRecord[],
  lapRecords: readonly LapRecord[],
): SessionState {
  const standing = latestPerDriver(positionRecords);
  const separation = latestPerDriver(intervalRecords);
  const laps = lapsPerDriver(lapRecords);
  const drivers = driverRecords.map((record) =>
    driverFrom(
      record,
      standing.get(record.driver_number),
      separation.get(record.driver_number),
      laps.get(record.driver_number),
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

/** The last lap and the best of them: the most recently run of a Driver's laps, and the quickest
 * of the whole Session so far (story: "best of the Session so far, not merely the last"). Both in
 * milliseconds, and absent until the Driver has a completed lap — a lap in progress carries no
 * duration and so counts as neither. */
interface Laps {
  last?: number;
  best?: number;
}

function lapsPerDriver(records: readonly LapRecord[]): Map<number, Laps> {
  const laps = new Map<number, Laps & { lastLapNumber: number }>();
  for (const record of records) {
    if (record.lap_duration === null) continue;
    const millis = seconds(record.lap_duration);
    const held = laps.get(record.driver_number) ?? { lastLapNumber: 0 };
    if (record.lap_number >= held.lastLapNumber) {
      held.lastLapNumber = record.lap_number;
      held.last = millis;
    }
    if (held.best === undefined || millis < held.best) held.best = millis;
    laps.set(record.driver_number, held);
  }
  return laps;
}

function driverFrom(
  record: DriverRecord,
  position: PositionRecord | undefined,
  separation: IntervalRecord | undefined,
  laps: Laps | undefined,
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
  if (laps?.last !== undefined) driver.lastLap = laps.last;
  if (laps?.best !== undefined) driver.bestLap = laps.best;
  return driver;
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

/** Position order is the order the race reads in (story 2); an unplaced Driver sorts last. */
function byPosition(one: Driver, other: Driver): number {
  if (one.position === undefined || other.position === undefined) {
    if (one.position !== other.position) return one.position === undefined ? 1 : -1;
    return one.number - other.number;
  }
  return one.position - other.position;
}
