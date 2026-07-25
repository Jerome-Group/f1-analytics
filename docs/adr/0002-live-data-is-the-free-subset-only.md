# Live data is the free subset only, and this project holds no credential

Formula 1 publishes most of its live timing feed without authentication. Since the 2025 Dutch
Grand Prix it has withheld four things during a session unless the connection carries an F1TV
token: **live car positions**, the **DRS indicator**, **championship standings**, and **pit stop
durations**. This project consumes the unauthenticated subset and nothing else — not as a first
step, but permanently.

The alternative was to obtain the token, which is a `login-session` cookie read out of a browser
after signing in to a Formula 1 account, valid for roughly a week and then re-obtained by hand.
That is not technically difficult. It loses anyway, for two reasons that compound.

**The four gated streams come back free the moment the session ends.** Gating is a property of
the live window, not of the data: a finished session is fetched whole, car positions included. So
the token does not buy access to a category of data, it buys access to four streams *earlier*.
Everything a Replay shows, and everything Analysis mode will ever compute, is unaffected by this
decision. What is actually given up is a live track map, a DRS light, a live championship table,
and live pit stop timings — during the session, and only then.

**The cost of the token is not the token, it is becoming a system that has credentials.** A
secret has to be stored somewhere outside the repository, refreshed on a cadence nobody enjoys,
kept out of logs and out of commits, and reasoned about again the moment anything is deployed
anywhere. For a dashboard whose entire remaining attack surface is a browser talking to
`localhost`, that is the single largest complication available, bought for four streams that
arrive free an hour later.

It also happens to be the decision that keeps a future public deployment coherent. One
unauthenticated connection may legitimately fan out to any number of viewers; one person's F1TV
token serving strangers is a different proposition entirely, and not one worth having to think
about later.

## Consequences

- **The live Timing screen has no track map, no DRS indicator, no championship table and no pit
  stop durations.** Their absence is deliberate and should not be read as unfinished work. Every
  one of them is available in Replay.
- **Replay is the complete view and live is the reduced one.** This inverts the usual assumption
  and is worth stating wherever the two modes are described, because a reader will expect the
  opposite.
- **No part of this system reads a credential**, which means there is no secret to store, rotate,
  leak, or exclude from a commit. `AGENTS.md` forbids committing a token; this decision removes
  the opportunity.
- **One measurement is outstanding.** The DRS indicator is carried inside the same upstream car
  telemetry stream as speed, throttle, gear and RPM. Whether Formula 1 gated the DRS channel or
  the whole stream is not answerable from any documentation found; the first live session settles
  it. If the whole stream is gated, the Per-second tier is nearly empty during a live session and
  per-Driver telemetry becomes a Replay-only feature.

## Revisit when

- Formula 1 gates a stream the Timing screen depends on for its core function — lap times,
  sectors, intervals or stints. That would not be a reduction, it would be the end of the live
  mode, and the trade-off reopens on completely different terms.
- A live track map becomes the point of the project rather than a nice-to-have. That is the one
  gated stream with no substitute during a session, and wanting it badly enough is a legitimate
  reason to overturn this.
