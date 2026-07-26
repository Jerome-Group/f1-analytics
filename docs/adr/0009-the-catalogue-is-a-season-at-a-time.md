# The catalogue is scraped a season at a time, by its own command

Nothing a Backfill writes says what the Session *was*. A million and a half records of the 2025
Dutch Grand Prix Race carry `session_key: 9920` and not one of them carries "Race", "Zandvoort" or
"31 August". The two collections that would — `meetings` and `sessions` — are written by upstream's
`scrape-latest` role, which reads Formula 1's event listing rather than the livetiming archive, and
which has never been in `deploy/compose.yaml`.

So they were empty, and would have stayed empty: the role is not one this project had a reason to
run continuously, and the live path does not write them either.

Wiring the role in as upstream ships it would not do. It takes no year — it scrapes whatever season
is current, which is the one season a Backfill is least likely to be of — and it scrapes two more
things besides, session results and starting grids, that answer a different question from *what was
this Session*. `bin/catalogue` runs the two schedule commands of that role and takes a year.

## A season, not a Session

`bin/backfill` takes a year, a Meeting and a Session because that is the shape of what it reads —
one Session's streams, downloaded from the livetiming archive. The catalogue reads a different
source, and that source is a calendar: one request returns every Meeting of a year, and the
per-Meeting timetables follow from it. There is no per-Session request to make.

Folding it into `bin/backfill` would therefore mean re-scraping a whole season, twenty-five
Meetings deep, on every Session backfilled — the shape
[ADR-0008](0008-backfilling-a-session-is-a-command-that-replaces-it.md) exists to remove, arriving
by the back door. `bin/catalogue <year>` is the sibling command instead. Each command reads one
source, at that source's own granularity.

## Running it twice needs nothing

Unlike the historical path, upstream's scraper **upserts**: `_ingest` sets `_id` and `_key` from the
Meeting or Session key, and `upsert_data_sync` matches on `_key` and replaces in place. Two runs
leave the same documents behind, and none of ADR-0008's discard machinery applies here — a
`bin/catalogue` that deleted first would be inventing a problem to solve.

That difference is upstream's, not ours, so `bin/catalogue` prints its record counts at the end of
every run rather than asserting the property in prose: if a moved pin ever changes the write path,
the second run says so.

## Consequences

- **Two commands, and the order between them does not matter.** A Session can be catalogued before
  it is backfilled or after, and neither reads the other's collections.
- **The catalogue is a season's worth or nothing.** There is no way to catalogue one Meeting, and
  adding one would mean the same scrape for a twenty-fifth of the result.
- **A catalogued season goes stale.** The calendar is scraped at a moment: a rescheduled Session or
  a cancelled Meeting is only reflected by running the command again. `is_cancelled` is upstream's
  own manual flag and nothing here sets it.
- **`bin/catalogue` gets its own job in `deploy/compose.yaml`**, on its own profile, for the same
  reason `backfill` has one — the entrypoint that reads `ROLE` is the season-wide service
  behaviour, and both commands override it.
- **Results and starting grids are still unwritten.** They are the other half of upstream's
  `scrape-latest`, they are not identity, and no command here runs them yet.

## Revisit when

- A second season is wanted. Nothing prevents `bin/catalogue 2024` today, but the counts printed at
  the end are scoped to the year asked for, and disk has not been measured across several.
- The Session clock in #13 is built. `date_start`, `date_end` and `gmt_offset` come from here, and
  whether a scraped calendar is accurate enough to drive a Replay clock — against the livetiming
  archive's own `t0` — is not yet known.
