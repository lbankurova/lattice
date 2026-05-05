#!/bin/bash
# test-bug-retro-pattern.sh -- C7 validation: pre-commit's bug-retro grep
# tolerates several common markdown shapes for the 5 retro fields.
#
# This exercises the regex in isolation (extracted into the local helper
# so we don't have to spin up a full pre-commit + commit msg pipeline).
# The pattern is: any of `**N.**`, `**N)**`, `N.`, `N)`, `###`, `####`
# followed by whitespace and the keyword. Keywords are matched
# case-insensitively.
#
# 6 cases per spec: 3 valid format variants + 3 truly-missing.
#
# Usage: bash scripts/tests/test-bug-retro-pattern.sh
# Exit:  0 = pass, non-zero = fail count.

set -uo pipefail

PREFIX_RE='(^|\n)[[:space:]]*(\*\*[0-9]+[.)]\*\*|[0-9]+[.)]|####?)[[:space:]]+'

ok=0; fail=0
check() {
    local desc="$1" expected_rc="$2" actual_rc="$3"
    if [ "$expected_rc" = "$actual_rc" ]; then
        echo "  PASS  $desc"
        ok=$((ok+1))
    else
        echo "  FAIL  $desc (expected rc=$expected_rc, got rc=$actual_rc)"
        fail=$((fail+1))
    fi
}

# Validate that an entry contains all 5 fields under the C7 pattern.
# Returns 0 if all 5 found, 1 otherwise.
validate_entry() {
    local entry="$1"
    local field_re
    for keyword in "[Rr]oot cause" "[Gg]enesis" "[Dd]etection gap" \
                   "[Pp]revention class" "[Ll]attice change"; do
        field_re="${PREFIX_RE}.*${keyword}"
        if ! printf '%s' "$entry" | grep -qE "$field_re"; then
            return 1
        fi
    done
    return 0
}

# ── Valid format variants (must match) ─────────────────────────
echo "[c7] valid format variants"

# Variant A: `1. **Root cause`...`5. **Lattice change` (the legacy style)
ENTRY_A='### BUG-001 example
1. **Root cause:** wrong cast.
2. **Genesis:** typo in PR #12.
3. **Detection gap:** unit test was disabled.
4. **Prevention class:** type-check linter.
5. **Lattice change:** add lint rule R-19.'
validate_entry "$ENTRY_A"
check "variant A: legacy 1. **Field** style" 0 "$?"

# Variant B: `**1.** Root cause` ... `**5.** Lattice change`
ENTRY_B='### BUG-002 example
**1.** Root cause: thing broke.
**2.** Genesis: refactor merged Friday.
**3.** Detection gap: review missed it.
**4.** Prevention class: integration test.
**5.** Lattice change: add CI gate G-7.'
validate_entry "$ENTRY_B"
check "variant B: **N.** Field style" 0 "$?"

# Variant C: `### Root cause` (markdown subheading, no number)
ENTRY_C='### BUG-003 example

### Root cause
The lookup table was off-by-one.

### Genesis
Migrated from old config without a sanity test.

### Detection gap
The integration test was skipped on Windows.

### Prevention class
Cross-platform CI matrix.

### Lattice change
Add hook H-12 to enforce skip-list audit.'
validate_entry "$ENTRY_C"
check "variant C: ### Field heading style" 0 "$?"

# Bonus variant: `1) Root cause` style (no period, parenthesis)
ENTRY_D='### BUG-004 example
1) Root cause: deadlock.
2) Genesis: lock acquired in wrong order.
3) Detection gap: stress test capped at 4 threads.
4) Prevention class: thread-sanitizer in CI.
5) Lattice change: add scripts/test-lock-concurrency.sh.'
validate_entry "$ENTRY_D"
check "variant D: N) Field paren style" 0 "$?"

# ── Truly-missing cases (must NOT match) ──────────────────────
echo "[c7] truly-missing cases"

# Missing case 1: empty entry.
ENTRY_M1='### BUG-005 example
(no retro yet)'
validate_entry "$ENTRY_M1"
check "missing 1: empty body" 1 "$?"

# Missing case 2: only 3 of 5 fields present.
ENTRY_M2='### BUG-006 example
1. **Root cause:** xyz.
2. **Genesis:** abc.
3. **Detection gap:** def.
(no prevention class or lattice change)'
validate_entry "$ENTRY_M2"
check "missing 2: only 3 of 5 fields" 1 "$?"

# Missing case 3: keywords appear but without any list/heading prefix.
# Per the spec the prefix is part of the substance ("did the author
# answer the 5 numbered questions?"). A free-prose mention does not count.
ENTRY_M3='### BUG-007 example
The root cause was a typo. The genesis is unclear.
We had a detection gap. The prevention class is unknown.
A lattice change might help.'
validate_entry "$ENTRY_M3"
check "missing 3: prose-only (no prefix)" 1 "$?"

echo
echo "Tests: $ok passed, $fail failed"
exit "$fail"
