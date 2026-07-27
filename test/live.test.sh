#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The live path (#17): the second Adapter feed, and the point of the product. MQTT documents go in and
# the Session state that comes out is asserted — the same as seam 1's REST recording, only fed over a
# broker. The acceptance criterion the ticket is named for is that no view changes to support this,
# which is proved by the seam 2 tests passing untouched (they are not edited) and, here, by the live
# feed building its Session through the very same Adapter the REST feed uses.
#
# The socket, heartbeat and wire format are pinned in test/mqtt.test.sh; this is the feed, the
# reconnect and the whole path end to end against a stand-in broker (lib/mqtt-broker.ts).
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

# --- The feed accumulates the Stores, upserting re-published records ---------------------------
# The Ingestor publishes a lap the moment it starts and again as it completes, and a Stint as its
# last lap moves — the same document re-sent under the same unique key. The feed must upsert, not
# accumulate, or a lap would be counted twice and a stale Stint would shadow the current one.

accumulate() {
  node "$here/lib/live-map.ts" "$@" | sed -n '2p'
}

# The topics the live path subscribes to, off the same harness.
topics() {
  node "$here/lib/live-map.ts" </dev/null | sed -n '1p'
}

# A lap re-published: first with no duration (on the road), then completed. And a second lap. One
# Driver, off the two streams the sparklines and the tyre badge come from.
upserted="$(accumulate <<'LINES'
v1/drivers	{"driver_number":1,"name_acronym":"VER","team_name":"Red Bull Racing","session_key":9}
v1/laps	{"driver_number":1,"lap_number":1,"lap_duration":null,"session_key":9}
v1/laps	{"driver_number":1,"lap_number":1,"lap_duration":90.0,"session_key":9}
v1/laps	{"driver_number":1,"lap_number":2,"lap_duration":89.5,"session_key":9}
v1/stints	{"driver_number":1,"stint_number":1,"lap_start":1,"lap_end":2,"compound":"MEDIUM","tyre_age_at_start":0,"session_key":9}
LINES
)"

laps_of() {
  python3 -c '
import json, sys
driver = json.load(sys.stdin)["drivers"][0]
recent = ",".join(str(lap["number"]) + ":" + str(lap["time"]) for lap in driver["recentLaps"])
print(
    "completed=" + str(driver["lapsCompleted"]),
    "last=" + str(driver["lastLap"]),
    "best=" + str(driver["bestLap"]),
    "recent=" + recent,
)
'
}

# The re-published lap 1 is one completed lap at its final duration, not two and not one still on the
# road: two laps completed, lap 1 carrying 90.0s and not the null it first arrived as.
assert_equals "a re-published lap upserts to one completed lap at its final duration" \
  "completed=2 last=89500 best=89500 recent=1:90000,2:89500" \
  "$(laps_of <<<"$upserted")"

# The Session key is read from the documents, as the REST feed reads it from its request URL.
assert_equals "the Session key is taken from the documents themselves" \
  "9" "$(python3 -c 'import json,sys; print(json.load(sys.stdin)["sessionKey"])' <<<"$upserted")"

# --- The live feed and the REST feed are the same Adapter -------------------------------------
# The whole of ADR-0003: fed the same records, the two feeds produce byte-identical Drivers, because
# neither maps — both call sessionStateFrom. The records are given once and turned into each feed's
# input, so a divergence could only be the feed, not the fixture.

records='{
  "sessionKey": 9,
  "drivers": [
    { "driver_number": 81, "name_acronym": "PIA", "team_name": "McLaren" },
    { "driver_number": 1, "name_acronym": "VER", "team_name": "Red Bull Racing" }
  ],
  "position": [
    { "driver_number": 81, "date": "2025-08-31T13:29:00Z", "position": 1 },
    { "driver_number": 1, "date": "2025-08-31T13:29:00Z", "position": 2 }
  ],
  "intervals": [
    { "driver_number": 81, "date": "2025-08-31T13:29:00Z", "gap_to_leader": 0, "interval": 0 },
    { "driver_number": 1, "date": "2025-08-31T13:29:00Z", "gap_to_leader": 5.6, "interval": 5.6 }
  ],
  "laps": [
    { "driver_number": 1, "lap_number": 5, "lap_duration": 75.648 }
  ],
  "stints": []
}'

# Through the REST Adapter: the records handed straight to sessionStateFrom.
rest_drivers="$(node "$here/lib/adapter-map.ts" <<<"$records")"

# Through the live feed: the same records turned into `v1/<collection>` documents, each stamped with
# the Session key the Ingestor stamps on it, and fed as MQTT lines.
live_drivers="$(python3 -c '
import json, sys
records = json.load(sys.stdin)
key = records["sessionKey"]
for collection in ("drivers", "position", "intervals", "laps", "stints"):
    for record in records[collection]:
        print(f"v1/{collection}\t" + json.dumps({**record, "session_key": key}))
' <<<"$records" | accumulate | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["drivers"], separators=(",", ":")))')"

assert_equals "the live feed and the REST feed build the identical Drivers through the one Adapter" \
  "$rest_drivers" "$live_drivers"

# --- Opening a Driver on the live path (#18) --------------------------------------------------
# The live feed answers the same control the Replay does, out of what it has subscribed to. That is
# the whole of what #18 leaves for #42: the depth is built by the same Adapter here as there, and the
# only thing the trace waits for is a topic.

