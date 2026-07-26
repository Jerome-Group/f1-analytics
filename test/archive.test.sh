#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Resumability is the whole safety property of the Archive: eleven thousand requests will be
# interrupted, and the run that follows must know exactly what it already has. A Session wrongly
# judged complete is a hole in the Archive that nothing later will notice.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
source "$here/lib/assert.sh"

archive_bin="$here/../bin/archive"
work="$(mktemp -d "${TMPDIR:-/tmp}/archive-test.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# The pure half of the mirror, called directly. Nothing here touches the network.
mirror() {
  python3 -c "
import json, sys
sys.path.insert(0, '$here/../archive')
from mirror import is_complete, plan_session, plan_team_radio
print($1)
" 2>&1
}

# A Session directory holding two files and a manifest that agrees with them.
complete_session="$work/complete"
mkdir -p "$complete_session"
printf 'aaaa' >"$complete_session/TimingData.jsonStream"
printf 'bb' >"$complete_session/LapCount.jsonStream"
cat >"$complete_session/.f1-archive-manifest.json" <<'EOF'
{"complete": true, "files": {"TimingData.jsonStream": 4, "LapCount.jsonStream": 2}}
EOF

assert_equals "a Session whose files match its manifest is complete" \
  "True" "$(mirror "is_complete('$complete_session')")"

# The same manifest, one file never written — an interrupted run.
missing_session="$work/missing"
mkdir -p "$missing_session"
printf 'aaaa' >"$missing_session/TimingData.jsonStream"
cp "$complete_session/.f1-archive-manifest.json" "$missing_session/"

assert_equals "a Session missing a file its manifest lists is not complete" \
  "False" "$(mirror "is_complete('$missing_session')")"

# Present, but short — the connection dropped mid-file. The failure this test exists for: a
# truncated stream is a plausible-looking file that parses into a Session with a hole in it.
truncated_session="$work/truncated"
mkdir -p "$truncated_session"
printf 'aa' >"$truncated_session/TimingData.jsonStream"
printf 'bb' >"$truncated_session/LapCount.jsonStream"
cp "$complete_session/.f1-archive-manifest.json" "$truncated_session/"

assert_equals "a Session with a truncated file is not complete" \
  "False" "$(mirror "is_complete('$truncated_session')")"

# Files on disk but no manifest: an older run that died before writing one, or somebody's copy.
# Unprovable, therefore incomplete.
unmarked_session="$work/unmarked"
mkdir -p "$unmarked_session"
printf 'aaaa' >"$unmarked_session/TimingData.jsonStream"

assert_equals "a Session with no manifest is not complete" \
  "False" "$(mirror "is_complete('$unmarked_session')")"

assert_equals "a Session that was never fetched is not complete" \
  "False" "$(mirror "is_complete('$work/absent')")"

# What a Session's index turns into: every advertised stream, and the team radio the streams
# reference, which lives outside the index entirely.
index='{"Feeds": {"TimingData": {"StreamPath": "TimingData.jsonStream"},
                  "CarData.z": {"StreamPath": "CarData.z.jsonStream"},
                  "SessionInfo": {"KeyFramePath": "SessionInfo.json"}}}'

assert_equals "every advertised feed is planned, whichever kind of path it carries" \
  "['CarData.z.jsonStream', 'SessionInfo.json', 'TimingData.jsonStream']" \
  "$(mirror "sorted(plan_session(json.loads('''$index''')))")"

radio='0:00{"Captures":[{"Path":"TeamRadio/AAA_1.mp3"},{"Path":"TeamRadio/BBB_2.mp3"}]}'

assert_equals "team radio audio is planned from the stream that references it" \
  "['TeamRadio/AAA_1.mp3', 'TeamRadio/BBB_2.mp3']" \
  "$(mirror "sorted(plan_team_radio('''$radio'''))")"

assert_equals "a Session with no team radio plans no audio" \
  "[]" "$(mirror "sorted(plan_team_radio(''))")"

# Usage, answered from the arguments alone — the volume is deliberately absent.
misuse() {
  env F1_RUNTIME_HOME=/Volumes/NotMounted/.runtime "$archive_bin" "$@" 2>&1
}

assert_fails "bin/archive with no arguments" misuse
assert_fails "bin/archive with a year that is not a year" misuse twenty-twenty-five
assert_fails "bin/archive with a Meeting but no Session" misuse 2025 1267

assert_contains "bin/archive with no arguments says what it takes" \
  "bin/archive <year>" \
  "$(misuse)"

finish
