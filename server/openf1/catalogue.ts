// Where the catalogue's records become the list the picker chooses from (#15). The Adapter's job,
// like the Session state beside it: upstream's `meeting_key` and `session_name` stop here, and what
// leaves is the domain's own `Catalogue`.
//
// Backfilled-or-not is the fact the picker cannot do without — a season names ~123 Sessions and only
// the handful on disk can be Replayed — and it is not in the catalogue records themselves: the
// catalogue is scraped from Formula 1's calendar (ADR-0009), which knows nothing of what has been
// Backfilled. So it is passed in, gathered from the Stores by whoever has the Stores to ask.

import type { Catalogue, CatalogueMeeting, CatalogueSession } from '../../domain/index.ts';
import type { MeetingRecord, SessionRecord } from './records.ts';

/**
 * Group a season's Sessions under their Meetings, marking each Session Replayable or not. Meetings
 * and Sessions both come out in the order they run — a weekend reads Practice, Qualifying, Race, and
 * a season reads round by round — so the picker lists them the way a viewer thinks of them.
 */
export function catalogueFrom(
  meetingRecords: readonly MeetingRecord[],
  sessionRecords: readonly SessionRecord[],
  backfilled: ReadonlySet<number>,
): Catalogue {
  const sessionsByMeeting = new Map<number, CatalogueSession[]>();
  const earliest = new Map<number, number>();
  for (const record of [...sessionRecords].sort(byDateStart)) {
    const list = sessionsByMeeting.get(record.meeting_key) ?? [];
    list.push({
      key: record.session_key,
      name: text(record.session_name) ?? `Session ${record.session_key}`,
      backfilled: backfilled.has(record.session_key),
    });
    sessionsByMeeting.set(record.meeting_key, list);
    const when = order(record.date_start);
    if (when < (earliest.get(record.meeting_key) ?? Number.POSITIVE_INFINITY)) {
      earliest.set(record.meeting_key, when);
    }
  }

  return meetingRecords
    // A Meeting with no Session listed is a weekend nothing can be chosen from, so it is left out
    // rather than drawn empty.
    .filter((record) => sessionsByMeeting.has(record.meeting_key))
    .sort((a, b) => whenOf(earliest, a) - whenOf(earliest, b))
    .map((record) => meeting(record, sessionsByMeeting.get(record.meeting_key) ?? []));
}

/** A Meeting's earliest Session, for ordering the season; a Meeting with only undated Sessions
 * sorts last rather than jumping the queue. */
function whenOf(earliest: Map<number, number>, record: MeetingRecord): number {
  return earliest.get(record.meeting_key) ?? Number.POSITIVE_INFINITY;
}

function meeting(record: MeetingRecord, sessions: CatalogueSession[]): CatalogueMeeting {
  const built: CatalogueMeeting = {
    name: text(record.meeting_name) ?? `Meeting ${record.meeting_key}`,
    sessions,
  };
  const circuit = text(record.circuit_short_name);
  const country = text(record.country_name);
  if (circuit !== undefined) built.circuit = circuit;
  if (country !== undefined) built.country = country;
  return built;
}

function byDateStart(a: SessionRecord, b: SessionRecord): number {
  return order(a.date_start) - order(b.date_start);
}

/** A missing date sorts last, so a Session the calendar has not dated does not jump the queue by
 * comparing as the empty string. */
function order(date: string | null | undefined): number {
  return date == null ? Number.POSITIVE_INFINITY : Date.parse(date);
}

function text(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}
