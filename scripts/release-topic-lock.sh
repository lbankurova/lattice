#!/bin/bash
# release-topic-lock.sh -- Release a per-topic WIP lock
#
# Usage:
#   bash scripts/release-topic-lock.sh <topic> [holder] [--force]
#
# Args:
#   topic   -- the cycle topic to release (required)
#   holder  -- identifier matching the acquire holder. If omitted, falls back
#              to LATTICE_LOCK_HOLDER env var. If both unset, runs in
#              "legacy unscoped" mode with a warning (callers should always
#              pass holder).
#   --force -- bypass ownership check. Logs a row to .lattice/decisions.log
#              recording the forced release and the original holder.
#
# Ownership check (added 2026-05-04 after audit CRITICAL-2):
#   The pre-fix script ran `rm -rf $LOCK_DIR` unconditionally. Combined with
#   CRITICAL-1 (parentless `release-lock` nodes running in Layer 0), this let
#   any cycle workflow destroy any other agent's topic lock with no warning,
#   no log, no recovery trail. The 2026-05-04 incident wiped ~2300 LOC of
#   parallel-session work because autopilot's workflow swept the parallel
#   agent's topic lock as a side effect. With the holder-check enabled,
#   release attempts whose holder doesn't match the lock's recorded holder
#   are refused unless --force is passed.
#
# Exit codes:
#   0 -- lock released (or no lock to release)
#   1 -- holder mismatch (release refused; pass --force to override)

set -uo pipefail

# D1 worktree-aware path resolution. See acquire-lock.sh for rationale.
LATTICE_ROOT="${LATTICE_PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

if [ -z "${1:-}" ]; then
    echo "Usage: release-topic-lock.sh <topic> [holder] [--force]" >&2
    exit 2
fi
TOPIC="$1"
shift

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

LOCK_DIR="$LATTICE_ROOT/.lattice/cycle-lock/$TOPIC"
META_FILE="$LOCK_DIR/meta"

if [ ! -d "$LOCK_DIR" ]; then
    echo "NO TOPIC LOCK HELD for $TOPIC (nothing to release)"
    exit 0
fi

read_recorded_holder() {
    if [ -f "$META_FILE" ]; then
        grep "^holder:" "$META_FILE" | head -1 | sed 's/^holder: *//'
    else
        echo ""
    fi
}

RECORDED_HOLDER=$(read_recorded_holder)

# Ownership check
if [ -n "$EXPECTED_HOLDER" ] && [ "$FORCE_FLAG" != "--force" ]; then
    if [ "$RECORDED_HOLDER" != "$EXPECTED_HOLDER" ]; then
        echo "TOPIC LOCK HOLDER MISMATCH for $TOPIC" >&2
        echo "  held by: '${RECORDED_HOLDER:-(unknown)}'" >&2
        echo "  release attempted by: '$EXPECTED_HOLDER'" >&2
        echo "" >&2
        echo "Refusing release. If you need to recover an orphaned lock:" >&2
        echo "  bash scripts/release-topic-lock.sh \"$TOPIC\" --force" >&2
        exit 1
    fi
fi

# Forced release: log it
if [ "$FORCE_FLAG" = "--force" ]; then
    TS=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)
    CALLER="${EXPECTED_HOLDER:-unknown-caller}"
    if [ -d "$LATTICE_ROOT/.lattice" ]; then
        printf '%s\trelease-topic-lock.sh\tFORCED\t%s\theld_by=%s\tforced_by=%s\n' \
            "$TS" "$TOPIC" "${RECORDED_HOLDER:-unknown}" "$CALLER" \
            >> "$LATTICE_ROOT/.lattice/decisions.log" 2>/dev/null || true
    fi
    echo "FORCED TOPIC LOCK RELEASE: $TOPIC (was held by '${RECORDED_HOLDER:-unknown}')"
fi

# Legacy unscoped release: warn but proceed
if [ -z "$EXPECTED_HOLDER" ] && [ "$FORCE_FLAG" != "--force" ]; then
    echo "WARNING: release-topic-lock.sh called without holder arg or LATTICE_LOCK_HOLDER env."
    echo "         Lock was held by: '${RECORDED_HOLDER:-unknown}'. Proceeding (legacy mode)."
    echo "         Callers should pass the holder name to enable ownership check."
fi

rm -rf "$LOCK_DIR"
echo "TOPIC LOCK RELEASED: $TOPIC"
