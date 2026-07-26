# What twenty rows of sparklines cost to build

Measured 27 July 2026 on an **Apple M4** (Mac16,10) under **Node v26.4.0**, with
`node test/lib/sparkline-frame.ts` — five thousand frames, after a five-hundred-frame warm-up the
timing does not count.

The acceptance criterion #16 turns on is that twenty rows of sparklines update without dropped
frames, *measured rather than assumed*. This is that measurement.

## What is being timed

The browser rebuilds the whole Timing table on every update — `table.innerHTML = timingScreen(state)`
in [`web/main.ts`](../../web/main.ts) — so a frame's work is building that markup string and then the
browser parsing it. The string is the part this repository's code is responsible for, and its size is
what the browser is then handed; both are measured here.

The field is the most expensive frame the screen draws: twenty Drivers, each with a full twelve-lap
window behind it, so all three sparklines are drawn on every row and none is the cheap absent case.
That is what a mid-to-late race Replay actually looks like — the Adapter wires all three trends off the
laps, intervals and Stints streams ([`server/openf1/adapter.ts`](../../server/openf1/adapter.ts)) — so
the harness is not a worst case held in reserve but the ordinary frame once a Session is under way.
The one lighter row is the leader's, whose Gap trend is absent because a leader is behind no one.

| | Per frame |
|---|---:|
| Mean | 0.16 ms |
| Median | 0.14 ms |
| p95 | 0.28 ms |
| **Frame budget (60 fps)** | **16.67 ms** |
| Markup built | 45.3 KiB |

A frame is built in about **a hundredth of the 60 fps budget**, and the slowest one in twenty is still
inside a third of a millisecond. The per-lap sparklines are drawn once per Driver per lap, and even
rebuilt on every frame regardless — the worst the update path could do — they leave the budget almost
entirely unspent. That is the whole point of the per-lap/per-second split: a lap-time trend redraws
twenty times a minute, where the throttle trace #16 refuses to sparkline would redraw around eighty
times a second across the field ([CONTEXT.md](../../CONTEXT.md), "Per-lap tier").

## Why the number stays small

The window is bounded where the data is built, not where it is drawn: the Adapter keeps only the last
twelve laps per Driver (`RECENT_LAPS` in [`server/openf1/adapter.ts`](../../server/openf1/adapter.ts)),
so a Driver forty laps into a race still carries a dozen. The renderer draws whatever window it is
given, so the cost cannot grow with the race — twelve laps at lap fifteen and twelve laps at lap
seventy build the identical row. Each sparkline is a handful of coordinates rounded to a tenth of a
pixel, which is what keeps the markup at 45 KiB for the whole field rather than the several hundred a
point-per-second trace would reach.

## Reproducing this

```
node test/lib/sparkline-frame.ts
```

The figures move a little run to run and machine to machine; the margin against the budget does not.
