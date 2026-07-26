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
} from './records.ts';

/**
 * Read a backfilled Session out of the Stores as a Replay timeline: the whole record log, and the
 * Session state at any moment on it (#15). One read of each collection — a finished Session does not
 * grow — held in memory so scrubbing costs nothing but a filter (timeline.ts). A Race's four streams
 * are on the order of a hundred thousand records with car telemetry left out, which is why only these
 * four are read: identity, standing, separation and laps, the whole of what the Timing screen shows.
 */
export async function loadTimeline(api: URL, sessionKey: number): Promise<Timeline> {
  const [drivers, positions, intervals, laps] = await Promise.all([
    collection<DriverRecord>(api, 'drivers', { session_key: sessionKey }),
    collection<PositionRecord>(api, 'position', { session_key: sessionKey }),
    collection<IntervalRecord>(api, 'intervals', { session_key: sessionKey }),
    collection<LapRecord>(api, 'laps', { session_key: sessionKey }),
  ]);
  return timelineFrom(sessionKey, drivers, positions, intervals, laps);
}

/**
 * The season's Meetings and Sessions, each Session marked Replayable or merely known (#15). Meetings
 * and Sessions are read a year at a time, the way the catalogue is written (ADR-0009, and bin/backfill
 * already filters `/v1/sessions` by year). Which Sessions are actually on disk is not in those
 * records — the catalogue is scraped from the calendar, not from the Stores — so it is found by
 * asking each Session whether it has any Drivers: a Session nobody Backfilled has none.
 */
export async function readCatalogue(api: URL, year: number): Promise<Catalogue> {
  const [meetings, sessions] = await Promise.all([
    collection<MeetingRecord>(api, 'meetings', { year }),
    collection<SessionRecord>(api, 'sessions', { year }),
  ]);
  return catalogueFrom(meetings, sessions, await backfilledKeys(api, sessions));
}

/**
 * Which of the season's Sessions are in the Stores. Asked one Session at a time — `/v1/drivers` is a
 * few rows for a Backfilled Session and empty for one that is only catalogued — so a season's worth
 * of Sessions is a season's worth of small requests, run a few at a time rather than all at once so a
 * hundred-odd of them do not open a hundred-odd sockets in the same instant.
 */
async function backfilledKeys(api: URL, sessions: readonly SessionRecord[]): Promise<Set<number>> {
  const keys = [...new Set(sessions.map((session) => session.session_key))];
  const here = new Set<number>();
  const AT_ONCE = 8;
  for (let from = 0; from < keys.length; from += AT_ONCE) {
    await Promise.all(
      keys.slice(from, from + AT_ONCE).map(async (key) => {
        const drivers = await collection<DriverRecord>(api, 'drivers', { session_key: key });
        if (drivers.length > 0) here.add(key);
      }),
    );
  }
  return here;
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
