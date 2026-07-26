# shellcheck shell=bash
# The stores, addressed from the host. Sourced; requires placement.sh.
#
# Every call goes out through bin/compose, so placement is inherited rather than restated
# (ADR-0004), and `mongosh` is the one in the running container rather than one the host has to
# have installed.

# Upstream's default, and upstream owns it: OPENF1_DB_NAME is left unset in deploy/compose.yaml.
F1_MONGO_DATABASE="openf1-livetiming"

f1_mongo_eval() {
  "$F1_REPO_ROOT/bin/compose" exec --no-TTY mongo \
    mongosh --quiet --eval "$1" "$F1_MONGO_DATABASE"
}

f1_require_stores() {
  local running
  running="$("$F1_REPO_ROOT/bin/compose" ps --services --status running 2>/dev/null)"
  case "$running" in
    *mongo*) return 0 ;;
  esac

  printf 'The stores are not running. Bring the stack up with bin/up.\n' >&2
  return 1
}

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

# Everything the named Session put in the stores, gone. Scoped by session_key, which every
# document a Session produces carries, so a second Session in the same collections is untouched.
f1_discard_session() {
  f1_mongo_eval "
    const sessionKey = $1;
    let discarded = 0;
    for (const name of db.getCollectionNames()) {
      discarded += db[name].deleteMany({ session_key: sessionKey }).deletedCount;
    }
    print(discarded);
  "
}

# One line per collection holding the Session: name, records for this Session, and the bytes the
# whole collection occupies on disk. The second and third numbers only describe the same thing
# while the stores hold one Session, which is why they are reported side by side rather than
# summed into a single figure.
f1_session_records() {
  f1_mongo_eval "
    const sessionKey = $1;
    for (const name of db.getCollectionNames().sort()) {
      const records = db[name].countDocuments({ session_key: sessionKey });
      if (records === 0) continue;
      const stats = db[name].aggregate([{ \$collStats: { storageStats: {} } }]).next();
      print([name, records, stats.storageStats.storageSize].join('\t'));
    }
  "
}
