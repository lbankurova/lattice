#!/bin/bash
# test-shared-state-merge.sh -- C3 validation: pre-commit Step 0a invokes
# scripts/merge-shared-state.sh.
#
# C3's scope is wiring, not merge-logic correctness. This test verifies:
#   (a) pre-commit calls merge-shared-state.sh when present;
#   (b) pre-commit soft-fails (warning, no abort) when the script is absent;
#   (c) the script runs without aborting under the simple "no concurrent
#       changes" path.
#
# The script's 3-way merge has a separate, known limitation for the
# concurrent-append case (it uses current HEAD as both base and remote,
# so deltas from B against pre-A HEAD are lost). That is pre-existing
# tech debt and out of scope for C3 (the wiring task). Tracked as a
# follow-up note in the C3 commit body.
#
# Usage: bash scripts/tests/test-shared-state-merge.sh
# Exit:  0 = pass, 1 = fail.

set -uo pipefail

LATTICE_REAL=$(cd "$(dirname "$0")/../.." && pwd)
ORIG_PWD=$(pwd)

ok=0; fail=0
check() {
    local desc="$1"; shift
    if "$@" >/dev/null 2>&1; then echo "  PASS  $desc"; ok=$((ok+1));
    else echo "  FAIL  $desc"; fail=$((fail+1));
    fi
}

# ── (a) Step 0a invokes merge-shared-state when present ───────────
echo "[wiring] pre-commit Step 0a invocation"
TMP1=$(mktemp -d)
cd "$TMP1"
git init -q
git config user.email test@test
git config user.name test
git config core.autocrlf false
mkdir -p scripts hooks .lattice
cp "$LATTICE_REAL/scripts/merge-shared-state.sh" scripts/
cp "$LATTICE_REAL/scripts/acquire-lock.sh" scripts/
cp "$LATTICE_REAL/scripts/release-lock.sh" scripts/
cp "$LATTICE_REAL/scripts/write-review-gate.sh" scripts/
cp "$LATTICE_REAL/hooks/pre-commit" hooks/
chmod +x scripts/*.sh hooks/pre-commit
echo "x" > README.md
git add . && git commit -q -m "init"

# Run pre-commit; collect output
HOOK_OUT=$(bash hooks/pre-commit 2>&1 || true)
echo "$HOOK_OUT" | grep -q "Step 0a: Shared-state merge"
check "  pre-commit prints Step 0a header" test "$?" -eq 0
echo "$HOOK_OUT" | grep -q "SHARED STATE MERGE:"
check "  merge-shared-state.sh ran (output captured)" test "$?" -eq 0
cd "$ORIG_PWD"; rm -rf "$TMP1"

# ── (b) Soft-fail when merge-shared-state.sh is absent ─────────────
echo "[wiring] soft-fail on missing script"
TMP2=$(mktemp -d)
cd "$TMP2"
git init -q
git config user.email test@test
git config user.name test
git config core.autocrlf false
mkdir -p scripts hooks .lattice
# Deliberately NOT copying merge-shared-state.sh.
cp "$LATTICE_REAL/scripts/acquire-lock.sh" scripts/
cp "$LATTICE_REAL/scripts/release-lock.sh" scripts/
cp "$LATTICE_REAL/scripts/write-review-gate.sh" scripts/
cp "$LATTICE_REAL/hooks/pre-commit" hooks/
chmod +x scripts/*.sh hooks/pre-commit
echo "x" > README.md
git add . && git commit -q -m "init"

HOOK_OUT=$(bash hooks/pre-commit 2>&1 || true)
echo "$HOOK_OUT" | grep -q "Step 0a: Shared-state merge (SKIPPED"
check "  pre-commit prints SKIPPED notice when script absent" test "$?" -eq 0
# It must not have aborted at Step 0a (subsequent steps must have run).
# We use Step 0 (review gate) message as a downstream marker.
echo "$HOOK_OUT" | grep -qE "(COMMIT BLOCKED: No review gate found|Review gate: PASS)"
check "  pre-commit continued past Step 0a (downstream Step 0 reached)" test "$?" -eq 0
cd "$ORIG_PWD"; rm -rf "$TMP2"

echo
echo "Tests: $ok passed, $fail failed"
exit "$fail"
