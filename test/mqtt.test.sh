#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# The MQTT client is hand-written for the reason the WebSocket server is (ADR-0011): a package would
# make test/run install one before it could say whether the live path works. So the wire format is
# this project's to get right, and this file pins it — the bytes a subscriber sends, and the reading
# of the frames a broker sends back, including the two a naive parser gets wrong: a frame split across
# two reads, and a payload long enough to need a two-byte length.
#
# The socket, the heartbeat and the reconnect are not here — they are exercised against a real broker
# end to end in the live seam (test/live.test.sh). This is the pure half (server/mqtt/protocol.ts).
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

mqtt() {
  node "$here/lib/mqtt-map.ts" "$1"
}

# --- What a subscriber sends -------------------------------------------------------------------
# CONNECT, SUBSCRIBE and the heartbeat, asserted as the exact hex a broker reads, so a change to the
# framing is a changed test rather than a Session that silently never connects.

# Protocol name "MQTT", level 4, clean-session flag 0x02, 30-second keepalive, client id "client".
assert_equals "CONNECT is a clean-session 3.1.1 connect carrying the client id" \
  "101200044d5154540402001e0006636c69656e74" "$(mqtt connect)"

# Packet id 1, then each topic length-prefixed and asked for at QoS 0. The 0x82 first byte is
# SUBSCRIBE's required 0b0010 flags, which no other packet here carries.
assert_equals "SUBSCRIBE asks for each topic at QoS 0 under packet id 1" \
  "82180001000776312f6c61707300000976312f7374696e747300" "$(mqtt subscribe)"

assert_equals "PINGREQ is the two-byte heartbeat that holds the connection open" "c000" "$(mqtt ping)"
assert_equals "DISCONNECT is the two-byte clean shutdown" "e000" "$(mqtt disconnect)"

# --- Reading the frames a broker sends ---------------------------------------------------------
# Only PUBLISH carries anything the feed reads. The decoder takes a byte stream, not one packet per
# read, so these pin the three cases that distinguishes it from a parser that assumed otherwise.

assert_equals "two whole PUBLISH frames in one read decode in order, nothing left over" \
  'v1/laps|{"a":1} v1/drivers|{"b":2} rest=0' "$(mqtt roundtrip)"

# A frame arriving in two reads must not be torn: the first read yields no packet and keeps its bytes,
# and the two reads together yield the one frame whole.
assert_equals "a PUBLISH split across two reads is held, not torn" \
  'first=0 rest=18 whole=v1/intervals|{"gap_to_leader":1.5}' "$(mqtt partial)"

assert_equals "a payload past the single-byte length boundary survives whole" \
  "intact len=311" "$(mqtt long)"

finish
