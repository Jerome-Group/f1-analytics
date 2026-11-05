# What survives a live Session unauthenticated

Measured 21 August 2026 against **Zandvoort 2026 Practice 1** (Meeting 1292, Session 11343), whose
Live window ran 10:30–11:30Z. The Session was recorded live on an unauthenticated connection with no
`F1_TOKEN` set, and then backfilled with `bin/backfill 2026 1292 11343` once it had finished — the
same Session twice, once through the Live window's gating and once without it. Gating is a property
of the Live window only ([ADR-0002](../adr/0002-live-data-is-the-free-subset-only.md)), so the
difference between the two runs *is* the gating, and nothing else has to be assumed about it.

The raw wire capture is kept at `.archive/live-captures/2026-08-21_Zandvoort_Practice_1/` — outside
the repository, beside the Archive, because it is Formula 1's data. It is 22,233 SignalR messages
over the hour, one per line, and every count below can be read back out of it.

## The question

ADR-0002 decided this project consumes only the Free subset — the streams Formula 1 publishes during
a Live window without an F1TV token. What that decision left open is exactly which streams those
are, because the boundary is upstream's and undocumented. Three things turned on the answer:

1. **Car telemetry (`CarData.z`).** The acceptance criterion #17 carries: does per-Driver telemetry —
   speed, throttle, gear, RPM — arrive unauthenticated during the Live window, or is it Gated? If it
   is Gated, live per-Driver telemetry becomes Replay-only and the ticket that renders it shrinks.

2. **DRS specifically.** DRS is one channel *inside* `CarData.z`, alongside speed and the rest. No
   documentation settles whether Formula 1 gates the DRS channel or the whole `CarData.z` stream. If
   the whole stream is Gated, question 1 is answered with it; if only DRS is, telemetry survives and
   DRS alone reads as unavailable.

3. **The Session-global streams #13 draws.** Whether the countdown, the lap count and the flag
   condition arrive unauthenticated — what the strip shows above the field.

## Results

| Stream | Collection | Live | Backfilled | Reading |
|---|---|---:|---:|---|
| Car telemetry | `car_data` | 0 | 402,512 | **Gated, whole stream** |
| — of which, DRS | `car_data.drs` | — | `null` | **Abolished for 2026** |
| Car location | `location` | 0 | 410,234 | **Gated, whole stream** |
| Championship standings | `championship_drivers` | 0 | 0 | Not settled — practice has none |
| Championship standings | `championship_teams` | 0 | 0 | Not settled — practice has none |
| Pit stops | `pit` | 97 | 97 | Free |
| — of which, durations | `pit.pit_duration` | 75 | 97 | **Free** |
| Laps and sectors | `laps` | 5,264 | 5,264 | Free |
| Stints | `stints` | 893 | 893 | Free |
| Classification | `position` | 803 | 803 | Free |
| Weather | `weather` | 82 | 82 | Free |
| Race control | `race_control` | 68 | 68 | Free |
| Drivers | `drivers` | 22 | 22 | Free |
| Team radio | `team_radio` | 8 | 8 | Free |
| Session | `sessions` | 1 | 1 | Free |
| Intervals | `intervals` | 0 | 0 | Free — a practice Session has none |
| Overtakes | `overtakes` | 0 | 0 | Free — a practice Session has none |

**7,238 records arrived live against 819,984 in the Backfill**, and the whole of the difference is
the two telemetry collections.

The DRS row is not a gating result and cannot be one: the 2026 regulations abolished DRS, replacing
it with active aerodynamics and the Overtake and Boost modes.
`db.car_data.distinct("drs", {session_key: 11343})` over the Backfill returns exactly `[null]` —
402,512 readings, not one of them carrying a value. The channel upstream's schema still has is a
field for a device that no longer exists, so ADR-0002's question about whether Formula 1 gates the
DRS channel has no answer of either kind.

## What the wire says

Counted straight out of the capture, so the reading does not depend on what the Ingestor chose to
store. The connection was subscribed to `CarData.z` and `Position.z` throughout:

