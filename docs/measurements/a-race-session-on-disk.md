# What a race Session actually costs on disk

Measured 26 July 2026 against the **2025 Dutch Grand Prix Race** (Meeting 1267, Session 9920),
backfilled into an empty MongoDB with `bin/backfill 2025 1267 9920` at upstream pin
`b3b5061`. Figures were read from `$collStats` ninety seconds after the ingest, once WiredTiger had
checkpointed, and cross-checked against `du` inside the container.

That Session was chosen on purpose: it is the one Formula 1 began gating from, so it is also the
proof that gating ends when a Session does.

| Collection | Records | BSON | On disk | Indexes |
|---|---:|---:|---:|---:|
| `car_data` | 691,640 | 117.3 MB | 23.5 MB | 14.8 MB |
| `location` | 731,740 | 92.7 MB | 21.7 MB | 15.7 MB |
| `intervals` | 30,867 | 4.5 MB | 1.3 MB | 0.3 MB |
| `laps` | 1,365 | 0.7 MB | 0.2 MB | 0.0 MB |
| `position` | 483 | 0.1 MB | 0.0 MB | 0.0 MB |
| `overtakes` | 237 | 0.0 MB | 0.0 MB | 0.0 MB |
| `weather` | 159 | 0.0 MB | 0.0 MB | 0.0 MB |
| `race_control` | 110 | 0.0 MB | 0.0 MB | 0.0 MB |
| `stints` | 60 | 0.0 MB | 0.0 MB | 0.0 MB |
| `pit` | 40 | 0.0 MB | 0.0 MB | 0.0 MB |
| `team_radio` | 32 | 0.0 MB | 0.0 MB | 0.0 MB |
| `championship_drivers` | 21 | 0.0 MB | 0.0 MB | 0.0 MB |
| `drivers` | 20 | 0.0 MB | 0.0 MB | 0.0 MB |
| `championship_teams` | 10 | 0.0 MB | 0.0 MB | 0.0 MB |
| **Total** | **1,456,784** | **215.3 MB** | **46.9 MB** | **31.1 MB** |

**78 MB per race Session**, collections and indexes together, and `du` on the data directory
agrees at 80 MB.

## What is actually in there

Every collection was read back through the query API on `localhost:8000`, not just counted in
MongoDB, because stored and readable are different claims — and for the two telemetry collections
they came apart. Before the indexes existed, `/v1/car_data` and `/v1/location` returned a
`MaxTimeMSExpired` traceback rather than data: the query scans the collection and the API gives up
at five seconds. With the indexes, both answer immediately. Everything else was readable either
way.

The four streams Formula 1 gates during a Live window
([ADR-0002](../adr/0002-live-data-is-the-free-subset-only.md)) are all present and all populated,
which is the point of backfilling this Session in particular:

| Gated stream | Where it landed | Evidence |
|---|---|---|
| Car positions | `location` | 731,740 records, `x`/`y`/`z` per Driver |
| DRS | `car_data.drs` | 295,748 records with DRS active, across ten distinct channel values |
| Championship standings | `championship_drivers`, `championship_teams` | 21 and 10 records, `points_start` and `points_current` |
| Pit stop durations | `pit` | 39 of 40 records carry `stop_duration` |

The DRS row settles half of ADR-0002's outstanding measurement: whatever Formula 1 does to that
channel during a Session, it is intact in the archive. What happens to it *live* is still
unanswered and still needs a live Session.

Sectors are inside `laps` rather than beside them: 1,359 of 1,365 laps carry all three
`duration_sector_*` values — the six that do not are in-laps and retirements — and all 1,365 carry
the `segments_sector_*` arrays the Timing screen needs for purple and green.

## Running it twice

The Session was backfilled a second time into the stores it was already in:

| | Run 1 | Run 2 |
|---|---:|---:|
| Records discarded first | 0 | 1,456,784 |
| Records after | 1,456,784 | 1,456,784 |

Identical, per collection as well as in total, which is the behaviour
[ADR-0008](../adr/0008-backfilling-a-session-is-a-command-that-replaces-it.md) exists to produce —
upstream's insert-only write path stores a second copy otherwise. `bin/backfill` prints the
per-collection counts at the end of every run, so this is checked by running the command rather
than by trusting this table.

## Against the estimate

[ADR-0003](../adr/0003-openf1-feeds-the-timing-screen-and-fastf1-feeds-analysis-mode.md) estimated
**~80 MB per race Session** and ~7–10 GB for a backfilled season. The per-Session figure is right
to within a couple of megabytes, which is closer than it had any right to be. Extrapolating the
2025 calendar — twenty-four Meetings, five Sessions each and a race Session being the longest —
puts a whole backfilled season comfortably inside that 7–10 GB range.

Two things the estimate did not carry:

- **Compression is doing most of the work.** The documents are 215 MB of BSON and 47 MB on disk;
  the 80 MB figure only holds because WiredTiger compresses about 4.6:1. Anything that reasons
  about this data in memory should use the BSON number, not this one.
- **Indexes are 40% of the total**, and all but 0.6 MB of them are the two telemetry indexes
  `bin/backfill` creates ([ADR-0008](../adr/0008-backfilling-a-session-is-a-command-that-replaces-it.md)).
  They are not optional — without them the API cannot read `car_data` or `location` at all — so
  they belong in the per-Session cost rather than beside it.

## Is the telemetry-excluded backfill worth having?

No. It should not be built.

Telemetry is a **larger** share than the estimate's ~90%: `car_data` and `location` are 97.7% of
the records and 96% of the disk. Everything else — laps, sectors, Stints, pit, intervals,
position, race control, weather, radio, the championship tables — comes to about **2 MB per race
Session**. So the excluded variant would save roughly 76 MB of 78, and a whole season would fall
from 7–10 GB to something near 200 MB.

That is a large saving of a cost that does not exist. The virtual machine is provisioned at
250 GB on a volume that has room, a full season is under 4% of it, and ingest is dominated by
downloading from Formula 1 rather than by writing — the whole Session above took about three
minutes end to end.

What it would cost is the point. The two collections it drops are the track map, the DRS
indicator and per-Driver telemetry — precisely the things
[ADR-0002](../adr/0002-live-data-is-the-free-subset-only.md) accepts losing during a live Session
*because Replay has them*. A backfill without them makes Replay the reduced view as well, which
removes the reason for the decision. A flag nobody should set is not worth the branch.

## Two caveats worth knowing

- **The journal is a fixed 200 MB**, pre-allocated by MongoDB and unrelated to how many Sessions
  are stored. The 78 MB above excludes it; `du -sm /data/db` reports 280 MB and most of that is
  not data.
- **Re-running a backfill does not shrink back.** The delete-then-ingest cycle frees space inside
  the WiredTiger files without returning it, so the second backfill of a Session took the files to
  165 MB and further runs reuse that space rather than growing again.

## Reproducing this

With the stack up and the stores empty:

```
bin/backfill 2025 1267 9920
```

The command prints records and on-disk size per collection when it finishes. Its figures are read
immediately and are therefore rougher than the ones above; wait a minute and ask again for a
settled number.
