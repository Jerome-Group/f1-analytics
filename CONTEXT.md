# f1-live-analytics — context

A dashboard for watching a live Formula 1 session: the official timing screen, expanded, fed by a
self-hosted data pipeline.

## Language

The ubiquitous language of this repository: the words the code, the issues and the commits all
use for the same thing. An entry earns its place when two people — or a person and an agent —
could reasonably mean different things by the same word.

Each entry is the term, what it means **here**, and the near-synonyms to avoid so the wrong one
does not creep back in.

### What is being watched

**Meeting**:
A whole Grand Prix weekend — one event at one circuit, containing several Sessions.
_Avoid_: race, event, round, weekend

**Session**:
A single continuous on-track running: FP1, FP2, FP3, Qualifying, Sprint, or the Race. The unit
everything else is scoped to; a Lap or a Stint without a Session is meaningless.
_Avoid_: race, event, session type

**Live window**:
The period a Session's data is arriving in real time — from thirty minutes before it starts to
thirty minutes after it ends. Outside it the same Session is historical. The boundary is the
upstream pipeline's, not ours, and it is the only thing that decides which mode applies.
_Avoid_: race time, session time, live mode

### Where the data comes from

**Free subset**:
The streams Formula 1 publishes during the Live window without an F1TV account. This is the only
live data this project consumes, permanently and by decision (ADR-0002).
_Avoid_: public data, open data, unauthenticated feed

**Gated stream**:
A stream withheld during the Live window unless the connection carries an F1TV token — car
positions, DRS, championship standings, and pit stop durations. Gated is a property of the Live
window only: after a Session finishes, every Gated stream is freely available.
_Avoid_: premium, paid, restricted

**Ingestor**:
The upstream service that holds the connection to Formula 1, decodes the feed and writes records.
It is run, never written, here (ADR-0003).
_Avoid_: scraper, collector, poller, feed

**Adapter**:
The boundary in `server/` where upstream record shapes stop and this project's own types begin.
Its whole purpose is that no upstream field name appears anywhere above it.
_Avoid_: mapper, transformer, DTO layer, translator

### What the dashboard holds and shows

**Session state**:
The canonical, whole-Session model the backend holds and the browser renders — every Driver, and
everything known about them so far. Defined in `domain/`, and identical whether the Session is
live or replayed.
_Avoid_: snapshot, cache, store, state tree

**Timing screen**:
The primary and only v1 view: all twenty Drivers at once, in position order, in the shape of the
official Formula 1 timing screen but carrying considerably more per-Driver data.
_Avoid_: tower, leaderboard, table, dashboard, grid

**Gap**:
The time from a Driver to the **leader**.
_Avoid_: interval, delta, difference

**Interval**:
The time from a Driver to the **car immediately ahead**. Not a synonym for Gap, and the two are
routinely confused in commentary and in upstream field names — which is exactly why both are here.
_Avoid_: gap, delta, difference

**Stint**:
One continuous run on a single set of tyres, ending at a pit stop or at the end of the Session.
Carries the compound and the tyre's age in laps, which is not the same as laps completed in the
Stint — a tyre may be fitted with laps already on it.
_Avoid_: run, phase, tyre life

**Per-lap tier** / **Per-second tier**:
The split that governs what may be rendered for all twenty Drivers at once. Per-lap data arrives
roughly twenty times a minute across the whole field and is cheap enough to render continuously
and to draw as sparklines. Per-second data — car telemetry, live Intervals — arrives around eighty
times a second across the field and is rendered only for a Driver the viewer has opened.
_Avoid_: hot/cold, fast/slow, high-frequency

### The two ways of looking at a past Session

**Replay**:
A past Session played back through the Timing screen, in the same shapes as live, with a scrubable
Session clock. Replay is not a reduced view of live — because no stream is Gated once a Session has
finished, it is the *complete* one.
_Avoid_: historical, playback, archive, rewind

**Backfill**:
Fetching one finished Session from Formula 1's archive and writing it into the stores, so that it
can be Replayed. A deliberate one-Session command, not a background import, and re-running it for
the same Session replaces that Session rather than adding a second copy (ADR-0008). It is what
puts a Session there; Replay is what looks at it.
_Avoid_: import, sync, ingest, load

**Analysis mode**:
The separate, offline path over completed Sessions — telemetry, degradation, results. It has its
own source and its own shapes, and the Timing screen never calls it (ADR-0003). Deferred; not built.
_Avoid_: historical mode, deep dive, post-race, insights

## Organisation-wide

Two terms mean the same thing in every repository:

**Organisation**:
The `Jerome-Group` GitHub org — the top-level account that owns the repositories.
_Avoid_: team, group

**Baseline**:
The configuration every repository in the Organisation inherits — branch protection, the
security defaults, and the per-repository settings. It is applied from the management hub, not
from here.
_Avoid_: template, policy, default
