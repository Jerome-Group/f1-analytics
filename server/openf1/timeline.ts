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

import type { SessionState } from '../../domain/index.ts';
import { lapCompletedAt, sessionStateFrom } from './adapter.ts';
import type { DriverRecord, IntervalRecord, LapRecord, PositionRecord, StintRecord } from './records.ts';

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

  return {
    start,
    end,
    at(position) {
      const now = Math.min(Math.max(position, start), end);
      return sessionStateFrom(
        sessionKey,
        // The Drivers themselves are the Session's roster, not an event in it — a car is entered for
        // the whole Session — so they are always present, at the start as at the end.
        driverRecords,
        positionRecords.filter((record) => at(record.date) <= now),
        intervalRecords.filter((record) => at(record.date) <= now),
        // A lap counts once it has *finished*, so that the last lap and the best of them are the ones
        // actually run by `now` and never one still on the road.
        lapRecords.filter((record) => lapCompleted(record) <= now),
        // Stints carry no date of their own — a Stint is a span of laps, not a moment — so the whole
        // strategy is passed and which one is *current* is read off the laps already run by `now`.
        stintRecords,
      );
    },
  };
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
