// OpenF1's own record shapes, only as far as the Adapter reads them.
//
// This directory is the Adapter (CONTEXT.md): every upstream field name in this repository is
// under it, and nowhere above it. That is what ADR-0003's source-swappability claim rests on,
// and `test/adapter.test.sh` is what keeps it true rather than aspirational.
//
// Absence arrives as `null` here, and stays absence all the way through — never a zero, never an
// empty string standing in for a code nobody sent.

/** One Driver's identity for a Session, from `/v1/drivers`. */
export interface DriverRecord {
  driver_number: number;
  name_acronym: string | null;
  team_name: string | null;
}

/** One change of classified position, from `/v1/position`. A change log, not a standing. */
export interface PositionRecord {
  driver_number: number;
  /** ISO 8601, and lexicographically ordered because upstream always sends the same shape. */
  date: string;
  position: number | null;
}

/**
 * One reading of a Driver's separation from the field, from `/v1/intervals`. A time series like
 * `/v1/position`: a Driver's current separation is their most recent reading.
 *
 * Both measurements can be a number of seconds, or the string `"+1 LAP"` / `"+2 LAPS"` once a lap
 * or more down — that is upstream saying a duration is the wrong unit, and the Adapter carries the
 * distinction across rather than flattening a lap into an enormous time. `null` is absence, and the
 * Adapter reads a nought as absence too (see `separationOf`).
 */
export interface IntervalRecord {
  driver_number: number;
  /** ISO 8601, lexicographically ordered — the latest reading is the current separation. */
  date: string;
  /** To the leader. */
  gap_to_leader: number | string | null;
  /** To the car immediately ahead. The two are separate fields and never read the one for the other. */
  interval: number | string | null;
}

/**
 * One lap, from `/v1/laps`. Discrete rather than a time series — a Session carries every lap a
 * Driver has run — so the most recent completed lap and the best of them are both read from here.
 */
export interface LapRecord {
  driver_number: number;
  /** One-based, and the order the laps run in: the greatest with a duration is the last completed. */
  lap_number: number;
  /** The lap's duration in seconds, `null` while the lap is still in progress. */
  lap_duration: number | null;
}
