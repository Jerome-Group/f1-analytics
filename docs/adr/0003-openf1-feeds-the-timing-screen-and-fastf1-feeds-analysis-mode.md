# OpenF1 feeds the Timing screen, FastF1 feeds Analysis mode, and the two never meet

Two projects normalise Formula 1 data, and each is the best available at a different thing.
[OpenF1](https://github.com/br-g/openf1) turns the live feed into records — seventeen collections
covering laps, sectors, intervals, stints, pit, overtakes, race control, weather and radio.
[FastF1](https://github.com/theOehrly/Fast-F1) is far richer over completed sessions, with
telemetry, degradation and results, and cannot do live at all: its own documentation states that
live timing data can only be *recorded* during a session, not used in real time.

So OpenF1 is run, self-hosted, for the Timing screen — and it serves **both** live sessions and
Replay, because the same deployment ships a historical backfill that writes past sessions into
the same collections in the same shapes. FastF1 is reserved for Analysis mode, offline, and the
Timing screen never calls it.

**The important half of this decision is the "never meet".** Taking the best of each means two
normalisations of the same concepts — a lap, a stint, a gap exist in both, shaped differently.
The obvious way to spend that is to have views accept both shapes, which taxes every view forever
and gets worse with each one added. The way out is that Replay and Analysis mode are not the same
view wanting two sources; they are **different views wanting one source each**:

| What is being done | Source | Shapes |
|---|---|---|
| Watching a live Session | OpenF1, realtime ingest | OpenF1 |
| Replaying a past Session in the same views | OpenF1, historical ingest | OpenF1 — identical, no branching |
| Analysis mode: telemetry, degradation, results | FastF1 | FastF1, and nothing else sees them |

Nothing is reconciled because nothing overlaps. The Timing screen sees one set of shapes for its
entire life, and Analysis mode is a separate program that happens to live in the same repository.

Using OpenF1 for Replay rather than FastF1 is what buys this, and it has a second effect worth as
much: **a past Session can be replayed on a Tuesday.** Without it, the live path could only ever
be worked on during a live session, which is roughly six Sundays a year of development time.

Two things about OpenF1 are worth recording because they are not obvious from the outside. Its
realtime ingest does not contain its own feed client — it shells out to `br-g/fastf1-livetiming`,
a detached copy of FastF1's client, which is what actually tracks Formula 1's move to
`signalrcore`. And OpenF1 is **CC BY-NC-SA 4.0**: it may be deployed but never vendored, forked
into this repository, or read and adapted. It is a service this project runs, not a library it
uses, and that distinction is what keeps ShareAlike off this code (ADR-0005).

## Consequences

- **`deploy/` runs somebody else's software and owns none of it.** A compose override, an
  environment file and a backfill command — no upstream source is committed here, ever. Upstream
  changes are pulled by image tag, not merged.
- **An Adapter is mandatory, not stylistic.** OpenF1's field names must terminate in `server/`
  and reach neither `web/` nor `domain/`. Without it this decision quietly becomes "OpenF1's
  schema is our domain model", and the freedom it was chosen for is gone.
- **The feed-tracking this buys belongs to one person's detached copy of FastF1's client.** It is
  maintained and current, and it is a single point of failure. If it stops, OpenF1's live ingest
  stops with it, and the fallback is FastF1's own client with locally written normalisation.
- **Replay costs disk.** Roughly 80 MB per race session and 7–10 GB for a backfilled season, which
  falls to about 1 GB if car telemetry and positions are excluded from the backfill.
- **Analysis mode is Python and the live path is TypeScript.** The repository is deliberately
  polyglot; the two paths share no code, which is what makes that acceptable rather than a mess.

## Revisit when

- OpenF1's realtime ingest stops following the upstream feed. The normalisation is the thing being
  bought — if it stops arriving, the calculation changes completely.
- Analysis mode needs to appear *inside* the Timing screen rather than beside it. That is the one
  requirement this structure refuses, and satisfying it means reconciling the two shapes after all
  — deliberately, in a new record, rather than by accident in a component.
- A third source is wanted. Adding one is only cheap while the "one view, one source" rule holds;
  the first view fed by two sources is the moment this decision has been abandoned.
