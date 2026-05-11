#!/bin/bash
# test-find-bundled-cycle.sh -- regression suite for the bundled-cycle dedup
# scanner. Covers the three structured-match patterns the script supports
# (whole-item, colon-prefix, id-field) plus the no-match and self-match cases.
#
# Usage: bash scripts/tests/test-find-bundled-cycle.sh
# Exit:  0 = pass; non-zero = test count failed.

set -uo pipefail

LATTICE_REAL=$(cd "$(dirname "$0")/../.." && pwd)
SCRIPT="$LATTICE_REAL/scripts/find-bundled-cycle.sh"

unset LATTICE_PROJECT_ROOT

TMP=$(mktemp -d)
mkdir -p "$TMP/.lattice/cycle-state"
export LATTICE_PROJECT_ROOT="$TMP"

ok=0; fail=0
check() {
    local desc="$1"; shift
    if "$@"; then echo "  PASS  $desc"; ok=$((ok+1));
    else echo "  FAIL  $desc"; fail=$((fail+1));
    fi
}

# Fixture 1: top-level scope array (legacy pattern).
cat > "$TMP/.lattice/cycle-state/parent-A.yaml" <<'EOF'
topic: parent-A
phase: complete
scope:
  - CHILD-A1  # comment
  - CHILD-A2
  - "CHILD-A3"
other:
  - irrelevant
EOF

# Fixture 2: known_gap_anchors with "ID: description" entries.
cat > "$TMP/.lattice/cycle-state/parent-B.yaml" <<'EOF'
topic: parent-B
phase: blueprint-complete
known_gap_anchors:
  - "DATA-GAP-B1: registry seed"
  - "DATA-GAP-B2: fixture set"
EOF

# Fixture 3: nested todo_verified.entries (today's failure case).
cat > "$TMP/.lattice/cycle-state/parent-C.yaml" <<'EOF'
topic: parent-C
phase: complete
review:
  todo_verified:
    entries:
      - "DATA-GAP-C1: Phase 0 implements"
      - "DATA-GAP-C2: Phase 1 implements"
EOF

# Fixture 4: bundled_bugs mapping list (id-field pattern).
cat > "$TMP/.lattice/cycle-state/parent-D.yaml" <<'EOF'
topic: parent-D
phase: complete
bundled_bugs:
  - id: BUG-001
    file: x.tsx
    fix: swap
  - id: BUG-002
    file: y.tsx
EOF

# Fixture 5: free-text mention only (should NOT match).
cat > "$TMP/.lattice/cycle-state/parent-E.yaml" <<'EOF'
topic: parent-E
phase: complete
review:
  todo: "All gaps in TODO.md (DATA-GAP-FREE-TEXT + ...)"
  source: DATA-GAP-FREE-TEXT
EOF

echo "[find-bundled-cycle] structured-match scanner"

# Test 1: scope: array, bare ID.
check "scope: bare-ID match returns parent-A" \
    bash -c "out=\$(bash '$SCRIPT' CHILD-A1) && [ \"\$out\" = 'parent-A	complete	$TMP/.lattice/cycle-state/parent-A.yaml' ]"

# Test 2: scope: array, quoted ID.
check "scope: quoted-ID match returns parent-A" \
    bash -c "out=\$(bash '$SCRIPT' CHILD-A3) && [ \"\$out\" = 'parent-A	complete	$TMP/.lattice/cycle-state/parent-A.yaml' ]"

# Test 3: known_gap_anchors, colon-prefix.
check "known_gap_anchors colon-prefix match returns parent-B" \
    bash -c "out=\$(bash '$SCRIPT' DATA-GAP-B1) && [ \"\$out\" = 'parent-B	blueprint-complete	$TMP/.lattice/cycle-state/parent-B.yaml' ]"

# Test 4: nested todo_verified.entries, colon-prefix (DATA-GAP-VEH-5-CITATION-HYGIENE class).
check "nested entries[] colon-prefix match returns parent-C" \
    bash -c "out=\$(bash '$SCRIPT' DATA-GAP-C1) && [ \"\$out\" = 'parent-C	complete	$TMP/.lattice/cycle-state/parent-C.yaml' ]"

# Test 5: bundled_bugs, id-field.
check "bundled_bugs id-field match returns parent-D" \
    bash -c "out=\$(bash '$SCRIPT' BUG-001) && [ \"\$out\" = 'parent-D	complete	$TMP/.lattice/cycle-state/parent-D.yaml' ]"

# Test 6: free-text mention should NOT match (false-positive guard).
check "free-text mention does NOT match" \
    bash -c "bash '$SCRIPT' DATA-GAP-FREE-TEXT; [ \$? -eq 1 ]"

# Test 7: no match returns exit 1.
check "non-existent topic returns exit 1" \
    bash -c "bash '$SCRIPT' COMPLETELY-UNRELATED; [ \$? -eq 1 ]"

# Test 8: self-match (a yaml file named after the topic) is skipped.
cat > "$TMP/.lattice/cycle-state/CHILD-A1.yaml" <<'EOF'
topic: CHILD-A1
phase: research
scope:
  - CHILD-A1  # would self-match but we skip own file
EOF
# CHILD-A1 still bundled by parent-A — should match parent-A only.
check "self-match skipped; parent still matches" \
    bash -c "out=\$(bash '$SCRIPT' CHILD-A1) && [ \"\$out\" = 'parent-A	complete	$TMP/.lattice/cycle-state/parent-A.yaml' ]"

# Test 9: comment-only line that mentions the ID does NOT match.
cat > "$TMP/.lattice/cycle-state/parent-F.yaml" <<'EOF'
topic: parent-F
phase: complete
# DATA-GAP-COMMENT-ONLY: mentioned only in a comment
scope:
  - SOMETHING-ELSE
EOF
check "comment-only mention does NOT match" \
    bash -c "bash '$SCRIPT' DATA-GAP-COMMENT-ONLY; [ \$? -eq 1 ]"

# Test 10: multi-bundle (the same ID listed in two different parents).
cat > "$TMP/.lattice/cycle-state/parent-G.yaml" <<'EOF'
topic: parent-G
phase: complete
scope:
  - CHILD-MULTI
EOF
cat > "$TMP/.lattice/cycle-state/parent-H.yaml" <<'EOF'
topic: parent-H
phase: research
scope:
  - CHILD-MULTI
EOF
check "multi-bundle emits one line per match" \
    bash -c "out=\$(bash '$SCRIPT' CHILD-MULTI) && lines=\$(echo \"\$out\" | wc -l) && [ \"\$lines\" = '2' ]"

echo
echo "Results: $ok passed, $fail failed"
rm -rf "$TMP"
[ $fail -eq 0 ]
