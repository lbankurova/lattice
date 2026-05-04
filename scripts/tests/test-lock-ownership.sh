#!/bin/bash
# Tests for lock script ownership semantics (CRITICAL-2 from 2026-05-04 audit).
#
# Usage: bash scripts/tests/test-lock-ownership.sh
# Exit: 0 = all pass; non-zero = test count failed.

set -uo pipefail

LATTICE_REAL=$(cd "$(dirname "$0")/../.." && pwd)
ORIG_PWD=$(pwd)

cd "$(mktemp -d)"
mkdir -p .lattice/cycle-lock

ok=0; fail=0
check() {
    local desc="$1"; shift
    if "$@" >/dev/null 2>&1; then echo "  PASS  $desc"; ok=$((ok+1));
    else echo "  FAIL  $desc"; fail=$((fail+1));
    fi
}

# ── topic-lock ownership tests ───────────────────────────────

echo "[topic-lock] ownership check"
bash "$LATTICE_REAL/scripts/acquire-topic-lock.sh" foo agent-A >/dev/null
check "  acquire-A creates lock dir" test -d .lattice/cycle-lock/foo
check "  meta records agent-A" grep -q "^holder: agent-A" .lattice/cycle-lock/foo/meta

# Different holder tries to release -- should be REFUSED.
bash "$LATTICE_REAL/scripts/release-topic-lock.sh" foo agent-B >/dev/null 2>&1
check "  agent-B release refused (lock still held)" test -d .lattice/cycle-lock/foo

# --force succeeds and logs.
bash "$LATTICE_REAL/scripts/release-topic-lock.sh" foo agent-B --force >/dev/null
check "  --force succeeds" test ! -d .lattice/cycle-lock/foo
check "  decisions.log has FORCED row" grep -q "FORCED.*foo.*forced_by=agent-B" .lattice/decisions.log

# Correct-holder release.
bash "$LATTICE_REAL/scripts/acquire-topic-lock.sh" foo agent-A >/dev/null
bash "$LATTICE_REAL/scripts/release-topic-lock.sh" foo agent-A >/dev/null
check "  correct-holder release succeeds" test ! -d .lattice/cycle-lock/foo

# Legacy mode (no holder) -- proceeds with warning.
bash "$LATTICE_REAL/scripts/acquire-topic-lock.sh" foo agent-A >/dev/null
output=$(bash "$LATTICE_REAL/scripts/release-topic-lock.sh" foo 2>&1)
check "  legacy mode warns" echo "$output" | grep -q "WARNING.*legacy mode"
check "  legacy mode releases" test ! -d .lattice/cycle-lock/foo

# Env-var holder.
bash "$LATTICE_REAL/scripts/acquire-topic-lock.sh" foo agent-A >/dev/null
LATTICE_LOCK_HOLDER=agent-Z bash "$LATTICE_REAL/scripts/release-topic-lock.sh" foo >/dev/null 2>&1
check "  env-var mismatch refused" test -d .lattice/cycle-lock/foo
LATTICE_LOCK_HOLDER=agent-A bash "$LATTICE_REAL/scripts/release-topic-lock.sh" foo >/dev/null
check "  env-var match succeeds" test ! -d .lattice/cycle-lock/foo

# ── commit-lock ownership tests ──────────────────────────────

echo "[commit-lock] ownership check"
bash "$LATTICE_REAL/scripts/acquire-lock.sh" agent-A >/dev/null
check "  acquire-A creates commit lock" test -d .lattice/commit.lock

bash "$LATTICE_REAL/scripts/release-lock.sh" agent-B >/dev/null 2>&1
check "  agent-B release refused" test -d .lattice/commit.lock

bash "$LATTICE_REAL/scripts/release-lock.sh" agent-B --force >/dev/null
check "  --force succeeds" test ! -d .lattice/commit.lock
check "  commit-lock decisions.log row" grep -q "FORCED.*commit-lock.*forced_by=agent-B" .lattice/decisions.log

bash "$LATTICE_REAL/scripts/acquire-lock.sh" agent-A >/dev/null
bash "$LATTICE_REAL/scripts/release-lock.sh" agent-A >/dev/null
check "  correct-holder release succeeds" test ! -d .lattice/commit.lock

cd "$ORIG_PWD"
echo
echo "Tests: $ok passed, $fail failed"
exit $fail
