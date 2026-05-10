#!/bin/bash
# test-lock-concurrency.sh -- C2 (no-metadata grace period) validation.
#
# Spawn 10 concurrent acquire-lock.sh processes against a clean state.
# Expectation: exactly one wins (exit 0), nine fail with "LOCK HELD"
# (no --poll), and decisions.log records ZERO force-clears for the
# losers (the pre-C2 behaviour would log a no-metadata force-clear
# when the racer's mkdir-then-write_meta window leaked).
#
# Usage: bash scripts/tests/test-lock-concurrency.sh
# Exit:  0 = pass; non-zero = test count failed.

set -uo pipefail

LATTICE_REAL=$(cd "$(dirname "$0")/../.." && pwd)
ORIG_PWD=$(pwd)

# D1 worktree-isolation: SUTs (acquire-lock.sh, release-lock.sh) honor
# LATTICE_PROJECT_ROOT and would write to canonical's .lattice/ if this env
# var leaked from a parent session. Unset for test isolation.
unset LATTICE_PROJECT_ROOT

cd "$(mktemp -d)"
mkdir -p .lattice

ok=0; fail=0
check() {
    local desc="$1"; shift
    if "$@" >/dev/null 2>&1; then echo "  PASS  $desc"; ok=$((ok+1));
    else echo "  FAIL  $desc"; fail=$((fail+1));
    fi
}

# ── 10-way concurrent acquire (commit-lock) ────────────────────────────
echo "[commit-lock] 10-way concurrent acquire"

# Pre-C2 the no-metadata-instant-clear race fired with very low probability
# under non-adversarial concurrency, so we cannot reliably reproduce the bad
# behaviour from a black-box harness. The spec validation is structural:
# (a) only one process exits 0, (b) decisions.log records no force-clear
# rows. The grace-period change cannot regress (a) and the reason-tag check
# in (b) catches any future change that re-introduces force-clears under
# the no-metadata path.

results_dir=$(mktemp -d)
for i in 1 2 3 4 5 6 7 8 9 10; do
    (bash "$LATTICE_REAL/scripts/acquire-lock.sh" "agent-$i" > "$results_dir/$i.out" 2>&1; \
     echo "$?" > "$results_dir/$i.rc") &
done
wait

# Count successes (exit 0)
successes=0
for i in 1 2 3 4 5 6 7 8 9 10; do
    rc=$(cat "$results_dir/$i.rc")
    if [ "$rc" = "0" ]; then
        successes=$((successes + 1))
    fi
done

check "  exactly one acquirer wins (got: $successes)" test "$successes" -eq 1
# Force-clears are LOGGED to decisions.log with reason= field. Under C2 a
# legitimate racer never triggers force-clear during this scenario.
NO_META_CLEARS=0
if [ -f .lattice/decisions.log ]; then
    NO_META_CLEARS=$(grep -c "reason=no-metadata" .lattice/decisions.log 2>/dev/null || echo 0)
fi
check "  no force-clear logged for losers (no-metadata count: $NO_META_CLEARS)" test "$NO_META_CLEARS" -eq 0

# Cleanup
rm -rf "$results_dir"
rm -rf .lattice/commit.lock

# ── Synthetic no-metadata-recovers case ────────────────────────────────
# The grace-period code path: lock dir exists, meta missing, but a racer
# writes meta within 2s. check_stale must NOT clear (return 1).
echo "[commit-lock] no-metadata grace recovers"
mkdir -p .lattice/commit.lock
# Schedule a meta-file write in the background after a short delay.
(
    sleep 1
    cat > .lattice/commit.lock/meta <<METAEOF
holder: late-writer
acquired: $(date -Iseconds)
pid: $$
METAEOF
) &
META_WRITER_PID=$!
# acquire-lock.sh will see the missing meta, sleep 2, find meta written,
# treat the lock as held. With --poll=false this exits 1.
acquire_out=$(bash "$LATTICE_REAL/scripts/acquire-lock.sh" agent-late 2>&1)
rc=$?
wait "$META_WRITER_PID" 2>/dev/null || true
check "  late meta-writer wins (acquire fails)" test "$rc" -ne 0
check "  no force-clear in decisions.log this round" bash -c '! grep -q "reason=no-metadata" .lattice/decisions.log 2>/dev/null'

cd "$ORIG_PWD"
echo
echo "Tests: $ok passed, $fail failed"
exit "$fail"
