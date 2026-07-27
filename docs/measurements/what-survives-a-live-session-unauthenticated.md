# What survives a live Session unauthenticated

**Status: pending a Live window.** This is the one measurement in this directory that cannot be
taken from the Stores or a fixture — it needs a Session actually running, and none had run since the
live path was built (#17). The procedure is recorded here so that whoever is at the machine during
the next Live window can take it in one command; the results table is left blank on purpose, to be
filled in by the pull request that takes it.

## The question

ADR-0002 decided this project consumes only the Free subset — the streams Formula 1 publishes during
a Live window without an F1TV token. What that decision left open is exactly which streams those are,
because the boundary is upstream's and undocumented. Three things turn on the answer:

1. **Car telemetry (`CarData.z`).** The acceptance criterion #17 carries: does per-Driver telemetry —
   speed, throttle, gear, RPM — arrive unauthenticated during the Live window, or is it Gated? If it
   is Gated, live per-Driver telemetry becomes Replay-only and the ticket that renders it shrinks.

2. **DRS specifically.** DRS is one channel *inside* `CarData.z`, alongside speed and the rest. No
   documentation settles whether Formula 1 gates the DRS channel or the whole `CarData.z` stream. If
   the whole stream is Gated, question 1 is answered with it; if only DRS is, telemetry survives and
   DRS alone reads as unavailable.

3. **The Session-global streams #13 draws.** Whether `ExtrapolatedClock`, `LapCount` and
   `TrackStatus` arrive unauthenticated — the countdown, the lap count, and the flag condition the
   strip shows. The same recording answers this, so it is taken here rather than waited on twice.

## How to take it

Needs nothing this repository builds — no `server/`, no `domain/`, no dashboard, only a live Session
and the recorder the stack already carries. The recorder is `python -m fastf1_livetiming save
<file> <topics…>`, and it appends `--auth` only when `F1_TOKEN` is set, so **leaving `F1_TOKEN`
unset is the measurement** — an unauthenticated capture is a first-class path, not a degraded one.

During any Live window, from the residential connection the stack runs on (Formula 1 IP-blocks
datacentre ranges, so a cloud host records nothing — #17):

```bash
bin/compose run --rm --entrypoint python backfill \
  -m fastf1_livetiming save /tmp/probe.txt \
  CarData.z Position.z ExtrapolatedClock LapCount TrackStatus SessionInfo --timeout 600
```

Then read `/tmp/probe.txt`: a topic that arrived has lines; a topic that was Gated has none. For
`CarData.z`, decode one line and look for the DRS channel among the per-Driver channels to separate
question 1 from question 2 — the whole stream absent answers both, the stream present with DRS
absent answers them apart.

## Results

_To be filled in by the Live-window capture._

| Stream | Topic | Arrived unauthenticated? |
|---|---|---|
| Car telemetry | `CarData.z` | — |
| — of which, DRS channel | (within `CarData.z`) | — |
| Car location | `Position.z` | — |
| Session countdown | `ExtrapolatedClock` | — |
| Lap count | `LapCount` | — |
| Flag condition | `TrackStatus` | — |

Once taken, this answers the open question in
[`docs/adr/0002`](../adr/0002-live-data-is-the-free-subset-only.md); record any consequence for the
per-Driver telemetry ticket there.
