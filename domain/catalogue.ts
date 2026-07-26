// What the picker chooses from (#15): the Meetings and Sessions of a season, and — for each Session —
// whether it can actually be Replayed. A Session is *known* the moment the catalogue names it
// (ADR-0009), but only *here* once it has been Backfilled, and "known but not here" is a state the
// picker has to draw rather than hide: a season lists ~123 Sessions and only a handful are on disk.
//
// This is the shared shape the server produces and the picker renders, so — like the Session state —
// it carries none of upstream's field names. The Adapter turns records into this (server/openf1).

/** One Session, as the picker lists it. */
export interface CatalogueSession {
  /** Upstream's key, the one the dashboard replays and never invents (parent #3). */
  key: number;
  /** The Session within the weekend — "Race", "Qualifying", "Practice 1". */
  name: string;
  /** Whether the Session is in the Stores, and so can be Replayed. A known Session that has not
   * been Backfilled is listed but not chooseable — the "known but not here" state. */
  backfilled: boolean;
}

/** One Meeting — a Grand Prix weekend — and its Sessions, in the order they run. */
export interface CatalogueMeeting {
  name: string;
  circuit?: string;
  country?: string;
  sessions: CatalogueSession[];
}

/** A whole season, the Meetings in the order they run. */
export type Catalogue = readonly CatalogueMeeting[];
