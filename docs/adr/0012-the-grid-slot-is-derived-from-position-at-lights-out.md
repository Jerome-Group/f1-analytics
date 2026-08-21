# The grid slot is derived from the timing feed, not scraped from formula1.com

The position-change column (#12) needs a Driver's grid slot, and nothing in the Stores holds one.
[ADR-0009](0009-the-catalogue-is-a-season-at-a-time.md) recorded why: `bin/catalogue` runs the
schedule half of upstream's `scrape-latest` role and stopped there deliberately, and the starting
grid is the other half — "the starting grid is the only source for #12's position-change column,
and picking between that scrape and deriving the slot from `position` is #12's to do." This is #12
doing it.

## The two candidates

**Scrape it.** Upstream's `starting_grid` role parses formula1.com's results pages with
BeautifulSoup and lxml, per Session, defaulting to the latest when not told which. It would be a
third `bin/` command beside `bin/catalogue` and `bin/backfill`, on its own compose job, reading a
different source at a different granularity from either.

**Derive it.** A Backfill already stores `position` as a change log. The grid slot is the position
each Driver holds at lights out — the first classification of the Session — which is in that log
already, at no network cost and with no HTML to parse.

## The decision

Derive it, from the timing feed's position at lights out.

- **It needs nothing new to run.** The scrape is a third command, a third compose job, and a third
  source — an HTML source, which is the most brittle kind and the one most likely to break on a
  formula1.com redesign. Deriving reads a collection a Backfill already wrote.
- **It keeps the data path single.** [ADR-0003](0003-openf1-feeds-the-timing-screen-and-fastf1-feeds-analysis-mode.md)'s
  arrow is `OpenF1 → MQTT → server/`. The scrape adds a second inbound source of Session truth for
  one column; deriving keeps every Driver fact arriving the one way.
- **It is Free.** No new dependence on a page that could move behind a login, consistent with
  [ADR-0002](0002-live-data-is-the-free-subset-only.md).

The cost is that deriving has to be *right*, and being right is not free: the slot is the grid
order, not the order on the formation lap, and it has to account for a pit-lane start (a Driver who
does not take a grid slot at all) and for grid penalties already applied in the classification. A
scrape would hand those over pre-resolved. Deriving owns them.

## What this ADR builds, and what it defers

This ADR settles the *source*. The column and the model are built with it: `Driver.gridPosition`
is in the canonical model, absent for a Driver not yet placed at lights out and for a pit-lane
start, and the renderer draws the change against the current position with its direction.

Settling `gridPosition` from the position log — finding the lights-out classification and handling
the formation lap, pit-lane starts and penalties — is `server/`'s to do when it accumulates
position over the Session. That accumulation does not exist yet: the Adapter reads only the latest
position per Driver, and Gap, Interval, last and best lap are modelled and rendered but not yet
settled from the feed either (#9). The grid slot joins them — modelled, rendered, and derived by
`server/` when the per-lap accumulation it depends on is built — rather than arriving early by the
back door of a scrape whose whole cost is the accumulation this defers.

## Consequences

- **No `bin/starting-grid`.** The starting-grid half of `scrape-latest` stays unrun, as ADR-0009
  left it. Should the derivation prove untrustworthy on pit-lane starts or penalties in a way the
  log cannot resolve, this is the decision to revisit, and the scrape is the fallback on record.
- **A pit-lane start has no grid slot**, and its position change reads as level rather than as an
  invented slot. That is correct: a car that started from the pit lane did not start from a place
  on the grid.
- **The scrape fallback is, for now, a fallback to nothing.** Upstream's `starting_grid` is empty
  for the 2026 season (#73), so the option this record kept on the table would currently return no
  rows to parse. That is not an argument this decision made at the time and it is not one it needs
  — it is a footnote for whoever reaches for the fallback and finds it hollow.

## Revisit when

- The derivation meets a real Session's pit-lane start or a post-race penalty and cannot place a
  Driver the log does not cleanly classify at lights out. The scrape candidate is the fallback, and
  its cost was written down here so the comparison does not have to be redone.
