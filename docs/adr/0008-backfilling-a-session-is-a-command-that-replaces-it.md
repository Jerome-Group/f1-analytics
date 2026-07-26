# Backfilling a Session is a command, and it replaces that Session rather than adding to it

Upstream ships the historical Ingestor as a service. Its entrypoint reads `$ROLE`, and for
`ingest-historical` that means: fetch the current year's schedule, then ingest every Meeting of
the season, then exit. Wired into `deploy/compose.yaml` the way upstream wires it, that ran on
every `bin/up` — a season-wide import nobody asked for, starting at the one moment it is least
wanted, thirty minutes before a Session, competing with the live path for disk and network.

It is a job, not a service. So it carries a compose profile, which keeps it out of `bin/up`
entirely, and `bin/backfill` is the only thing that starts it — with the entrypoint overridden,
because the entrypoint *is* the season-wide behaviour.

## Running it twice

Upstream's historical write path inserts; it does not upsert. `insert_data_sync` issues plain
`InsertOne` operations, nothing checks whether the Session is already stored, and no unique index
exists to reject the second copy. A Session ingested twice is stored twice.

The query API hides this — it groups on `_key` and keeps the newest — so the duplication is
invisible from the outside and visible only as disk. That is worse, not better: it is a fault
that grows quietly and is never reported.

**A unique index on `_key` is the obvious fix and is wrong.** Storing several versions of the same
`_key` is not a bug upstream tolerates, it is the mechanism the live path runs on: a Lap document
is re-inserted as it is filled in, and the API's group-and-take-newest is what turns that into one
current record. A unique index would freeze every document at its first version and break live
ingest to make backfill tidy.

So `bin/backfill` **discards the Session before ingesting it**. Every document a Session produces
carries `session_key`, so the delete is exact, and a second Session in the same collections is
untouched. Two runs leave the same records behind, and — the part a skip-if-present check would
not give — a Session that was ingested from a half-broken feed is repaired by running the command
again.

The alternative of fixing this upstream and moving the pin was considered. It is the better fix
for everyone and a slower one for us: the change is upstream's to accept, and until it is accepted
the pin cannot move. Nothing here forecloses it — this repository owns *when* the Session is
written and *what is there first*, never how a record is shaped, which is the line
[ADR-0003](0003-openf1-feeds-the-timing-screen-and-fastf1-feeds-analysis-mode.md) draws.

## The indexes upstream does not create

Upstream creates no index on any collection, on any deployment. Everything below the Per-second
tier survives that. `car_data` and `location` do not: they hold about seven hundred thousand
documents each for a single race Session, and a query for one Driver's telemetry scans all of
them, sorts them and groups them, which the query API abandons at its own five-second limit. The
records are stored and unreadable.

`bin/backfill` therefore creates a `session_key, driver_number, date` index on those two
collections before it writes. It is the same kind of ownership as the discard — operating the
stores, not reshaping what upstream puts in them.

## Consequences

- **`bin/up` no longer imports anything.** It brings up the API, the live Ingestor, MongoDB and
  the broker, and stops. A Session gets into the stores because somebody ran `bin/backfill`.
- **A backfill is destructive to the Session it names, briefly.** It deletes before it ingests, so
  an interrupted run leaves that Session missing rather than half-old and half-new. The repair is
  the same command.
- **Re-running does not return disk.** WiredTiger keeps the space freed by the delete inside its
  files and reuses it, so the second run of a Session roughly doubles the files on disk and later
  runs stay flat. Record counts are what stay constant, not file size.
- **The keys are upstream's, and there is no lookup here.** `bin/backfill` takes a year, a Meeting
  key and a Session key and does not try to resolve a name to them; its usage message points at
  upstream's `get-schedule`.
- **A stack that is down is a usage error.** `bin/backfill` talks to a running MongoDB, so it
  requires `bin/up` first and says so, rather than starting containers of its own.

## Revisit when

- Upstream's historical path learns to upsert, or grows a resume. Then the discard becomes
  redundant and should go rather than sit there as belt and braces.
- A second Session is regularly backfilled alongside a first. Nothing here prevents it, but the
  indexes were chosen against one Session's worth of telemetry and are worth re-measuring.
