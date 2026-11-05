#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Backfilling names a Session, and a Session is three keys. Getting one of them wrong has to be
# an argument error at the prompt, not an hour of ingesting the wrong Session.
#
# And getting the ingest wrong has to cost nothing: a Backfill replaces the Session it names or
# leaves it exactly as it was, which is what the second half of this file is about (#69).
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

backfill="$here/../bin/backfill"

# The volume is deliberately absent: a usage error is answered from the arguments alone, before
# anything asks where the runtime lives.
misuse() {
  env F1_RUNTIME_HOME=/Volumes/NotMounted/.runtime "$backfill" "$@" 2>&1
}

assert_fails "bin/backfill with no arguments" misuse
assert_fails "bin/backfill with a Meeting but no Session" misuse 2025 1267
assert_fails "bin/backfill with a Session key that is not a key" misuse 2025 1267 monza
assert_fails "bin/backfill with more than a Session" misuse 2025 1267 9920 laps

# `*[!0-9]*` does not match an empty argument, and the Session key reaches MongoDB as an
# interpolated literal. A usage error is the only failure here that does not depend on the volume
# being absent, so it is what the assertion looks for.
assert_contains "bin/backfill refuses an empty Session key as a usage error" \
  "is not a key" \
  "$(misuse 2025 1267 "")"

assert_contains "bin/backfill with no arguments says what it takes" \
  "bin/backfill <year> <meeting-key> <session-key>" \
  "$(misuse)"

assert_contains "bin/backfill names the argument that is wrong" \
  "monza" \
  "$(misuse 2025 1267 monza)"

# --- What a run leaves in the stores --------------------------------------------------------------
#
# bin/backfill itself is run; only what is underneath it is faked. A scratch bin/ holds the wrapper,
# an environment.sh whose placement guards pass, and a `compose` that answers for the container
# stack — MongoDB by the JSON store in test/lib/mongo-store.ts, which runs the very snippets
# bin/lib/mongo.sh sends, and the ingest by whatever each case says the ingest does. So the order of
# operations and the snippets are the code under test, and what is asserted is the stores.

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

store="$scratch/stores.json"
store_during_the_ingest="$scratch/stores-during-the-ingest.json"

mkdir -p "$scratch/bin/lib"
ln -s "$backfill" "$scratch/bin/backfill"

cat >"$scratch/bin/lib/environment.sh" <<EOF
F1_REPO_ROOT="$scratch"
source "$here/../bin/lib/mongo.sh"
f1_ensure_runtime_home() { :; }
f1_require_vm() { :; }
f1_ensure_compose_plugin() { :; }
EOF

{
  cat <<EOF
#!/usr/bin/env bash
set -uo pipefail
store="$store"
store_during_the_ingest="$store_during_the_ingest"
mongo_store="$here/lib/mongo-store.ts"
EOF
  cat <<'EOF'
case "$1" in
  ps)
    printf 'mongo\n'
    ;;
  exec)
    while [ "$#" -gt 0 ] && [ "$1" != "--eval" ]; do shift; done
    node "$mongo_store" "$store" <<<"$2"
    ;;
  run)
    # The stores as the ingest found them, so a case can ask what was still there while it ran.
    cp "$store" "$store_during_the_ingest"
    node "$mongo_store" "$store" <<EOJS >/dev/null
db.laps.insertMany(Array.from({ length: $F1_INGEST_RECORDS }, (_, lap) => ({
  session_key: ${*: -1},
  lap_number: lap + 1,
})));
EOJS
    exit "$F1_INGEST_STATUS"
    ;;
esac
EOF
} >"$scratch/bin/compose"
chmod +x "$scratch/bin/compose"

snippet() {
  node "$here/lib/mongo-store.ts" "$1" <<<"$2"
}

# Two Sessions and the catalogue that names them. 11343 is the one being backfilled, and the four
# records it holds are a live capture of it — the unrepeatable half that #69 watched a Backfill
# destroy. 9920 is in the same collections and is nobody's business here.
the_stores_hold_a_live_capture() {
  cat >"$store" <<'EOF'
{
  "laps": [
    { "session_key": 11343, "lap_number": 1 },
    { "session_key": 11343, "lap_number": 2 },
    { "session_key": 9920, "lap_number": 1 }
  ],
  "car_data": [
    { "session_key": 11343, "driver_number": 1 },
    { "session_key": 11343, "driver_number": 4 }
  ],
  "meetings": [
    { "meeting_key": 1292, "year": 2026, "meeting_name": "Australian Grand Prix" }
  ],
  "sessions": [
    { "session_key": 11343, "meeting_key": 1292, "year": 2026, "session_name": "Race" },
    { "session_key": 9920, "meeting_key": 1267, "year": 2025, "session_name": "Race" }
  ]
}
EOF
}

