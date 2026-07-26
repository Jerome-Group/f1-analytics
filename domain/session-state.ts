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

export interface Driver {
  number: DriverNumber;
  /** The three-letter code the Timing screen shows — `VER`, `NOR`. */
  code?: string;
  team?: string;
  /** Current classified position. One-based, so a Driver on track is never at position zero. */
  position?: number;
}

export interface SessionState {
  /** Upstream's key for the Session. The dashboard does not invent its own. */
  sessionKey: number;
  /** In position order, a Driver the feed has not placed sorting last. */
  drivers: Driver[];
}
