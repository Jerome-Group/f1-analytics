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
