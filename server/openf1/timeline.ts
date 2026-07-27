// Replay's clock, made pure: the whole record log in, and the Session state as it stood at any one
// moment out (#15).
//
// This is what makes scrubbing backwards correct rather than merely possible. A frame is not the
// previous frame with the newest records folded in — it is the log filtered to `date <= position`
// and handed to the Adapter from scratch, so an earlier moment can carry none of a later one's
// facts. Moving the clock back is the same operation as moving it forward, which is the whole of the
// "scrubbing backwards produces correct state, not stale state" criterion.
//
// It lives under the Adapter because it reads upstream's own `date` and `date_start` to place a
// record in time; those field names stop here, exactly as ADR-0003 requires, and the Session state
// it produces says nothing about when it was reconstructed.

import type { DriverNumber, SessionState } from '../../domain/index.ts';
import { lapCompletedAt, openedDriverFrom, sessionStateFrom } from './adapter.ts';
import type {
  CarDataRecord,
  DriverRecord,
  IntervalRecord,
  LapRecord,
  PositionRecord,
  StintRecord,
  TeamRadioRecord,
} from './records.ts';

/**
 * How much of the per-second tier a frame carries: the half-minute just gone. Long enough to hold a
 * braking zone and the corner after it, short enough that the trace stays a window over one Driver
 * rather than a Session-long series — which is the difference between the tier being affordable for
 * an opened Driver and being affordable for nobody (CONTEXT.md, "Per-second tier").
 */
const TRACE_MS = 30_000;

/** The two streams read for a Driver a viewer has opened, and for no one else. Their laps and Stints
 *  are already in the timeline's own log — every Driver's are — so only these are loaded. */
export interface OpenedLog {
  driver: DriverNumber;
  radio: readonly TeamRadioRecord[];
  carData: readonly CarDataRecord[];
}

export interface Timeline {
  /** The Session's first recorded moment, in epoch milliseconds — the far-left of the scrub bar. */
  readonly start: number;
  /** The Session's last recorded moment — the far-right, and where a Replay opens. */
  readonly end: number;
  /**
   * The Session state as it stood at `position` (epoch milliseconds), clamped to `[start, end]`. A
   * pure function of the log and the position: the same position always gives the same state, no
   * matter what was asked for before it.
   */
  at(position: number): SessionState;
  /**
   * Put one Driver's deep streams into the log, or take them out again (#18). Which Driver is open
   * is a property of the log rather than of the position — `at` stays a pure function of the two —
   * and a log with nobody open produces frames carrying no per-second tier at all, for any Driver,
   * which is the criterion seam 1 checks.
   */
  open(log: OpenedLog | undefined): void;
}

export function timelineFrom(
  sessionKey: number,
  driverRecords: readonly DriverRecord[],
  positionRecords: readonly PositionRecord[],
  intervalRecords: readonly IntervalRecord[],
  lapRecords: readonly LapRecord[],
  stintRecords: readonly StintRecord[],
): Timeline {
  const moments = [
    ...positionRecords.map((record) => at(record.date)),
    ...intervalRecords.map((record) => at(record.date)),
    ...lapRecords.map(lapStarted),
    ...lapRecords.map(lapCompleted),
  ].filter((moment): moment is number => Number.isFinite(moment));
  const start = moments.length === 0 ? 0 : Math.min(...moments);
  const end = moments.length === 0 ? 0 : Math.max(...moments);
  let opened: Opened | undefined;

  return {
    start,
    end,
    at(position) {
      const now = Math.min(Math.max(position, start), end);
      // A lap counts once it has *finished*, so that the last lap and the best of them are the ones
      // actually run by `now` and never one still on the road. Read once because the opened Driver's
      // laps are the same laps, settled against the same field.
      const run = lapRecords.filter((record) => lapCompleted(record) <= now);
      const state = sessionStateFrom(
        sessionKey,
        // The Drivers themselves are the Session's roster, not an event in it — a car is entered for
        // the whole Session — so they are always present, at the start as at the end.
        driverRecords,
        positionRecords.filter((record) => at(record.date) <= now),
        intervalRecords.filter((record) => at(record.date) <= now),
        run,
        // Stints carry no date of their own — a Stint is a span of laps, not a moment — so the whole
        // strategy is passed and which one is *current* is read off the laps already run by `now`.
        stintRecords,
      );
      if (opened !== undefined) {
        state.opened = openedDriverFrom(
          opened.log.driver,
          run,
          stintRecords,
          opened.log.radio.filter((record) => at(record.date) <= now),
          trace(opened, now),
        );
      }
      return state;
    },
    open(log) {
      // Put the readings in date order here rather than trusting the order upstream answered in: the
      // window below is a slice, and a slice of an unordered log is silently the wrong seconds.
      // Sorting once, at opening, is what makes the search on every frame after it honest.
      if (log === undefined) {
        opened = undefined;
        return;
      }
      const carData = [...log.carData].sort((a, b) => at(a.date) - at(b.date));
      opened = { log: { ...log, carData }, taken: carData.map((record) => at(record.date)) };
    },
  };
}

/** An opened Driver's log with each reading's moment already worked out. The trace is re-cut on every
 *  frame — four times a second while a Replay plays — over tens of thousands of readings, so parsing
 *  their dates belongs to opening the Driver once and not to every frame after it. */
interface Opened {
  log: OpenedLog;
  taken: readonly number[];
}

/**
 * The readings inside the trace window ending at `now`. The log was put in date order as it was
 * opened, so the window is a slice rather than a filter — the per-second tier is the one stream
 * where the difference is worth the two searches.
 */
function trace(opened: Opened, now: number): CarDataRecord[] {
  const from = firstAfter(opened.taken, now - TRACE_MS);
  const to = firstAfter(opened.taken, now);
  return opened.log.carData.slice(from, to);
}

/** Where the first moment strictly after `limit` sits in an ascending list, or its length when none
 *  is. A moment the feed did not date is `NaN`, which compares false either way and so lands with
 *  whatever it was ordered beside — it carries no reading anything can draw. */
function firstAfter(moments: readonly number[], limit: number): number {
  let lo = 0;
  let hi = moments.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (moments[mid]! <= limit) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** ISO 8601 to epoch milliseconds; `NaN` for a date the feed did not give, so it drops out of the
 * bounds and, being neither `<=` nor `>` anything, out of every frame. */
function at(date: string | null | undefined): number {
  return date == null ? Number.NaN : Date.parse(date);
}

function lapStarted(record: LapRecord): number {
  return at(record.date_start);
}

/**
 * When a lap's fact becomes true: its start plus its duration ([[adapter]], where the Gap trend reads
 * the same moment). A lap the recording did not date — every lap in a whole-Session recording, which
 * needs no timeline — counts as always-already run (`-Infinity`), so a Replay of such a recording
 * still shows every completed lap at the end, exactly as a straight read would.
 */
function lapCompleted(record: LapRecord): number {
  return lapCompletedAt(record) ?? Number.NEGATIVE_INFINITY;
}