# The same stores with that capture never taken, which is the ordinary first Backfill of a Session.
the_stores_hold_no_such_session() {
  the_stores_hold_a_live_capture
  snippet "$store" "
    for (const name of ['laps', 'car_data']) db[name].deleteMany({ session_key: 11343 });
  "
}

# <records the ingest writes> <status the ingest exits with>
backfill_session_11343() {
  env F1_INGEST_RECORDS="$1" F1_INGEST_STATUS="$2" "$scratch/bin/backfill" 2026 1292 11343 2>&1
}

# What a store file holds for a Session, counted the way bin/backfill counts it: every collection
# except the catalogue's own two.
records_for() {
  snippet "$1" "
    const collections = db.getCollectionNames()
      .filter((name) => !['meetings', 'sessions'].includes(name));
    print(collections.reduce(
      (total, name) => total + db[name].countDocuments({ session_key: $2 }), 0,
    ));
  "
}

# The rows that say what the Session and its Meeting *are*. bin/catalogue writes them and only
# bin/catalogue may take them away (ADR-0009); a Backfill that deletes by session_key alone drops
# the `sessions` row and the Session stops being listed at all, which is what #69 observed.
catalogue_rows_for_the_session() {
  snippet "$store" "
    print(db.sessions.countDocuments({ session_key: 11343 })
      + db.meetings.countDocuments({ meeting_key: 1292 }));
  "
}

# A record still marked as superseded is a run that did not finish putting the stores back.
marked_records() {
  snippet "$store" "
    print(db.getCollectionNames().reduce(
      (total, name) => total + db[name].countDocuments({ _superseded: true }), 0,
    ));
  "
}

# --- An interrupted ingest ------------------------------------------------------------------------

the_stores_hold_a_live_capture
interrupted="$(backfill_session_11343 3 1)"
interrupted_status="$?"

assert_equals "an ingest that does not finish fails the command" "1" "$interrupted_status"

assert_equals "nothing the stores held is deleted before the ingest has run" \
  "4" "$(records_for "$store_during_the_ingest" 11343)"

# Four, not seven: the three records the interrupted ingest managed to write are not left behind
# either. Either the Backfill replaces the Session or it changes nothing.
assert_equals "an interrupted ingest leaves the Session exactly as it was" \
  "4" "$(records_for "$store" 11343)"

assert_equals "and leaves no record marked as being replaced" "0" "$(marked_records)"

assert_equals "the catalogue still names the Session and its Meeting" \
  "2" "$(catalogue_rows_for_the_session)"

assert_equals "a second Session in the same collections is untouched" \
  "1" "$(records_for "$store" 9920)"

assert_contains "the run says what it is about to replace before it replaces anything" \
  "already hold 4 records for Session 11343" "$interrupted"

assert_contains "and says the Session is as it was when the ingest does not finish" \
  "as it was, 4 records" "$interrupted"

# --- An ingest that returns without writing a record ----------------------------------------------
#
# Upstream's insert path logs a write that failed and exits zero all the same, so a Backfill that
# trusted the exit status would discard a live capture in exchange for nothing.

the_stores_hold_a_live_capture
wrote_nothing="$(backfill_session_11343 0 0)"
wrote_nothing_status="$?"

assert_equals "an ingest that writes nothing fails the command" "1" "$wrote_nothing_status"

assert_equals "and leaves the Session exactly as it was" "4" "$(records_for "$store" 11343)"

assert_contains "and says why" "without writing a record" "$wrote_nothing"

# --- An ingest that finishes ----------------------------------------------------------------------

the_stores_hold_a_live_capture
completed="$(backfill_session_11343 5 0)"

assert_equals "a Backfill that finishes replaces the Session rather than adding to it" \
  "5" "$(records_for "$store" 11343)"

assert_equals "and leaves no record marked as being replaced" "0" "$(marked_records)"

assert_equals "and leaves the catalogue's rows where they were" \
  "2" "$(catalogue_rows_for_the_session)"

assert_contains "and says how much it replaced" "4 superseded records discarded" "$completed"

# --- A first Backfill of a Session the stores do not hold -----------------------------------------

the_stores_hold_no_such_session
first="$(backfill_session_11343 5 0)"

assert_equals "a first Backfill ingests the Session" "5" "$(records_for "$store" 11343)"

assert_equals "and has nothing to warn about, so says nothing" \
  "0" "$(grep -c 'already hold' <<<"$first")"

finish
