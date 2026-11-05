# shellcheck shell=bash
# The stores, addressed from the host. Sourced; requires placement.sh.
#
# Every call goes out through bin/compose, so placement is inherited rather than restated
# (ADR-0004), and `mongosh` is the one in the running container rather than one the host has to
# have installed.
#
# A session_key or a year reaches MongoDB as an interpolated JavaScript literal, so callers pass a
# number and nothing else. bin/backfill and bin/catalogue both reject anything else at the prompt.

# Upstream's default, and upstream owns it: OPENF1_DB_NAME is left unset in deploy/compose.yaml.
F1_MONGO_DATABASE="openf1-livetiming"

f1_mongo_eval() {
  "$F1_REPO_ROOT/bin/compose" exec --no-TTY mongo \
    mongosh --quiet --eval "$1" "$F1_MONGO_DATABASE"
}

f1_require_stores() {
  "$F1_REPO_ROOT/bin/compose" ps --services --status running 2>/dev/null |
    grep --quiet --line-regexp mongo && return 0

  printf 'The stores are not running. Bring the stack up with bin/up.\n' >&2
  return 1
}

# Every collection a Session's records land in, which is every collection except the catalogue's
# own two. `meetings` and `sessions` say what a Session *is* rather than what it recorded, and
# bin/catalogue owns them (ADR-0009) — but the `sessions` document carries the same session_key
# every record carries, so a sweep by that key alone takes the Session's name away with its data
# and leaves a Session nothing can even list (ADR-0013).
F1_SESSION_COLLECTIONS="db.getCollectionNames()
      .filter((name) => !['meetings', 'sessions'].includes(name))"

# Upstream creates no index on any collection. Everything smaller than the Per-second tier
# survives that; car_data and location do not — a query for one Driver's telemetry scans seven
# hundred thousand documents and the query API abandons it at its own five-second limit. So these
# two indexes are what make a backfilled Session *readable* rather than merely stored (ADR-0008).
f1_index_telemetry() {
  f1_mongo_eval "
    for (const name of ['car_data', 'location']) {
      db[name].createIndex({ session_key: 1, driver_number: 1, date: 1 });
    }
  "
}

# The records the stores already hold for this Session, marked as the ones a Backfill is about to
# replace, and counted. Nothing is deleted: until the new records exist the old ones are all there
# is, and a mark can be taken back where a delete cannot (ADR-0013). The field is `_`-prefixed,
# which is the prefix upstream's query API strips from every document it returns, so no reader
# above the stores can see it.
f1_supersede_session() {
  f1_mongo_eval "
    const sessionKey = $1;
    let superseded = 0;
    for (const name of $F1_SESSION_COLLECTIONS) {
      superseded += db[name].updateMany(
        { session_key: sessionKey },
        { \$set: { _superseded: true } },
      ).matchedCount;
    }
    print(superseded);
  "
}

# Whether the ingest wrote anything at all: a record of this Session that is not marked as
# superseded can only have arrived since the mark. One is enough, so this looks for one rather
# than counting the million-odd it hopes to find.
f1_session_was_ingested() {
  local ingested
  ingested="$(f1_mongo_eval "
    const sessionKey = $1;
    print($F1_SESSION_COLLECTIONS.some((name) =>
      db[name].findOne({ session_key: sessionKey, _superseded: { \$exists: false } }) !== null,
    ));
  ")"
  [ "$ingested" = "true" ]
}

# The replace, completed: the superseded records go, now that the ones replacing them are in.
f1_discard_superseded() {
  f1_mongo_eval "
    const sessionKey = $1;
    let discarded = 0;
    for (const name of $F1_SESSION_COLLECTIONS) {
      discarded += db[name].deleteMany({ session_key: sessionKey, _superseded: true }).deletedCount;
    }
    print(discarded);
  "
}

# The replace, abandoned: whatever the ingest managed to write is the unmarked half and goes, and
# the marked half stops being marked and is the Session again. Prints what it put back. Called
# once, and only where the ingest did not finish — a second call would read the restored records
# as an unfinished ingest's work and delete the Session it had just put back.
f1_restore_superseded() {
  f1_mongo_eval "
    const sessionKey = $1;
    let restored = 0;
    for (const name of $F1_SESSION_COLLECTIONS) {
      db[name].deleteMany({ session_key: sessionKey, _superseded: { \$exists: false } });
      restored += db[name].updateMany(
        { session_key: sessionKey },
        { \$unset: { _superseded: '' } },
      ).matchedCount;
    }
    print(restored);
  "
}

# What the catalogue holds for one season: the Meetings and the Sessions of that year, counted.
# Both collections are reported even when a count is zero — a missing line would read as a
# collection that has not been written yet, which is the failure this is watched for.
f1_catalogue_records() {
  f1_mongo_eval "
    const year = $1;
    for (const name of ['meetings', 'sessions']) {
      print([name, db[name].countDocuments({ year: year })].join('\t'));
    }
  "
}

# One line per collection holding the Session: name, records for this Session, and the bytes the
# whole collection occupies on disk. The second and third numbers only describe the same thing
# while the stores hold one Session, which is why they are reported side by side rather than
# summed into a single figure. What the catalogue holds is not counted here — that is the
# Session's name, and this is what it recorded.
f1_session_records() {
  f1_mongo_eval "
    const sessionKey = $1;
    for (const name of $F1_SESSION_COLLECTIONS.sort()) {
      const records = db[name].countDocuments({ session_key: sessionKey });
      if (records === 0) continue;
      const stats = db[name].aggregate([{ \$collStats: { storageStats: {} } }]).next();
      print([name, records, stats.storageStats.storageSize].join('\t'));
    }
  "
}
