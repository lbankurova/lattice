#!/bin/bash
# acquire-topic-lock.sh — Acquire a per-topic WIP lock
#
# Usage: bash scripts/acquire-topic-lock.sh <topic> [holder-name]
#   topic: the cycle topic to lock
#   holder-name: identifier for who's holding the lock (default: "agent")
#
# Exit codes:
#   0 — lock acquired (or re-acquired by same holder)
#   1 — lock held by another agent
#
# Lock mechanism: mkdir is atomic on all platforms. .lattice/cycle-lock/{topic}/
# directory existence IS the lock. Metadata inside for diagnostics.
#
# Stale threshold: 30 minutes. If the lock's metadata file hasn't been
# touched in 30 minutes, the holder is presumed crashed and the lock
# is force-acquired. Sub-cycles keep the lock fresh by touching the
# metadata file after every checkpoint update.

set -euo pipefail

TOPIC="${1:?Usage: acquire-topic-lock.sh <topic> [holder-name]}"
HOLDER="${2:-agent}"
LOCK_DIR=".lattice/cycle-lock/$TOPIC"
# Stale threshold bumped 2026-05-04 from 1800s -> 3600s after audit
# CRITICAL-3 + HIGH-5. Long workflows can exceed 30 minutes (research-cycle
# with two peer-review rounds, blueprint-cycle through architect gate +
# probe + plan review, build-cycle with full e2e gate). The engine
# heartbeat (engine.ts -- refreshLockMeta after each checkpoint write)
# keeps the meta mtime fresh during normal operation, so this threshold
# is only reached when the holder genuinely crashed. Force-clears are
# logged to decisions.log for audit.
STALE_THRESHOLD=3600

# Ensure parent exists
mkdir -p .lattice/cycle-lock

write_meta() {
    cat > "$LOCK_DIR/meta" <<METAEOF
holder: $HOLDER
acquired: $(date -Iseconds)
pid: $$
METAEOF
}

acquire() {
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        write_meta
        echo "TOPIC LOCK ACQUIRED: $TOPIC (by $HOLDER)"
        return 0
    fi
    return 1
}

check_reentrant() {
    if [ -f "$LOCK_DIR/meta" ]; then
        local current_holder
        current_holder=$(grep "^holder:" "$LOCK_DIR/meta" | sed 's/^holder: //')
        if [ "$current_holder" = "$HOLDER" ]; then
            # Same holder — refresh timestamp
            write_meta
            echo "TOPIC LOCK REFRESHED: $TOPIC (same holder: $HOLDER)"
            return 0
        fi
    fi
    return 1
}

log_force_clear() {
    # Audit trail for force-clears (CRITICAL-3 fix, 2026-05-04). Even when
    # the clear is legitimate, we want a permanent record so unexpected
    # force-acquires can be diagnosed post-hoc.
    local reason="$1"
    local prev_holder="$2"
    local age="$3"
    local ts
    ts=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)
    if [ -d ".lattice" ]; then
        printf '%s\tacquire-topic-lock.sh\tFORCED\t%s\treason=%s\tprev_holder=%s\tage_s=%s\tnew_holder=%s\n' \
            "$ts" "$TOPIC" "$reason" "$prev_holder" "$age" "$HOLDER" \
            >> .lattice/decisions.log 2>/dev/null || true
    fi
}

check_stale() {
    if [ ! -f "$LOCK_DIR/meta" ]; then
        echo "STALE TOPIC LOCK (no metadata) for $TOPIC -- force-acquiring"
        log_force_clear "no-metadata" "unknown" "0"
        rm -rf "$LOCK_DIR"
        return 0
    fi

    local lock_time
    lock_time=$(stat -c %Y "$LOCK_DIR/meta" 2>/dev/null || stat -f %m "$LOCK_DIR/meta" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local age=$((now - lock_time))

    if [ "$age" -gt "$STALE_THRESHOLD" ]; then
        local holder
        holder=$(grep "^holder:" "$LOCK_DIR/meta" 2>/dev/null | head -1 | sed 's/^holder: *//' || echo "unknown")
        echo "STALE TOPIC LOCK (${age}s old, $holder) for $TOPIC -- force-acquiring"
        log_force_clear "stale-${STALE_THRESHOLD}s-threshold" "$holder" "$age"
        rm -rf "$LOCK_DIR"
        return 0
    fi
    return 1
}

show_holder() {
    echo "---"
    if [ -f "$LOCK_DIR/meta" ]; then
        cat "$LOCK_DIR/meta"
    else
        echo "(no metadata)"
    fi
    echo "---"
}

# Try to acquire
if acquire; then
    exit 0
fi

# Lock exists — check if same holder (re-entrant)
if check_reentrant; then
    exit 0
fi

# Check if stale
if check_stale; then
    if acquire; then
        exit 0
    fi
fi

# Lock is held by another agent and not stale
echo "TOPIC LOCKED: $TOPIC -- another agent is already working on this"
show_holder
exit 1
