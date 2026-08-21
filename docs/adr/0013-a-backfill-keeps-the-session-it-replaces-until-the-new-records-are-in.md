# A Backfill keeps the Session it is replacing until the records replacing it are in the stores

[ADR-0008](0008-backfilling-a-session-is-a-command-that-replaces-it.md) settled that a Backfill
*replaces* a Session, and had `bin/backfill` delete that Session's records before running the
ingest. Delete-then-write is not a replace. It is a window in which the Session does not exist,
and on 2026-08-21 a `bin/backfill 2026 1292 11343` opened that window and never came out of it:
the ingest did not run, and 7,238 records — a live capture of a Session that cannot be captured
again — were gone.

This record replaces the ordering ADR-0008 chose. The rest of that record stands unchanged: the
discard is still what stops upstream's insert-only write path from storing a second copy, and the
telemetry indexes are still created before anything is written.

Two things had gone wrong, and only one of them was the ordering.

## The catalogue was collateral, and that is a boundary error

The delete swept `session_key` across *every* collection in the database, and the catalogue's own
`sessions` document carries `session_key` as well — it is the document that says this Session is
the Race, at that circuit, starting at that time. So the delete took the Session's name along with
its data. The 2026 catalogue went from 121 Sessions to 120, and the Session was not merely empty:
nothing could name it, and the picker builds its list from the catalogue, so it could not even be
shown as a Session that is known and not here.

`meetings` and `sessions` are the catalogue's, written by `bin/catalogue` from a different source
at a different granularity ([ADR-0009](0009-the-catalogue-is-a-season-at-a-time.md)), and they
describe what a Session *is* rather than what it recorded. Nothing a Backfill does may reach them,
under any ordering. A Session's collections are therefore defined once, as every collection except
those two, and every statement `bin/backfill` sends to the stores is scoped to that list.

## Marking, rather than staging or an id boundary

The behaviour wanted is that a Backfill either replaces the Session or changes nothing. Three ways
to get it were open.

**Ingest into a second database and swap.** MongoDB cannot rename a collection into another
database, so the swap is a copy: a million and a half documents moved across and then deleted
again, which is the expensive half of the work done twice, to buy transactional atomicity for a
job somebody starts at a keyboard and watches.

**Take an `_id` boundary before the ingest and delete everything below it afterwards.** Free to
record, and a trap. Upstream's `_id` is not an ObjectId but a millisecond clock that is bumped
forward by one whenever documents are generated faster than the clock moves, so a run that writes
a million and a half documents leaves ids as much as twenty-five minutes ahead of wall clock. The
next run's ids can start *below* the last run's highest, and the boundary would then delete the
new records and keep the old ones — silently, and only for a Session backfilled twice in quick
succession.

**Mark what is being replaced.** `bin/backfill` sets `_superseded` on every record the Session
already holds, ingests, and only then deletes the marked ones. What the ingest wrote is exactly
what is not marked, so both endings are exact and neither depends on ordering, timing or ids: a
finished ingest discards the marked half, and an unfinished one deletes the unmarked half and
takes the marks off. The field is `_`-prefixed, which is the prefix upstream's query API strips
from every document it returns, so no reader above the stores can see it.

## An exit status is not evidence that anything was written

Upstream's `insert_data_sync` catches `BulkWriteError`, logs it and returns, so the ingest can
exit zero having written nothing at all. Discarding the superseded records on that evidence is the
original bug with extra steps. The discard is conditioned instead on finding at least one record
of the Session that is not marked, and a run that finds none fails and puts the Session back.

## Consequences

- **While the ingest runs, the Session holds both copies.** The query API groups on `_key` and
  keeps the highest `_id` (ADR-0008), so a reader sees one version of each record rather than two
  — but, for the reason the id boundary was rejected, not reliably the newer one. A Replay of the
  very Session being backfilled can therefore read a mixture for the length of the ingest. That is
  a worse minute than before and a better hour: what it replaces is a window in which the Session
  does not exist at all, and an interruption that made the window permanent.
- **Replacing a Session costs an extra pass over its records.** The mark writes every document the
  Session already holds before the ingest starts, on top of the delete that follows it. ADR-0008
  already records that re-running does not return disk; this rewrites those documents once more on
  the way.
- **A run killed outright leaves both halves in the stores.** No handler runs for `SIGKILL` or a
  power cut, so the Session is left holding marked records and a partial ingest. Nothing is lost —
  which is the point — and the next `bin/backfill` marks everything it finds, the partial write
  included, and discards all of it once an ingest finishes. The repair is the same command, as it
  is in ADR-0008.
- **The command says what it is about to replace, and does not ask.** It prints the record count
  before the ingest starts. A prompt was considered and is not needed now that the destruction is
  the last thing rather than the first: the warning arrives with the whole ingest still to run, and
  stopping the run costs nothing.
- **Holding a live capture and a Backfill of the same Session at once is still impossible.** The
  Backfill still replaces the capture; it only says so first, and only after it has something to
  replace it with. Comparing the two halves needs somewhere to put the second one, and that is
  [#42](https://github.com/Jerome-Group/f1-analytics/issues/42)'s to decide.

## Revisit when

- Upstream's historical path learns to upsert or to resume — ADR-0008's own revisit condition.
  Then there is nothing to supersede and nothing to discard, and this record goes with that one.
- A Backfill is wanted *alongside* a live capture of the same Session rather than instead of it.
  The mark is not the mechanism for that: it distinguishes old from new within one Session, not
  one recording of a Session from another.
- The extra pass shows up in a measurement. `docs/measurements/a-race-session-on-disk.md` was
  taken under the delete-first behaviour, and a second backfill of that Session now marks
  1,456,784 documents before it deletes them.
