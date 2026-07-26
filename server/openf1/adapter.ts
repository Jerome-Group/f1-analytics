// Where OpenF1 stops and this project's own model begins.
//
// Both input feeds end here — Replay's REST reader and, later, the live MQTT subscriber — and
// both hand the rest of the system the same Session state, which is what lets the Timing screen
// never branch on which one it is looking at (ADR-0003).

import type { Driver, SessionState } from '../../domain/index.ts';
import type { DriverRecord, PositionRecord } from './records.ts';

export function sessionStateFrom(
  sessionKey: number,
  driverRecords: readonly DriverRecord[],
  positionRecords: readonly PositionRecord[],
): SessionState {
  const standing = latestPerDriver(positionRecords);
  const drivers = driverRecords.map((record) =>
    driverFrom(record, standing.get(record.driver_number)),
  );
  return { sessionKey, drivers: drivers.sort(byPosition) };
}

/** `/v1/position` is a change log, so a Driver's position is their most recent change. */
function latestPerDriver(records: readonly PositionRecord[]): Map<number, PositionRecord> {
  const standing = new Map<number, PositionRecord>();
  for (const record of records) {
    const held = standing.get(record.driver_number);
    if (held === undefined || held.date <= record.date) standing.set(record.driver_number, record);
  }
  return standing;
}

function driverFrom(record: DriverRecord, position: PositionRecord | undefined): Driver {
  const driver: Driver = { number: record.driver_number };
  // Assigned only when the feed gave something, so that what it did not give is absent from the
  // object and absent from the wire. `?? undefined` would leave the key there, holding nothing.
  const code = text(record.name_acronym);
  const team = text(record.team_name);
  const place = ordinal(position?.position);
  if (code !== undefined) driver.code = code;
  if (team !== undefined) driver.team = team;
  if (place !== undefined) driver.position = place;
  return driver;
}

function text(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

/** Positions are one-based, so a nought is upstream saying nothing rather than saying first. */
function ordinal(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/** Position order is the order the race reads in (story 2); an unplaced Driver sorts last. */
function byPosition(one: Driver, other: Driver): number {
  if (one.position === undefined || other.position === undefined) {
    if (one.position !== other.position) return one.position === undefined ? 1 : -1;
    return one.number - other.number;
  }
  return one.position - other.position;
}
