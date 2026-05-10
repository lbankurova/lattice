#!/bin/bash
# Tests for lock script ownership semantics (CRITICAL-2 from 2026-05-04 audit).
#
# Usage: bash scripts/tests/test-lock-ownership.sh
# Exit: 0 = all pass; non-zero = test count failed.

set -uo pipefail

LATTICE_REAL=$(cd "$(dirname "$0")/../.." && pwd)
ORIG_PWD=$(pwd)

# D1 worktree-isolation: tests run lock scripts inside per-case temp repos.
# Unset LATTICE_PROJECT_ROOT so the SUTs don't redirect their writes to a
# parent session's canonical .lattice/ when tests run from a session
# worktree.
unset LATTICE_PROJECT_ROOT

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

# ── PID-liveness tests (C1, 2026-05-05) ──────────────────────
# These exercise the new check_stale() PID branch. STALE_THRESHOLD is
# still 1800s/3600s, but a dead PID must force-clear immediately and a
# live PID must hold the lock indefinitely (never clock-clear).

echo "[topic-lock] PID liveness"
# Dead-PID scenario: synthesize a lock dir with a guaranteed-dead PID.
# 99999999 is well above any plausible /proc max_pid and is "not running"
# under both POSIX and Windows tasklist.
mkdir -p .lattice/cycle-lock/staleA
cat > .lattice/cycle-lock/staleA/meta <<'METAEOF'
holder: dead-agent
acquired: 2020-01-01T00:00:00Z
pid: 99999999
METAEOF
bash "$LATTICE_REAL/scripts/acquire-topic-lock.sh" staleA agent-X >/dev/null 2>&1
check "  dead-pid lock force-cleared on acquire" grep -q "^holder: agent-X" .lattice/cycle-lock/staleA/meta
bash "$LATTICE_REAL/scripts/release-topic-lock.sh" staleA agent-X >/dev/null 2>&1

# Live-PID scenario: write meta with our own PID ($$) -- guaranteed alive
# while this test runs. A different agent's acquire must fail (lock held
# by live process; never reaches stale path; check_reentrant excludes
# different holders).
mkdir -p .lattice/cycle-lock/liveA
cat > .lattice/cycle-lock/liveA/meta <<METAEOF
holder: live-agent
acquired: 2020-01-01T00:00:00Z
pid: $$
METAEOF
bash "$LATTICE_REAL/scripts/acquire-topic-lock.sh" liveA agent-Y >/dev/null 2>&1
rc=$?
check "  live-pid lock NOT force-cleared (different acquirer fails)" test "$rc" -ne 0
check "  live-pid meta unchanged after failed acquire" grep -q "^holder: live-agent" .lattice/cycle-lock/liveA/meta
rm -rf .lattice/cycle-lock/liveA

echo "[commit-lock] PID liveness"
mkdir -p .lattice/commit.lock
cat > .lattice/commit.lock/meta <<'METAEOF'
holder: dead-agent
acquired: 2020-01-01T00:00:00Z
pid: 99999999
METAEOF
bash "$LATTICE_REAL/scripts/acquire-lock.sh" agent-X >/dev/null 2>&1
check "  dead-pid commit-lock force-cleared on acquire" grep -q "^holder: agent-X" .lattice/commit.lock/meta
bash "$LATTICE_REAL/scripts/release-lock.sh" agent-X >/dev/null 2>&1

mkdir -p .lattice/commit.lock
cat > .lattice/commit.lock/meta <<METAEOF
holder: live-agent
acquired: 2020-01-01T00:00:00Z
pid: $$
METAEOF
bash "$LATTICE_REAL/scripts/acquire-lock.sh" agent-Y >/dev/null 2>&1
rc=$?
check "  live-pid commit-lock NOT force-cleared (acquire fails)" test "$rc" -ne 0
check "  live-pid commit-lock meta unchanged" grep -q "^holder: live-agent" .lattice/commit.lock/meta
rm -rf .lattice/commit.lock

cd "$ORIG_PWD"
echo
echo "Tests: $ok passed, $fail failed"
exit $fail
