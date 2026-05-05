#!/bin/bash
# acquire-lock.sh — Acquire the shared-state commit lock
#
# Usage: bash scripts/acquire-lock.sh [holder-name] [--poll]
#   holder-name: identifier for who's holding the lock (default: "unknown")
#   --poll: wait and retry instead of failing immediately
#
# Exit codes:
#   0 — lock acquired
#   1 — lock held by another agent (no --poll)
#   2 — timeout waiting for lock (with --poll)
#
# Lock mechanism: mkdir is atomic on all platforms. .lattice/commit.lock/
# directory existence IS the lock. Metadata inside for diagnostics.

set -euo pipefail

LOCK_DIR=".lattice/commit.lock"
HOLDER="${1:-unknown}"
POLL=false
POLL_INTERVAL=30     # seconds between retries
MAX_WAIT=600         # 10 minutes max wait
# Stale threshold bumped 2026-05-04 from 300s -> 1800s after audit CRITICAL-3.
# A 6-minute peer-review pass is normal under the cycle workflows; the engine
# also refreshes the meta file's mtime at every checkpoint, so a properly
# operating workflow never reaches this threshold. Anything older means the
# holder genuinely crashed -- but the force-clear is still LOGGED to
# decisions.log so the recovery is auditable.
STALE_THRESHOLD=1800

# Check for --poll flag
for arg in "$@"; do
    if [ "$arg" = "--poll" ]; then
        POLL=true
    fi
done

# Remove --poll from holder name if it was passed as first arg
if [ "$HOLDER" = "--poll" ]; then
    HOLDER="unknown"
fi

acquire() {
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        # Lock acquired — write metadata
        echo -e "holder: $HOLDER\nacquired: $(date -Iseconds)\npid: $$" > "$LOCK_DIR/meta"
        echo "LOCK ACQUIRED by $HOLDER"
        return 0
    fi
    return 1
}

log_force_clear() {
    # Audit trail for force-clears (CRITICAL-3 fix, 2026-05-04). Even when the
    # clear is legitimate, we want a permanent record so unexpected force-
    # acquires can be diagnosed post-hoc.
    local reason="$1"
    local prev_holder="$2"
    local age="$3"
    local ts
    ts=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)
    if [ -d ".lattice" ]; then
        printf '%s\tacquire-lock.sh\tFORCED\tcommit-lock\treason=%s\tprev_holder=%s\tage_s=%s\tnew_holder=%s\n' \
            "$ts" "$reason" "$prev_holder" "$age" "$HOLDER" \
            >> .lattice/decisions.log 2>/dev/null || true
    fi
}

# pid_alive: returns 0 if PID is currently a live process, 1 otherwise.
# Tries POSIX `kill -0` first (cheap, works on every Unix shell + git-bash on
# Windows when the PID is a bash subshell). Falls back to Windows `tasklist`
# for native-Windows PIDs that `kill -0` may not resolve under MINGW. Anything
# unparseable (empty / non-numeric) returns 1 so the caller treats it as dead.
pid_alive() {
    local pid="$1"
    if [ -z "$pid" ]; then return 1; fi
    case "$pid" in *[!0-9]*) return 1;; esac
    if kill -0 "$pid" 2>/dev/null; then
        return 0
    fi
    # Windows fallback: tasklist /FI "PID eq <pid>" /NH prints a row when the
    # process is live, "INFO: No tasks are running..." when not. The grep -q
    # on the literal pid is robust against either output shape.
    if command -v tasklist >/dev/null 2>&1; then
        if tasklist /FI "PID eq $pid" /NH 2>/dev/null | grep -q " $pid "; then
            return 0
        fi
    fi
    return 1
}

check_stale() {
    if [ ! -f "$LOCK_DIR/meta" ]; then
        # Lock dir exists but no metadata — probably stale
        echo "STALE LOCK (no metadata) — force-acquiring"
        log_force_clear "no-metadata" "unknown" "0"
        rm -rf "$LOCK_DIR"
        return 0
    fi

    # PID liveness check (C1, 2026-05-05 audit). The pre-fix code relied
    # solely on wall-clock age vs STALE_THRESHOLD. Two failure modes:
    #   (a) a PID that died seconds ago holds the lock for the full
    #       30-minute threshold;
    #   (b) when stat returns 0 (file vanished mid-check, fs glitch), age
    #       computes to "now" and a healthy long-running holder gets
    #       force-cleared.
    # PID liveness is the ground-truth signal: if the holder PID is dead,
    # force-clear immediately regardless of clock; if it's alive, treat the
    # lock as held even if mtime drifts. Clock check stays as a fallback
    # for orphaned PIDs we can't resolve (cross-host / cross-container).
    local lock_pid
    lock_pid=$(grep "^pid:" "$LOCK_DIR/meta" 2>/dev/null | head -1 | sed 's/^pid: *//' | tr -d ' ' || echo "")
    if [ -n "$lock_pid" ] && ! pid_alive "$lock_pid"; then
        local holder
        holder=$(grep "^holder:" "$LOCK_DIR/meta" 2>/dev/null | head -1 | sed 's/^holder: *//' || echo "unknown")
        echo "STALE LOCK (pid $lock_pid not alive, $holder) — force-acquiring"
        log_force_clear "dead-pid-$lock_pid" "$holder" "0"
        rm -rf "$LOCK_DIR"
        return 0
    fi

    # Check age of lock
    local lock_time
    lock_time=$(stat -c %Y "$LOCK_DIR/meta" 2>/dev/null || stat -f %m "$LOCK_DIR/meta" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local age=$((now - lock_time))

    # If PID is alive, never clock-clear -- liveness overrides clock-based
    # stale (closes the "stat returns 0 -> infinite age" force-clear bug).
    if [ -n "$lock_pid" ] && pid_alive "$lock_pid"; then
        return 1
    fi

    if [ "$age" -gt "$STALE_THRESHOLD" ]; then
        local holder
        holder=$(grep "^holder:" "$LOCK_DIR/meta" 2>/dev/null | head -1 | sed 's/^holder: *//' || echo "unknown")
        echo "STALE LOCK ($age seconds old, $holder) — force-acquiring"
        log_force_clear "stale-${STALE_THRESHOLD}s-threshold" "$holder" "$age"
        rm -rf "$LOCK_DIR"
        return 0
    fi
    return 1
}

show_holder() {
    if [ -f "$LOCK_DIR/meta" ]; then
        cat "$LOCK_DIR/meta"
    else
        echo "(no metadata)"
    fi
}

# Ensure .lattice/ exists
mkdir -p .lattice

# Try to acquire
if acquire; then
    exit 0
fi

# Lock is held — check if stale
if check_stale; then
    if acquire; then
        exit 0
    fi
fi

# Lock is held and not stale
if [ "$POLL" = false ]; then
    echo "LOCK HELD — cannot acquire"
    show_holder
    exit 1
fi

# Poll mode — wait for lock
echo "LOCK HELD — waiting (poll every ${POLL_INTERVAL}s, max ${MAX_WAIT}s)"
show_holder
waited=0
while [ "$waited" -lt "$MAX_WAIT" ]; do
    sleep "$POLL_INTERVAL"
    waited=$((waited + POLL_INTERVAL))

    # Check stale on every retry
    if check_stale 2>/dev/null; then
        if acquire; then
            exit 0
        fi
    fi

    if acquire; then
        echo "(waited ${waited}s)"
        exit 0
    fi
    echo "... still locked (${waited}s elapsed)"
done

echo "TIMEOUT — lock not acquired after ${MAX_WAIT}s"
show_holder
exit 2
