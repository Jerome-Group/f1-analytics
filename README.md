# f1-analytics

A dashboard for watching a live Formula 1 session — the official timing screen, expanded, showing
all twenty drivers at once with considerably more per-driver data than the broadcast gives you.
It runs locally, against a self-hosted data pipeline, and it can replay a past session through the
same views.

A [Jerome-Group](https://github.com/Jerome-Group) repository. See [`MAP.md`](MAP.md) to find your
way around, [`CONTEXT.md`](CONTEXT.md) for the vocabulary, and [`AGENTS.md`](AGENTS.md) for how
work is done here.

## Status

🌱 **The path exists end to end, and carries almost nothing.** `bin/up` runs the self-hosted
OpenF1 stack, and `server/` reads a backfilled session out of it and serves session state to a
WebSocket — twenty drivers with position, number, code and team, and no more than that. The
browser at the other end is not written yet. The decisions are recorded in
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

The pipeline runs and the backend serves; the dashboard does not exist yet.

```
bin/up      # api, the live ingestor, MongoDB and Mosquitto — building whatever is missing first
bin/down    # and the virtual machine with them, so the volume can be unplugged

bin/archive 2025              # mirror a season's raw files; 2025 1267 9920 for one session
bin/backfill 2025 1267 9920   # one past session into the stores, whole
bin/catalogue 2025            # what that season's meetings and sessions are — names and clocks

node server/main.ts 9920      # serve that session's state on ws://127.0.0.1:8080
bin/fixture                   # re-cut the committed test recording from the running stores
```

The first run clones and builds the upstream Ingestor and takes a few minutes; later runs take
about thirty seconds. The API is then on `localhost:8000` and the broker on `localhost:1883`.

`bin/up` imports nothing. Past sessions are backfilled on purpose, one at a time, by
`bin/backfill` — running it again for the same session replaces it rather than storing it twice
([ADR-0008](docs/adr/0008-backfilling-a-session-is-a-command-that-replaces-it.md)). A race session
costs about 80 MB, [measured](docs/measurements/a-race-session-on-disk.md).

A backfill stores what happened; it does not store that the session was the Race at Zandvoort on
31 August. `bin/catalogue` does, a whole season at a time, because it reads Formula 1's calendar
rather than the livetiming archive
([ADR-0009](docs/adr/0009-the-catalogue-is-a-season-at-a-time.md)). It costs
[88 KB and half a minute](docs/measurements/a-season-in-the-catalogue.md), and running it again
updates the season in place.

`bin/archive` is the layer beneath all of that: this project's own copy of the raw files, which
both OpenF1 and FastF1 read. It is the only data here that cannot be rebuilt — Formula 1 has
already removed 2018 and 2022 from its own servers — so it lives in `.archive/` beside the
repository, never inside it and never committed.

One rule applies from the first commit: **never invoke the container runtime directly.**
Everything goes through `bin/`, which places the runtime, its virtual machine and all data on the
external volume. A bare `docker compose up` will silently use the wrong disk and appear to work —
see
[ADR-0004](docs/adr/0004-the-container-toolchain-lives-on-the-raid0-and-is-reached-through-bin.md).

Tests are `test/run`, and need nothing installed. Neither does the backend: Node runs the
TypeScript as it is written, and the only package in the repository is the type checker, which is
a check on a pull request rather than a step before anything works
([ADR-0011](docs/adr/0011-the-live-path-is-typescript-that-node-runs-and-nothing-is-installed-to-run-it.md)).

```
npm ci && npm run typecheck
```

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