| Topic | Messages |
|---|---:|
| `TimingData` | 20,495 |
| `TimingAppData` | 827 |
| `Heartbeat` | 406 |
| `PitLaneTimeCollection` | 194 |
| `DriverList` | 138 |
| `WeatherData` | 82 |
| `RaceControlMessages` | 66 |
| `SessionData` | 14 |
| `TeamRadio` | 8 |
| `SessionInfo` | 3 |
| `CarData.z` | **0** |
| `Position.z` | **0** |

Not one frame of either, in an hour of a Session that ran. Formula 1 does not thin those streams
during a Live window, it does not send them at all — which is the harsher of the two branches
ADR-0002 named, and settles questions 1 and 2 together.

Three things the wire says that the collection counts cannot:

- **Pit stop durations arrive live, in the ordinary stream.** The 97 pit records are 97
  `PitLaneTimeCollection` entries, 75 of them carrying a non-empty `Duration`. The 22 that do not
  are every one of them on lap 1 — cars leaving the pit lane at the start of the Session, which is
  a pit exit with no stop to time. There is nothing withheld here to find.

- **`TimingData` carries `Withheld: False`.** The feed states for itself that the timing stream in
  front of us is the whole one. Whatever Formula 1 gates, it is not the column data the Timing
  screen is made of.

- **The 2026 successor to the DRS light arrives free, in race control.** The capture carries
  `OVERTAKE DISABLED` at 10:32 and `OVERTAKE ENABLED` at 10:38 as ordinary
  `RaceControlMessages` — the same stream, and the same block of the strip, the yellow flags came
  through. Whatever active aero and Overtake mode replace DRS with, its availability is announced on
  a stream this project already has and already draws.

## What is not settled

- **Championship standings.** Both collections are empty live *and* empty in the Backfill, because a
  practice Session has no standings to publish either way. That is a Session type with nothing to
  say, not a measurement, and it cannot be told apart from gating here. A race settles it, and until
  one does, ADR-0002 keeps Formula 1's 2025 announcement as its authority for that one stream.

- **The Session countdown.** No `ExtrapolatedClock` frame appears in the capture, and the
  subscription list is not recoverable from the file, so "not sent" and "not subscribed" cannot be
  told apart. Question 3's other two halves are answered: the flag condition arrived — ten
  `TrackStatus` transitions inside `SessionData`, green through yellow and back — and a practice
  Session has no lap count to send, so `LapCount` is a race-day reading.

## Reproducing this

The capture itself needs a Session actually running, from the residential connection the stack runs
on (Formula 1 IP-blocks datacentre ranges, so a cloud host records nothing — #17). The recorder is
the one the stack already carries, and it appends `--auth` only when `F1_TOKEN` is set, so **leaving
`F1_TOKEN` unset is the measurement** — an unauthenticated capture is a first-class path, not a
degraded one:

```bash
bin/compose run --rm --entrypoint python backfill \
  -m fastf1_livetiming save /tmp/probe.txt \
  CarData.z Position.z ExtrapolatedClock LapCount TrackStatus SessionInfo --timeout 600
```

A topic that arrived has lines; a topic that was Gated has none. The other half — the Backfill it is
compared against — is `bin/backfill 2026 1292 11343` after the Session has finished, and it prints
the per-collection counts when it ends.

The counts above can be re-read from the kept capture without a Session at all:

```bash
python3 -c '
import ast, collections, sys
counts = collections.Counter(ast.literal_eval(line)[0] for line in open(sys.argv[1]))
print(*(f"{n:7d}  {topic}" for topic, n in counts.most_common()), sep="\n")
' .archive/live-captures/2026-08-21_Zandvoort_Practice_1/raw-signalr.jsonl
```

This measurement is what [`docs/adr/0002`](../adr/0002-live-data-is-the-free-subset-only.md) was
revised against; the consequence for per-Driver telemetry is recorded there.
