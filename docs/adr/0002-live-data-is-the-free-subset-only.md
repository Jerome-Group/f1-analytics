# Live data is the free subset only, and this project holds no credential

Formula 1 publishes most of its live timing feed without authentication. Since the 2025 Dutch
Grand Prix it has withheld part of it during a session unless the connection carries an F1TV
token. This project consumes the unauthenticated subset and nothing else — not as a first step,
but permanently.

> **Revised 21 August 2026,** against the first Live window this system ever recorded
> ([`docs/measurements/what-survives-a-live-session-unauthenticated.md`](../measurements/what-survives-a-live-session-unauthenticated.md)).
> The decision is unchanged and the argument for it is the one it always was. What is corrected is
> the account of what the decision *costs*, which this record originally took from Formula 1's 2025
> announcement because nothing better existed: it named four withheld streams, and three of them
> turned out otherwise. The outstanding measurement it ended on has been taken, so that paragraph
> is gone rather than answered in place.

## What is actually withheld

The measurement is the same Session twice — Zandvoort 2026 Practice 1, captured live on an
unauthenticated connection and then backfilled once it had finished. Gating is a property of the
Live window, so the difference between the two is the gating and nothing else.

- **Car telemetry is gated as a whole stream.** Zero `car_data` readings live against 402,512 in the
  backfill of the same hour, and zero `CarData.z` frames in 22,233 messages of raw wire while
  subscribed to it. Not a thinned stream, not a stream with a channel removed: nothing at all.
- **Car locations are gated as a whole stream**, on the same evidence — zero `location` records live
  against 410,234 backfilled. This is the live track map, and it is the one loss this record always
  expected.
- **Pit stop durations are not gated.** They arrive in the ordinary pit stream during the session:
  75 of 97 records carried a duration live, and the 22 that did not are lap-one pit exits with no
  stop to time. This record named them as withheld and was simply wrong about it.
- **DRS is not gated, because DRS no longer exists.** The 2026 regulations abolished it in favour of
  active aerodynamics and the Overtake and Boost modes, and `car_data.drs` is `null` in every 2026
  reading. Its nearest successor is announced as an ordinary race control message — `OVERTAKE
  ENABLED`, `OVERTAKE DISABLED` — on a stream that arrives free and that the strip already draws.
- **Championship standings are not settled.** Both championship collections are empty live *and*
  empty in the backfill, because a practice session has no standings either way, so nothing there
  distinguishes gating from a session type with nothing to publish. They stay on this record's list
  on the 2025 announcement's authority until a race can separate the two.

Two streams measured gated, one presumed gated, one shown free, and one that turned out not to be a
stream at all.

## Why the token still loses

The alternative was to obtain the token, which is a `login-session` cookie read out of a browser
after signing in to a Formula 1 account, valid for roughly a week and then re-obtained by hand.
That is not technically difficult. It loses anyway, for two reasons that compound — and the
measurement made the first one weaker and the second one no different at all, which is the honest
way to put it.

**What is gated comes back free the moment the session ends.** Gating is a property of the live
window, not of the data: a finished session is fetched whole, telemetry and locations included. So
the token does not buy access to a category of data, it buys access to two streams *earlier*.
Everything a Replay shows, and everything Analysis mode will ever compute, is unaffected by this
decision.

**The measurement made that cost larger than this record assumed, and it is still the smaller
cost.** Two whole streams is not four indicators: `car_data` and `location` are 97.7% of the records
in a session ([`a-race-session-on-disk.md`](../measurements/a-race-session-on-disk.md)), so what is
withheld live is most of the session by volume. But volume is not the measure that matters here.
What those two streams draw is a track map and the per-second tier behind an opened Driver — two
features, one of which does not exist yet — while everything the Timing screen is actually made of
arrives free: `TimingData` carried `Withheld: False` throughout the recorded hour, and laps,
sectors, stints, positions, pit stops, weather, race control and radio were all complete live.

**The cost of the token is not the token, it is becoming a system that has credentials.** A
secret has to be stored somewhere outside the repository, refreshed on a cadence nobody enjoys,
kept out of logs and out of commits, and reasoned about again the moment anything is deployed
anywhere. For a dashboard whose entire remaining attack surface is a browser talking to
`localhost`, that is the single largest complication available, bought for streams that arrive free
an hour later.

It also happens to be the decision that keeps a future public deployment coherent. One
unauthenticated connection may legitimately fan out to any number of viewers; one person's F1TV
token serving strangers is a different proposition entirely, and not one worth having to think
about later.

## Consequences

- **The per-second tier is empty during a live session, and per-Driver telemetry is a Replay-only
  feature.** This is the branch this record hoped against: the trace an opened Driver shows has no
  live form at all, and it has to say so rather than draw an empty axis. It is the largest single
  consequence of this decision and it was not knowable until a session ran.
- **The live Timing screen has no track map, no telemetry and no championship table.** Their absence
  is deliberate and should not be read as unfinished work. Every one of them is available in Replay.
- **The strip advertises three gated streams, not four.** Positions, telemetry and standings. Pit
  stop durations came off the list because they measurably arrive, and DRS came off it because
  nothing on a 2026 car answers to that name — and nothing was invented to replace it, because the
  feature that replaced DRS is announced on a stream that is not gated. A label naming a stream that
  does not exist teaches a viewer something false about their own screen.
- **Replay is the complete view and live is the reduced one.** This inverts the usual assumption
  and is worth stating wherever the two modes are described, because a reader will expect the
  opposite.
- **No part of this system reads a credential**, which means there is no secret to store, rotate,
  leak, or exclude from a commit. `AGENTS.md` forbids committing a token; this decision removes
  the opportunity.

## Revisit when

- **A race is recorded live.** Standings are the one stream on this list still taken on Formula 1's
  word rather than measured, because a practice session has none to gate. The recording that settles
  it is the same one-command capture the measurement records, run on a race day.
- Formula 1 gates a stream the Timing screen depends on for its core function — lap times,
  sectors, intervals or stints. That would not be a reduction, it would be the end of the live
  mode, and the trade-off reopens on completely different terms. The recorded hour says it has not:
  `TimingData` arrives whole and says so.
- A live track map becomes the point of the project rather than a nice-to-have. That is the one
  gated stream with no substitute during a session, and wanting it badly enough is a legitimate
  reason to overturn this.
