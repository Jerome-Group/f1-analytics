# What a catalogued season costs, and what it answers

Measured 26 July 2026 against **2025**, with `bin/catalogue 2025` at upstream pin `b3b5061`, into
stores that already held the Dutch Grand Prix Race
([the other measurement](a-race-session-on-disk.md)) and no Meeting or Session at all.

| Collection | Records | BSON | On disk | Indexes |
|---|---:|---:|---:|---:|
| `meetings` | 25 | 18.1 KB | 24.0 KB | 20.0 KB |
| `sessions` | 123 | 41.0 KB | 24.0 KB | 20.0 KB |

**88 KB for a season**, against 78 MB for a single race Session. The cost is not worth a decision:
every season Formula 1 has ever run would fit in a couple of megabytes.

The time is the whole cost, and it is small too — **29 seconds** for the first run, 10 for the
second. Nearly all of it is the per-Meeting timetable requests, one per Meeting, at about a second
each. The event listing that gives the Meetings comes back in one, and is fetched twice: upstream's
`get_sessions` calls `get_meetings` itself, so the second command re-reads what the first just
wrote. That is why this is a little over the 22 seconds #25 measured for the scrape alone.

25 Meetings is 24 Grands Prix and Pre-Season Testing. The 123 Sessions are 63 Practice, 30
Qualifying and 30 Race — Sprint weekends carry a second of each of the last two, and upstream
normalises Sprint Qualifying to `session_type: Qualifying` with `session_name: Sprint Qualifying`,
so a count by type is not a count by name.

## Naming Session 9920

Which is what this is for. Read back through the query API on `localhost:8000`, not counted in
MongoDB:

| `/v1/sessions?session_key=9920` | | `/v1/meetings?meeting_key=1267` | |
|---|---|---|---|
| `session_name` | Race | `meeting_name` | Dutch Grand Prix |
| `session_type` | Race | `meeting_official_name` | FORMULA 1 HEINEKEN DUTCH GRAND PRIX 2025 |
| `circuit_short_name` | Zandvoort | `location` | Zandvoort |
| `country_name` | Netherlands | `country_name` | Netherlands |
| `date_start` | 2025-08-31T13:00:00+00:00 | `circuit_type` | Permanent |
| `date_end` | 2025-08-31T15:00:00+00:00 | `date_start` | 2025-08-29T10:30:00+00:00 |
| `gmt_offset` | 02:00:00 | `date_end` | 2025-08-31T15:00:00+00:00 |

The Session keys line up with the ones a Backfill was given by hand: Meeting 1267 catalogues five
Sessions, 9913 to 9916 and 9920, and 9920 is the Session already in the stores. Nothing joined them
— both sides carry upstream's key, which is the assumption #3 makes and this measurement checks.

Both collections answer immediately, and neither needed an index to. `/v1/sessions?year=2025`
returns all 123 and `/v1/meetings?year=2025` all 25 — the telemetry collections are the only ones
where stored and readable came apart.

## Running it twice

The season was catalogued a second time into the stores it was already in:

| | Run 1 | Run 2 |
|---|---:|---:|
| `meetings` | 25 | 25 |
| `sessions` | 123 | 123 |
| Distinct `_key` after | 148 | 148 |

Unchanged, and the `_key` row is the one that matters: upstream's scraper upserts on `_key`, so
there is no second copy to find rather than one hidden behind the query API's group-and-take-newest
— which is what the insert-only historical path does and what
[ADR-0008](../adr/0008-backfilling-a-session-is-a-command-that-replaces-it.md) had to work around.
`bin/catalogue` prints the two counts at the end of every run, so this is checked by running the
command rather than by trusting this table.

## Reproducing this

With the stack up:

```
bin/catalogue 2025
```
