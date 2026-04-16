#!/bin/bash
#
# Write the review gate file -- BUT ONLY AFTER MECHANICAL CHECKS PASS.
#
# Escape hatch for commits that skip the full /lattice:review.
# Runs mechanical checks before writing the gate:
#   1. Frontend build (if frontend/ files staged)
#   2. Frontend tests (if frontend/ files staged)
#   3. Python syntax (if backend/ .py files staged)
#
# If any check fails, the gate file is NOT written and the commit stays blocked.
#
# Usage: bash scripts/write-review-gate.sh [verdict] [summary]
#   verdict: "pass" or "pass-with-deviations" (default: "pass")
#   summary: one-line summary (optional)
#
# The gate file is single-use: the pre-commit hook deletes it after
# a successful commit. This ensures every commit goes through review.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
GATE_FILE="$REPO_ROOT/.lattice/review-gate.json"
GATE_DIR="$REPO_ROOT/.lattice"
FRONTEND_DIR="$REPO_ROOT/frontend"

VERDICT="${1:-pass}"
SUMMARY="${2:-Review passed}"

STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
STAGED_FRONTEND=$(echo "$STAGED_FILES" | grep -c "^frontend/" || true)
STAGED_BACKEND=$(echo "$STAGED_FILES" | grep -c "^backend/.*\.py$" || true)

CHECKS_RUN=0
CHECKS_PASSED=0

echo "========================================"
echo "  Review gate: running mechanical checks"
echo "========================================"
echo ""

# --- Check 1: Frontend build ---
if [ "$STAGED_FRONTEND" -gt 0 ]; then
    CHECKS_RUN=$((CHECKS_RUN + 1))
    echo "--- Check: Frontend build ---"
    if (cd "$FRONTEND_DIR" && npm run build > /dev/null 2>&1); then
        echo "  PASS"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        echo "  FAIL: npm run build failed"
        echo ""
        echo "  Fix build errors before the gate can be written."
        echo "  Run: cd frontend && npm run build"
        exit 1
    fi
fi

# --- Check 2: Frontend tests ---
if [ "$STAGED_FRONTEND" -gt 0 ]; then
    CHECKS_RUN=$((CHECKS_RUN + 1))
    echo "--- Check: Frontend tests ---"
    if (cd "$FRONTEND_DIR" && npm test > /dev/null 2>&1); then
        echo "  PASS"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        echo "  FAIL: npm test failed"
        echo ""
        echo "  Fix failing tests before the gate can be written."
        echo "  Run: cd frontend && npm test"
        exit 1
    fi
fi

# --- Check 3: Python syntax ---
if [ "$STAGED_BACKEND" -gt 0 ]; then
    CHECKS_RUN=$((CHECKS_RUN + 1))
    echo "--- Check: Python syntax ---"
    PY_OK=true
    while IFS= read -r PY_FILE; do
        [ -z "$PY_FILE" ] && continue
        echo "$PY_FILE" | grep -qE "^backend/.*\.py$" || continue
        [ ! -f "$REPO_ROOT/$PY_FILE" ] && continue
        if ! "$REPO_ROOT/backend/venv/Scripts/python.exe" -c "import py_compile; py_compile.compile(r'$REPO_ROOT/$PY_FILE', doraise=True)" > /dev/null 2>&1; then
            echo "  FAIL: Syntax error in $PY_FILE"
            PY_OK=false
        fi
    done <<< "$STAGED_FILES"
    if [ "$PY_OK" = true ]; then
        echo "  PASS"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        echo ""
        echo "  Fix syntax errors before the gate can be written."
        exit 1
    fi
fi

echo ""

# --- All checks passed -- write the gate ---
if [ "$CHECKS_RUN" -eq 0 ]; then
    echo "  No mechanical checks applicable (no code files staged)."
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STAGED_LIST=$(echo "$STAGED_FILES" | tr '\n' ',' | sed 's/,$//')
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "none")

mkdir -p "$GATE_DIR"

cat > "$GATE_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "verdict": "$VERDICT",
  "summary": "$SUMMARY",
  "checks_run": $CHECKS_RUN,
  "checks_passed": $CHECKS_PASSED,
  "staged_files": "$STAGED_LIST",
  "head_at_review": "$COMMIT_HASH",
  "written_by": "write-review-gate.sh"
}
EOF

echo "========================================"
echo "  Review gate written ($CHECKS_PASSED/$CHECKS_RUN checks passed)"
echo "  Verdict: $VERDICT"
echo "  Summary: $SUMMARY"
echo "========================================"
