# f1-analytics

A dashboard for watching a live Formula 1 session — the official timing screen, expanded, showing
all twenty drivers at once with considerably more per-driver data than the broadcast gives you.
It runs locally, against a self-hosted data pipeline, and it can replay a past session through the
same views.

A [Jerome-Group](https://github.com/Jerome-Group) repository. See [`MAP.md`](MAP.md) to find your
way around, [`CONTEXT.md`](CONTEXT.md) for the vocabulary, and [`AGENTS.md`](AGENTS.md) for how
work is done here.

## Status

🌱 **The pipeline comes up; nothing reads from it yet.** `bin/up` runs the self-hosted OpenF1
stack, and no application code exists above it. The decisions are recorded in
[`docs/adr/`](docs/adr/) and the vocabulary in [`CONTEXT.md`](CONTEXT.md).

## What it is

- **One screen.** A faithful recreation of the Formula 1 timing screen, all twenty drivers always
  visible, with per-driver depth — telemetry, stint history, sectors, radio — behind a toggle
  rather than on screen at once.
- **Live and replay, through the same views.** A past session is played back in exactly the shapes
  a live one arrives in, so nothing branches on which it is.
- **Free data only.** No Formula 1 account, no token, no credential anywhere in the system
  ([ADR-0002](docs/adr/0002-live-data-is-the-free-subset-only.md)). Four streams are withheld
  during a live session because of this — car positions, DRS, championship standings and pit stop
  durations — and all four are available in replay, because the gating ends when the session does.

## What it is not

- **Not a hosted service.** It runs on one machine for one viewer. A public deployment is a
  recorded possibility, not a plan.
- **Not telemetry analysis.** Degradation curves, throttle traces and driver comparisons are a
  separate offline mode that is deferred and not built
  ([ADR-0003](docs/adr/0003-openf1-feeds-the-timing-screen-and-fastf1-feeds-analysis-mode.md)).
- **Not affiliated with Formula 1** in any way.

## How it is put together

```
OpenF1 (self-hosted)  →  MQTT  →  server/  →  one WebSocket  →  web/
```

| Directory | What lives there |
|---|---|
| `archive/` | The Archive — mirrors the raw files Formula 1 publishes. Depends on nothing else here. |
| `deploy/` | The self-hosted OpenF1 stack — the compose file, the upstream pin, the broker's configuration. Runs upstream software; owns none of it. |
| `server/` | The backend. Subscribes to MQTT, holds canonical session state, serves it to the browser. |
| `web/` | The timing screen. |
| `domain/` | The canonical types, shared by `server/` and `web/` so the boundary is enforced by the compiler. |
| `analysis/` | Deferred. Offline FastF1 work; the dashboard never calls it. |
| `bin/` | Wrappers. Every container command goes through these — see below. |
| `test/` | The tests, and the script that runs them. |

Data is split by **update frequency, not category**: per-lap data (laps, sectors, stints, pit,
race control, weather) is cheap enough to render for all twenty drivers continuously, and
per-second data (car telemetry, live intervals) is rendered only for a driver you have opened.

## Getting started

The pipeline runs; the dashboard does not exist yet.

```
bin/up      # api, the live ingestor, MongoDB and Mosquitto — building whatever is missing first
bin/down    # and the virtual machine with them, so the volume can be unplugged

bin/archive 2025              # mirror a season's raw files; 2025 1267 9920 for one session
bin/backfill 2025 1267 9920   # one past session into the stores, whole
```

The first run clones and builds the upstream Ingestor and takes a few minutes; later runs take
about thirty seconds. The API is then on `localhost:8000` and the broker on `localhost:1883`.

`bin/up` imports nothing. Past sessions are backfilled on purpose, one at a time, by
`bin/backfill` — running it again for the same session replaces it rather than storing it twice
([ADR-0008](docs/adr/0008-backfilling-a-session-is-a-command-that-replaces-it.md)). A race session
costs about 80 MB, [measured](docs/measurements/a-race-session-on-disk.md).

`bin/archive` is the layer beneath all of that: this project's own copy of the raw files, which
both OpenF1 and FastF1 read. It is the only data here that cannot be rebuilt — Formula 1 has
already removed 2018 and 2022 from its own servers — so it lives in `.archive/` beside the
repository, never inside it and never committed.

One rule applies from the first commit: **never invoke the container runtime directly.**
Everything goes through `bin/`, which places the runtime, its virtual machine and all data on the
external volume. A bare `docker compose up` will silently use the wrong disk and appear to work —
see
[ADR-0004](docs/adr/0004-the-container-toolchain-lives-on-the-raid0-and-is-reached-through-bin.md).

Tests are `test/run`, and need nothing installed.

## What this licence does not cover

The code here is **MIT** ([`LICENSE`](LICENSE)). Three things that does *not* mean:

1. **It covers this repository's code only** — not the data, not the dependencies.
2. **It does not make this system commercially usable by anyone, including its author.** A working
   deployment requires [OpenF1](https://github.com/br-g/openf1), which is CC BY-NC-SA 4.0 —
   **NonCommercial**. MIT on this code does not lift that, and a reader who checks `LICENSE` and
   stops there will conclude otherwise.
3. **The data belongs to Formula 1.** This project is unofficial and unaffiliated, and Formula 1's
   own terms govern the feed regardless of anything written here.

The reasoning is in [ADR-0005](docs/adr/0005-the-code-is-mit-and-the-system-it-runs-in-is-not.md).

## Built on

- **[OpenF1](https://github.com/br-g/openf1)** (CC BY-NC-SA 4.0) — normalises the live feed. Run,
  never vendored.
- **[FastF1](https://github.com/theOehrly/Fast-F1)** (MIT) — the historical library behind the
  deferred analysis mode.
