// The live feed: MQTT documents in, Session state out — and the whole proof of ADR-0003 (#17).
//
// The Ingestor publishes each record it writes to a `v1/<collection>` topic, one JSON document per
// message, in exactly the record shapes the REST API answers with (records.ts). So this feed reads
// the same fields and hands them to the same Adapter as `rest-feed.ts`, and what comes out is a
// `SessionState` no view can tell from a Replay's. That "not one view changes" is the acceptance
// criterion the ticket is named for, and it holds here because this file does no mapping of its own:
// it accumulates records and calls `sessionStateFrom`.
//
// It lives under the Adapter because it names upstream's collections and unique keys; those names
// stop here, as they do in every other file in this directory (test/adapter.test.sh).
//
// Accumulation mirrors the Stores the Ingestor also writes to (CONTEXT.md): a record is upserted by
// the same unique key MongoDB keys it on, so a lap re-published as its duration fills in, or a Stint
// re-published as its last lap moves, replaces the earlier version rather than doubling it. The
// change logs — position and intervals — key on date and Driver, so every distinct reading is kept
// and the latest is the current one, which is what the Adapter's time-series reading expects.

import type { DriverNumber, SessionState } from '../../domain/index.ts';
import { openedDriverFrom, sessionStateFrom } from './adapter.ts';
import type {
  DriverRecord,
  IntervalRecord,
  LapRecord,
  PositionRecord,
  StintRecord,
  TeamRadioRecord,
} from './records.ts';

export interface LiveFeed {
  /**
   * Fold one document into the Session so far. `topic` is the `v1/<collection>` it arrived on and
   * `payload` is its JSON text. A topic this feed does not read, or a payload that is not the JSON
   * object it should be, is dropped — a stream nobody subscribed to and a malformed line are both
   * upstream's to answer for, and neither should stop the Session.
   */
  ingest(topic: string, payload: string): void;
  /**
   * Open a Driver, or close the one that is open (#18). What the Session then carries for them is
   * whatever this feed has subscribed to: their Stint history, their laps sector by sector, and
   * their radio. The per-second trace is not among them, because `v1/car_data` is not among the
   * topics below — adding it is #42, after the measurement says whether it arrives at all.
   */
  open(driver: DriverNumber | undefined): void;
  /** The Session as it stands, built through the same Adapter the REST feed uses. */
  state(): SessionState;
}

/** One document as it arrives — the record fields the Adapter reads, plus the Session key every
 * Ingestor document is stamped with, which the REST feed instead gets from the URL it queried. */
type LiveRecord = Partial<
  DriverRecord & PositionRecord & IntervalRecord & LapRecord & StintRecord & TeamRadioRecord
> & {
  session_key?: number;
};

/** The unique key a record of a collection is held by — the same key MongoDB upserts on upstream, so
 * a re-published record replaces rather than accumulates. The change logs key on `date` so each
 * reading is distinct; the discrete streams key on their one-per-Session identity so an update to a
 * lap or a Stint lands on the same record. */
type KeyOf = (record: LiveRecord) => string;

/** Every collection the Timing screen is built from, by the topic it is published on. */
const COLLECTIONS: Record<string, KeyOf> = {
  'v1/drivers': (record) => String(record.driver_number),
  'v1/position': (record) => `${record.date}|${record.driver_number}`,
  'v1/intervals': (record) => `${record.date}|${record.driver_number}`,
  'v1/laps': (record) => `${record.lap_number}|${record.driver_number}`,
  'v1/stints': (record) => `${record.stint_number}|${record.driver_number}`,
  // Radio is per-Driver depth rather than a column, and it is not a Gated stream (CONTEXT.md), so it
  // is subscribed to here and read only for the Driver a viewer has opened. A clip is published once,
  // and two clips of one Driver at one instant would be the same clip.
  'v1/team_radio': (record) => `${record.date}|${record.driver_number}`,
};

/** The topics a live subscriber asks for: the keys of the table above, so the two cannot drift. */
export const LIVE_TOPICS: readonly string[] = Object.keys(COLLECTIONS);

export function liveFeed(): LiveFeed {
  const records = new Map<string, Map<string, LiveRecord>>();
  for (const topic of LIVE_TOPICS) records.set(topic, new Map());
  // The Session key is the one thing the REST feed reads from its request and the live feed reads
  // from the records themselves. Nought until the first document names it — a Session with no records
  // yet has no key to show, and the Adapter carries the nought through as it would a real one.
  let sessionKey = 0;
  let opened: DriverNumber | undefined;

  return {
    ingest(topic, payload) {
      const collection = records.get(topic);
      const keyOf = COLLECTIONS[topic];
      if (collection === undefined || keyOf === undefined) return;

      const record = parse(payload);
      if (record === undefined) return;
      if (record.session_key !== undefined) sessionKey = record.session_key;
      collection.set(keyOf(record), record);
    },
    open(driver) {
      opened = driver;
    },
    state() {
      const laps = held<LapRecord>('v1/laps');
      const stints = held<StintRecord>('v1/stints');
      const state = sessionStateFrom(
        sessionKey,
        held<DriverRecord>('v1/drivers'),
        held<PositionRecord>('v1/position'),
        held<IntervalRecord>('v1/intervals'),
        laps,
        stints,
      );
      if (opened !== undefined) {
        // No readings, because no `v1/car_data` subscription: the same Adapter builds the same
        // depth, and the trace is simply a stream this feed has not been given (#42).
        state.opened = openedDriverFrom(opened, laps, stints, held<TeamRadioRecord>('v1/team_radio'), []);
      }
      return state;
    },
  };

  /** The records held for a collection, as the record type the Adapter reads. The accumulator keeps
   * them as the wider `LiveRecord`, so the cast here is where a document is asserted to be the shape
   * its topic promises — the same assertion the REST feed makes of a JSON body it did not type. */
  function held<Row>(topic: string): Row[] {
    return [...records.get(topic)!.values()] as unknown as Row[];
  }
}

/** A document's JSON, or `undefined` when the line is not the object it should be — parsed defensively
 * because it crosses a network from software this project runs but does not write. */
function parse(payload: string): LiveRecord | undefined {
  try {
    const value: unknown = JSON.parse(payload);
    return typeof value === 'object' && value !== null ? (value as LiveRecord) : undefined;
  } catch {
    return undefined;
  }
}
