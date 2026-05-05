#!/bin/bash
# test-install-hooks.sh -- C5 validation: install-hooks.sh refuses to write
# into .git/hooks when core.hooksPath is overridden.
#
# Two cases:
#   (a) core.hooksPath unset -> install succeeds.
#   (b) core.hooksPath set to a different path -> install errors out
#       with non-zero exit.
#
# Usage: bash scripts/tests/test-install-hooks.sh
# Exit:  0 = pass, non-zero = fail count.

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

# (a) No override -> install succeeds.
echo "[install-hooks] no override path"
TMP1=$(mktemp -d)
cd "$TMP1"
git init -q
git config user.email test@test
git config user.name test
mkdir -p hooks
cp "$LATTICE_REAL/hooks/pre-commit" hooks/
bash "$LATTICE_REAL/scripts/install-hooks.sh" . > /dev/null 2>&1
rc=$?
check "  exit 0 with no core.hooksPath set" test "$rc" -eq 0
check "  pre-commit deployed to .git/hooks/" test -f .git/hooks/pre-commit
cd "$ORIG_PWD"; rm -rf "$TMP1"

# (b) Override -> install refuses.
echo "[install-hooks] core.hooksPath override"
TMP2=$(mktemp -d)
cd "$TMP2"
git init -q
git config user.email test@test
git config user.name test
git config core.hooksPath /tmp/test-hooks-override
mkdir -p hooks
cp "$LATTICE_REAL/hooks/pre-commit" hooks/
out=$(bash "$LATTICE_REAL/scripts/install-hooks.sh" . 2>&1)
rc=$?
check "  exit non-zero with core.hooksPath override" test "$rc" -ne 0
check "  error message names the override" bash -c "echo \"\$1\" | grep -q 'core.hooksPath is set'" _ "$out"
check "  error message tells user how to fix" bash -c "echo \"\$1\" | grep -q 'config --unset core.hooksPath'" _ "$out"
check "  no pre-commit deployed to .git/hooks/" test ! -f .git/hooks/pre-commit
cd "$ORIG_PWD"; rm -rf "$TMP2"

echo
echo "Tests: $ok passed, $fail failed"
exit "$fail"