opened_lines='v1/drivers	{"driver_number":1,"name_acronym":"VER","team_name":"Red Bull Racing","session_key":9}
v1/laps	{"driver_number":1,"lap_number":1,"lap_duration":90.0,"duration_sector_1":30.0,"duration_sector_2":31.0,"duration_sector_3":29.0,"session_key":9}
v1/stints	{"driver_number":1,"stint_number":1,"lap_start":1,"lap_end":1,"compound":"MEDIUM","tyre_age_at_start":0,"session_key":9}
v1/team_radio	{"driver_number":1,"date":"2025-08-31T13:29:00Z","recording_url":"https://livetiming.formula1.com/x.mp3","session_key":9}'

depth_of() {
  python3 -c '
import json, sys

state = json.load(sys.stdin)
opened = state.get("opened")
if opened is None:
    print("nobody open")
else:
    print("driver=" + str(opened["number"]),
          "stints=" + str(len(opened.get("stints", []))),
          "laps=" + str(len(opened.get("laps", []))),
          "sectors=" + str(len(opened.get("laps", [{}])[0].get("sectors", []))),
          "radio=" + str(len(opened.get("radio", []))),
          "telemetry=" + str(len(opened.get("telemetry", []))))
'
}

# Nobody open is the ordinary state of a Live Session, and it carries no depth for anyone — the same
# criterion seam 1 checks of a Replay, on the path where the per-second tier would actually cost.
assert_equals "a Live Session with nobody open carries no depth for any Driver" \
  "nobody open" "$(printf '%b\n' "$opened_lines" | accumulate | depth_of)"

# Opened: the Stint, the lap sector by sector and the radio, all out of the subscription above. The
# trace is empty because `v1/car_data` is not subscribed to, which is #42 and not a failure here.
assert_equals "an opened Driver carries the depth the live subscription holds, and no trace" \
  "driver=1 stints=1 laps=1 sectors=3 radio=1 telemetry=0" \
  "$(printf '%b\n' "$opened_lines" | accumulate 1 | depth_of)"

# The boundary between this ticket and #42, written down where it can be checked: the per-second
# tier is not subscribed to at all, so it cannot arrive and be discarded.
assert_equals "the live path subscribes to every stream the screen shows, and not to car telemetry" \
  "v1/drivers v1/position v1/intervals v1/laps v1/stints v1/team_radio" "$(topics)"

# --- A dropped connection reconnects (#17) ----------------------------------------------------
# The connection half of "reconnects without losing accumulated Session state": the broker publishes,
# drops the socket, and the client dials back and receives what the second connection carries. The
# state half is the feed's — its accumulation is independent of any connection, shown above — so the
# two together are the whole guarantee.

assert_equals "the client reconnects after a drop and receives what the new connection publishes" \
  "1 44" "$(node "$here/lib/mqtt-reconnect.ts")"

# --- The whole live path, broker to socket (seam 1) -------------------------------------------
# server/live.ts spawned against a stand-in broker, and the Session state read back off the WebSocket
# a browser connects to. This is the live counterpart to test/server.test.sh, and what it asserts is
# that the path produces a Session no view can tell from a Replay's — carrying `mode: 'live'`, which
# is the one thing that differs and the one thing the strip reads to mark the Gated streams (#13).

live="$(node "$here/lib/seam1-live.ts")"

as_a_timing_screen() {
  python3 -c '
import json, sys
for driver in json.load(sys.stdin)["drivers"]:
    print(driver.get("position", "-"), driver["number"], driver.get("code", "-"), driver.get("team", "-"))
'
}

figures_of() {
  python3 -c '
import json, sys
driver = next(d for d in json.load(sys.stdin)["drivers"] if d["number"] == int(sys.argv[1]))
def separation(value):
    if value is None: return "-"
    (kind, amount), = value.items()
    return f"{kind}:{amount}"
print("gap=" + separation(driver.get("gap")), "interval=" + separation(driver.get("interval")),
      "last=" + str(driver.get("lastLap", "-")), "tyre=" + str(driver.get("tyre", {}).get("compound", "-")))
' "$1"
}

envelope() {
  python3 -c 'import json,sys; s=json.load(sys.stdin); print(s.get("mode","-"), s["sessionKey"])'
}

# Live mode and the Session key the documents named — the mid-Session snapshot a browser is sent,
# carrying the key the change stream by design never re-sends (#14).
assert_equals "a live browser is sent Live-mode Session state, keyed by the Session the feed read" \
  "live 9" "$(envelope <<<"$live")"

assert_equals "the field arrives in position order with code and livery, off the live feed" \
  "$(
    cat <<'EOF'
1 81 PIA McLaren
2 4 NOR McLaren
3 1 VER Red Bull Racing
EOF
  )" \
  "$(as_a_timing_screen <<<"$live")"

# The leader is behind no one — Gap and Interval absent — but the placed cars carry both, each its
# own and not the other, all the way across the live path.
assert_equals "the leader has no separation off the live feed" \
  "gap=- interval=- last=- tyre=-" "$(figures_of 81 <<<"$live")"

assert_equals "a placed Driver's Gap and Interval arrive off the live feed, each its own" \
  "gap=millis:5600 interval=millis:2400 last=89500 tyre=medium" "$(figures_of 1 <<<"$live")"

finish
