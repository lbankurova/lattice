#!/bin/bash
# release-lock.sh -- Release the shared-state commit lock
#
# Usage:
#   bash scripts/release-lock.sh [holder] [--force]
#
# Ownership check (added 2026-05-04 after audit CRITICAL-2). See the
# companion script `release-topic-lock.sh` for the full rationale --
# in short, the pre-fix unconditional `rm -rf` allowed any caller to
# destroy any other agent's lock, contributing to the 2026-05-04
# data-loss incident.
#
# Exit codes:
#   0 -- lock released (or no lock to release)
#   1 -- holder mismatch (release refused; pass --force to override)

set -uo pipefail

# D1 worktree-aware path resolution. See acquire-lock.sh for rationale.
LATTICE_ROOT="${LATTICE_PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

HOLDER_ARG=""
FORCE_FLAG=""
for arg in "$@"; do
    if [ "$arg" = "--force" ]; then
        FORCE_FLAG="--force"
    elif [ -z "$HOLDER_ARG" ]; then
        HOLDER_ARG="$arg"
    fi
done
EXPECTED_HOLDER="${HOLDER_ARG:-${LATTICE_LOCK_HOLDER:-}}"

LOCK_DIR="$LATTICE_ROOT/.lattice/commit.lock"
META_FILE="$LOCK_DIR/meta"

if [ ! -d "$LOCK_DIR" ]; then
    echo "NO LOCK HELD (nothing to release)"
    exit 0
fi

RECORDED_HOLDER=""
if [ -f "$META_FILE" ]; then
    RECORDED_HOLDER=$(grep "^holder:" "$META_FILE" | head -1 | sed 's/^holder: *//' || echo "")
fi

# Ownership check
if [ -n "$EXPECTED_HOLDER" ] && [ "$FORCE_FLAG" != "--force" ]; then
    if [ "$RECORDED_HOLDER" != "$EXPECTED_HOLDER" ]; then
        echo "COMMIT LOCK HOLDER MISMATCH" >&2
        echo "  held by: '${RECORDED_HOLDER:-(unknown)}'" >&2
        echo "  release attempted by: '$EXPECTED_HOLDER'" >&2
        echo "" >&2
        echo "Refusing release. If you need to recover an orphaned lock:" >&2
        echo "  bash scripts/release-lock.sh --force" >&2
        exit 1
    fi
fi

# Forced release: log it
if [ "$FORCE_FLAG" = "--force" ]; then
    TS=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)
    CALLER="${EXPECTED_HOLDER:-unknown-caller}"
    if [ -d "$LATTICE_ROOT/.lattice" ]; then
        printf '%s\trelease-lock.sh\tFORCED\tcommit-lock\theld_by=%s\tforced_by=%s\n' \
            "$TS" "${RECORDED_HOLDER:-unknown}" "$CALLER" \
            >> "$LATTICE_ROOT/.lattice/decisions.log" 2>/dev/null || true
    fi
    echo "FORCED COMMIT LOCK RELEASE (was held by '${RECORDED_HOLDER:-unknown}')"
fi

# Legacy unscoped release: warn but proceed
if [ -z "$EXPECTED_HOLDER" ] && [ "$FORCE_FLAG" != "--force" ]; then
    echo "WARNING: release-lock.sh called without holder arg or LATTICE_LOCK_HOLDER env."
    echo "         Lock was held by: '${RECORDED_HOLDER:-unknown}'. Proceeding (legacy mode)."
fi

rm -rf "$LOCK_DIR"
echo "LOCK RELEASED"
