#!/bin/bash
# test-validation-ratchet.sh -- C6 validation: validation-ratchet.sh no longer
# silently advances baseline on improvement. Three cases:
#
#   (a) Compare with no change      -> exit 0, baseline file untouched.
#   (b) Compare with improvement,
#       no confirmation env var     -> exit 3, BASELINE-ADVANCE-PROPOSED in
#                                       output + decisions.log; baseline
#                                       file untouched.
#   (c) Compare with improvement,
#       LATTICE_RATCHET_CONFIRM_ADVANCE=1
#                                   -> exit 0, BASELINE-ADVANCED in
#                                       decisions.log; baseline file rewritten.
#
# Usage: bash scripts/tests/test-validation-ratchet.sh
# Exit:  0 = pass, non-zero = fail count.

set -uo pipefail

# validation-ratchet.sh uses `grep -oP` which requires a UTF-8 / single-byte
# locale; on git-bash with empty LANG it errors out. Set both LANG and
# LC_ALL so the tests survive a pristine shell.
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

# validation-ratchet.sh hard-requires jq (used to parse the baseline JSON).
# That dependency is preexisting; this test exits 0 with a SKIP notice when
# jq is absent so the suite remains green on dev workstations that have not
# installed jq locally. CI environments that exercise validation-ratchet.sh
# already install jq.
if ! command -v jq >/dev/null 2>&1; then
    echo "[ratchet] SKIPPED: jq not installed (validation-ratchet.sh prerequisite)"
    echo "Tests: 0 passed, 0 failed (skipped)"
    exit 0
fi

LATTICE_REAL=$(cd "$(dirname "$0")/../.." && pwd)
ORIG_PWD=$(pwd)

ok=0; fail=0
check() {
    local desc="$1"; shift
    if "$@" >/dev/null 2>&1; then echo "  PASS  $desc"; ok=$((ok+1));
    else echo "  FAIL  $desc"; fail=$((fail+1));
    fi
}

# Build a synthetic summary.md in the expected shape. The ratchet's parser
# expects "**Totals:** N/N signals, N/N design, N/N assertions" + a
# "commit `<hash>`" mention + a markdown table.
make_summary() {
    local signals_h="$1" signals_t="$2"
    local design_h="$3" design_t="$4"
    local assert_h="$5" assert_t="$6"
    local commit="$7"
    cat <<EOF
# Validation Summary

Generated from commit \`$commit\`.

**Totals:** $signals_h/$signals_t signals detected, $design_h/$design_t design matched, $assert_h/$assert_t assertions passed

| Study | Signals | Design | Assertions | Notes | Etc |
|-------|---------|--------|------------|-------|-----|
| StudyA | $signals_h/$signals_t | $design_h/$design_t | $assert_h/$assert_t | -- | -- |
EOF
}

# (a) No change.
echo "[ratchet] no change (exit 0)"
TMP1=$(mktemp -d)
cd "$TMP1"
mkdir -p docs/validation .lattice scripts
cp "$LATTICE_REAL/scripts/validation-ratchet.sh" scripts/
make_summary 48 49 81 82 29 29 abc1234 > docs/validation/summary.md
bash scripts/validation-ratchet.sh baseline > /dev/null 2>&1
sha_before=$(sha256sum .lattice/validation-baseline.json | awk '{print $1}')
make_summary 48 49 81 82 29 29 def5678 > docs/validation/summary.md
bash scripts/validation-ratchet.sh compare > /dev/null 2>&1
rc=$?
sha_after=$(sha256sum .lattice/validation-baseline.json | awk '{print $1}')
check "  exit 0 on no change" test "$rc" -eq 0
check "  baseline file unchanged on no change" test "$sha_before" = "$sha_after"
cd "$ORIG_PWD"; rm -rf "$TMP1"

# (b) Improvement, no confirm.
echo "[ratchet] improvement without confirm (exit 3, no advance)"
TMP2=$(mktemp -d)
cd "$TMP2"
mkdir -p docs/validation .lattice scripts
cp "$LATTICE_REAL/scripts/validation-ratchet.sh" scripts/
make_summary 48 49 81 82 29 29 abc1234 > docs/validation/summary.md
bash scripts/validation-ratchet.sh baseline > /dev/null 2>&1
sha_before=$(sha256sum .lattice/validation-baseline.json | awk '{print $1}')
# Improvement in signals
make_summary 49 49 81 82 29 29 def5678 > docs/validation/summary.md
out=$(bash scripts/validation-ratchet.sh compare 2>&1)
rc=$?
sha_after=$(sha256sum .lattice/validation-baseline.json | awk '{print $1}')
check "  exit 3 on improvement without confirm" test "$rc" -eq 3
check "  output mentions BASELINE-ADVANCE-PROPOSED" bash -c "echo \"\$1\" | grep -q 'BASELINE-ADVANCE-PROPOSED'" _ "$out"
check "  baseline file UNCHANGED (silent advance prevented)" test "$sha_before" = "$sha_after"
check "  decisions.log records BASELINE-ADVANCE-PROPOSED" grep -q "BASELINE-ADVANCE-PROPOSED" .lattice/decisions.log
cd "$ORIG_PWD"; rm -rf "$TMP2"

# (c) Improvement WITH confirm.
echo "[ratchet] improvement with confirm (exit 0, advance)"
TMP3=$(mktemp -d)
cd "$TMP3"
mkdir -p docs/validation .lattice scripts
cp "$LATTICE_REAL/scripts/validation-ratchet.sh" scripts/
make_summary 48 49 81 82 29 29 abc1234 > docs/validation/summary.md
bash scripts/validation-ratchet.sh baseline > /dev/null 2>&1
sha_before=$(sha256sum .lattice/validation-baseline.json | awk '{print $1}')
make_summary 49 49 81 82 29 29 def5678 > docs/validation/summary.md
out=$(LATTICE_RATCHET_CONFIRM_ADVANCE=1 bash scripts/validation-ratchet.sh compare 2>&1)
rc=$?
sha_after=$(sha256sum .lattice/validation-baseline.json | awk '{print $1}')
check "  exit 0 on improvement with confirm" test "$rc" -eq 0
check "  output mentions BASELINE ADVANCED" bash -c "echo \"\$1\" | grep -q 'Baseline ADVANCED'" _ "$out"
check "  baseline file REWRITTEN (confirmed advance)" test "$sha_before" != "$sha_after"
check "  decisions.log records BASELINE-ADVANCED" grep -q "BASELINE-ADVANCED" .lattice/decisions.log
cd "$ORIG_PWD"; rm -rf "$TMP3"

echo
echo "Tests: $ok passed, $fail failed"
exit "$fail"
