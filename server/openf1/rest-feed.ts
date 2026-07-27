// Replay's input feed: a Session already in the Stores, read back through OpenF1's REST API, and the
// catalogue the picker chooses from (#15).
//
// There are two feeds and they are not symmetrical. Live arrives over MQTT; `ingest-historical`
// has no MQTT configuration at all, so a backfilled Session is only ever readable over REST.
// Both feeds produce a `SessionState` and nothing downstream can tell which one it came from —
// that is the whole arrangement, and the reason this file's export says nothing about HTTP.

import type { Catalogue } from '../../domain/index.ts';
import { catalogueFrom } from './catalogue.ts';
import { timelineFrom, type Timeline } from './timeline.ts';
import type {
  DriverRecord,
  IntervalRecord,
  LapRecord,
  MeetingRecord,
  PositionRecord,
  SessionRecord,
  StintRecord,
} from './records.ts';

/**
 * Read a backfilled Session out of the Stores as a Replay timeline: the whole record log, and the
 * Session state at any moment on it (#15). One read of each collection — a finished Session does not
 * grow — held in memory so scrubbing costs nothing but a filter (timeline.ts). A Race's streams are
 * on the order of a hundred thousand records with car telemetry left out, which is why only these are
 * read: identity, standing, separation, laps and Stints, the whole of what the Timing screen shows.
 */
export async function loadTimeline(api: URL, sessionKey: number): Promise<Timeline> {
  const [drivers, positions, intervals, laps, stints] = await Promise.all([
    collection<DriverRecord>(api, 'drivers', { session_key: sessionKey }),
    collection<PositionRecord>(api, 'position', { session_key: sessionKey }),
    collection<IntervalRecord>(api, 'intervals', { session_key: sessionKey }),
    collection<LapRecord>(api, 'laps', { session_key: sessionKey }),
    collection<StintRecord>(api, 'stints', { session_key: sessionKey }),
  ]);
  return timelineFrom(sessionKey, drivers, positions, intervals, laps, stints);
}

/**
 * The season's Meetings and Sessions, each Session marked Replayable or merely known (#15). Meetings
 * and Sessions are read a year at a time, the way the catalogue is written (ADR-0009, and bin/backfill
 * already filters `/v1/sessions` by year). Which Sessions are actually on disk is not in those
 * records — the catalogue is scraped from the calendar, not from the Stores — so it is found by
 * asking each Session whether it has any Drivers: a Session nobody Backfilled has none.
 */
export async function readCatalogue(api: URL, year: number): Promise<Catalogue> {
  const [meetings, sessions, backfilled] = await Promise.all([
    collection<MeetingRecord>(api, 'meetings', { year }),
    collection<SessionRecord>(api, 'sessions', { year }),
    backfilledKeys(api),
  ]);
  return catalogueFrom(meetings, sessions, backfilled);
}

/**
 * Which Sessions are in the Stores, in one request. `/v1/drivers` carries a row per Driver of every
 * Backfilled Session — around twenty each, and none at all for a Session only catalogued — so its
 * distinct Session keys are the Sessions on disk, and the collection stays small because it grows
 * only by a Backfill. A request per catalogued Session would be a hundred-odd of them, which the
 * self-hosted API answers with 429s; this asks once. Keys from other seasons are harmless — the
 * catalogue only ever checks its own Sessions against the set.
 */
async function backfilledKeys(api: URL): Promise<Set<number>> {
  const rows = await collection<{ session_key: number }>(api, 'drivers', {});
  return new Set(rows.map((row) => row.session_key));
}

async function collection<Row>(api: URL, name: string, where: Record<string, number>): Promise<Row[]> {
  const url = new URL(`v1/${name}`, api);
  for (const [field, value] of Object.entries(where)) url.searchParams.set(field, String(value));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as Row[];
}
