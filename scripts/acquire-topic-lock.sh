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

# D1 worktree-aware path resolution. See acquire-lock.sh for rationale.
LATTICE_ROOT="${LATTICE_PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

TOPIC="${1:?Usage: acquire-topic-lock.sh <topic> [holder-name]}"
HOLDER="${2:-agent}"
LOCK_DIR="$LATTICE_ROOT/.lattice/cycle-lock/$TOPIC"
# Holder PID -- see acquire-lock.sh for rationale. Default 0 means
# clock-based stale only; pass LATTICE_LOCK_PID=$$ from the workflow
# that brackets acquire/release to opt in to PID-liveness override.
HOLDER_PID="${LATTICE_LOCK_PID:-0}"
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
mkdir -p "$LATTICE_ROOT/.lattice/cycle-lock"

write_meta() {
    # pid records HOLDER_PID (caller's long-lived workflow PID via
    # LATTICE_LOCK_PID env) or 0 = "no PID liveness check, clock only."
    # See acquire-lock.sh -- writing $$ here would create a perpetually
    # dead PID after this script exits.
    cat > "$LOCK_DIR/meta" <<METAEOF
holder: $HOLDER
acquired: $(date -Iseconds)
pid: $HOLDER_PID
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
    if [ -d "$LATTICE_ROOT/.lattice" ]; then
        printf '%s\tacquire-topic-lock.sh\tFORCED\t%s\treason=%s\tprev_holder=%s\tage_s=%s\tnew_holder=%s\n' \
            "$ts" "$TOPIC" "$reason" "$prev_holder" "$age" "$HOLDER" \
            >> "$LATTICE_ROOT/.lattice/decisions.log" 2>/dev/null || true
    fi
}

# pid_alive: returns 0 if PID is currently a live process, 1 otherwise.
# See acquire-lock.sh for full rationale; same implementation kept in sync.
pid_alive() {
    local pid="$1"
    if [ -z "$pid" ]; then return 1; fi
    case "$pid" in *[!0-9]*) return 1;; esac
    if kill -0 "$pid" 2>/dev/null; then
        return 0
    fi
    if command -v tasklist >/dev/null 2>&1; then
        if tasklist /FI "PID eq $pid" /NH 2>/dev/null | grep -q " $pid "; then
            return 0
        fi
    fi
    return 1
}

check_stale() {
    if [ ! -f "$LOCK_DIR/meta" ]; then
        # No-metadata grace period (C2, 2026-05-05 audit). The same race
        # the spec describes for acquire-lock.sh applies here: mkdir wins
        # before write_meta, racer sees the empty dir, force-clears.
        # SCOPE-NOTE: spec scope was acquire-lock.sh only; mirroring to
        # topic-lock for consistency since the race pattern is identical.
        sleep 2
        if [ -f "$LOCK_DIR/meta" ]; then
            return 1
        fi
        echo "STALE TOPIC LOCK (no metadata after 2s grace) for $TOPIC -- force-acquiring"
        log_force_clear "no-metadata" "unknown" "0"
        rm -rf "$LOCK_DIR"
        return 0
    fi

    # PID liveness (C1, 2026-05-05 audit) -- override clock-based stale in
    # both directions: dead PID -> immediate clear; live PID -> never
    # clock-clear (closes the stat-returns-0 false-stale bug).
    local lock_pid
    lock_pid=$(grep "^pid:" "$LOCK_DIR/meta" 2>/dev/null | head -1 | sed 's/^pid: *//' | tr -d ' ' || echo "")
    # PID 0 / unset = no opt-in; clock-only. See acquire-lock.sh.
    if [ -n "$lock_pid" ] && [ "$lock_pid" != "0" ] && ! pid_alive "$lock_pid"; then
        local holder
        holder=$(grep "^holder:" "$LOCK_DIR/meta" 2>/dev/null | head -1 | sed 's/^holder: *//' || echo "unknown")
        echo "STALE TOPIC LOCK (pid $lock_pid not alive, $holder) for $TOPIC -- force-acquiring"
        log_force_clear "dead-pid-$lock_pid" "$holder" "0"
        rm -rf "$LOCK_DIR"
        return 0
    fi

    local lock_time
    lock_time=$(stat -c %Y "$LOCK_DIR/meta" 2>/dev/null || stat -f %m "$LOCK_DIR/meta" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local age=$((now - lock_time))

    if [ -n "$lock_pid" ] && [ "$lock_pid" != "0" ] && pid_alive "$lock_pid"; then
        return 1
    fi

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
