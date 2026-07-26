# shellcheck shell=bash
# The vocabulary every test file speaks. Sourced, never executed.
#
# Deliberately dependency-free: a test that needs a package installed before it can say whether
# `bin/up` places its data correctly is a test that will not be run.

f1_assert_failures=0

f1_assert_pass() {
  printf '  ok   %s\n' "$1"
}

f1_assert_fail() {
  printf '  FAIL %s\n' "$1"
  printf '%s\n' "$2" | sed 's/^/       /'
  f1_assert_failures=$((f1_assert_failures + 1))
}

assert_equals() {
  local description="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    f1_assert_pass "$description"
  else
    f1_assert_fail "$description" "expected: $expected
actual:   $actual"
  fi
}

assert_contains() {
  local description="$1" needle="$2" haystack="$3"
  case "$haystack" in
    *"$needle"*) f1_assert_pass "$description" ;;
    *) f1_assert_fail "$description" "expected to contain: $needle
in:                  $haystack" ;;
  esac
}

assert_at_most() {
  local description="$1" limit="$2" actual="$3"
  if [ "$actual" -le "$limit" ] 2>/dev/null; then
    f1_assert_pass "$description"
  else
    f1_assert_fail "$description" "expected: at most $limit
actual:   $actual"
  fi
}

assert_fails() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    f1_assert_fail "$description" "expected a non-zero exit from: $*"
  else
    f1_assert_pass "$description"
  fi
}

finish() {
  [ "$f1_assert_failures" -eq 0 ] || exit 1
}
