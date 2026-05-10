#!/bin/bash
# lattice-worktree-prune.sh -- Clean up orphan/abandoned session worktrees.
#
# Usage: bash scripts/lattice-worktree-prune.sh [flags]
#   --interactive               prompt before each removal (default for tty)
#   --auto-confirm-merged-only  auto-remove worktrees whose branches are merged (post-commit hook mode)
#   --dry-run                   list candidates only, don't remove
#   --staleness-days <N>        threshold for "old" (default: 7)
#
# Exit codes:
#   0 -- prune complete
#   1 -- precondition failure
#
# Per worktree-isolation-synthesis.md Section 1 R1, D3.

set -euo pipefail

MODE="interactive"
DRY_RUN=false
STALENESS_DAYS=7

# Default to non-interactive when not running on a tty (post-commit hook).
if [ ! -t 0 ]; then
    MODE="auto-confirm-merged-only"
fi

while [ $# -gt 0 ]; do
    case "$1" in
        --interactive) MODE="interactive"; shift ;;
        --auto-confirm-merged-only) MODE="auto-confirm-merged-only"; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --staleness-days)
            shift
            [ $# -ge 1 ] || { echo "ERROR: --staleness-days requires a number" >&2; exit 1; }
            STALENESS_DAYS="$1"; shift ;;
        *) echo "ERROR: unknown flag '$1'" >&2; exit 1 ;;
    esac
done

# Resolve canonical root.
GIT_COMMON_PATH="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$GIT_COMMON_PATH" ]; then
    echo "ERROR: not inside a git repository." >&2
    exit 1
fi
CANONICAL="$(dirname "$(cd "$GIT_COMMON_PATH" && pwd)")"

# Step 1: native git worktree prune (cleans entries whose dir was deleted).
git -C "$CANONICAL" worktree prune

# Step 2: enumerate live worktrees, classify, report.
NOW="$(date +%s)"
STALENESS_SECS=$((STALENESS_DAYS * 86400))

# pid_alive borrowed from acquire-lock.sh:86-102 (CLAUDE.md rule 5: reuse).
# Returns 0 if PID is currently a live process, 1 otherwise. Tries POSIX
# kill -0 first; falls back to Windows tasklist for native-Windows PIDs.
pid_alive() {
    local pid="$1"
    if [ -z "$pid" ]; then return 1; fi
    case "$pid" in *[!0-9]*) return 1;; esac
    if kill -0 "$pid" 2>/dev/null; then return 0; fi
    if command -v tasklist >/dev/null 2>&1; then
        if tasklist /FI "PID eq $pid" /NH 2>/dev/null | grep -q " $pid "; then
            return 0
        fi
    fi
    return 1
}

CANDIDATES=()
CANDIDATE_REASONS=()

WT=""
BR=""
while IFS= read -r line; do
    case "$line" in
        worktree\ *) WT="${line#worktree }" ;;
        branch\ *)  BR="${line#branch refs/heads/}" ;;
        '')
            # End of one entry's record. Classify if it's a session worktree.
            if [ -n "$WT" ] && [ -n "$BR" ]; then
                case "$BR" in
                    session/*)
                        # Skip canonical (no branch matches session/* there).
                        if [ "$WT" != "$CANONICAL" ] && [ -d "$WT" ]; then
                            # Last-commit timestamp on the branch.
                            LAST_COMMIT_TS="$(git -C "$WT" log -1 --format=%ct 2>/dev/null || echo 0)"
                            AGE=$((NOW - LAST_COMMIT_TS))

                            # Is the branch merged into master/main?
                            MERGED="no"
                            for base in master main; do
                                if git -C "$CANONICAL" show-ref --verify --quiet "refs/heads/$base"; then
                                    if git -C "$CANONICAL" merge-base --is-ancestor "$BR" "$base" 2>/dev/null; then
                                        MERGED="yes"
                                    fi
                                fi
                            done

                            REASON=""
                            if [ "$MERGED" = "yes" ]; then
                                REASON="merged into base (safe)"
                            elif [ "$AGE" -gt "$STALENESS_SECS" ]; then
                                REASON="stale ($((AGE / 86400))d, last commit > ${STALENESS_DAYS}d)"
                            fi

                            if [ -n "$REASON" ]; then
                                CANDIDATES+=("$WT|$BR")
                                CANDIDATE_REASONS+=("$REASON")
                            fi
                        fi
                        ;;
                esac
            fi
            WT=""; BR=""
            ;;
    esac
done < <(git -C "$CANONICAL" worktree list --porcelain; echo "")

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
    echo "No orphan/abandoned session worktrees found."
    exit 0
fi

echo "Found ${#CANDIDATES[@]} candidate worktree(s):"
for i in "${!CANDIDATES[@]}"; do
    IFS='|' read -r WT BR <<< "${CANDIDATES[$i]}"
    echo "  [$i] $WT"
    echo "      branch: $BR"
    echo "      reason: ${CANDIDATE_REASONS[$i]}"
done

if [ "$DRY_RUN" = "true" ]; then
    echo ""
    echo "(dry-run; nothing removed)"
    exit 0
fi

REMOVED=0
for i in "${!CANDIDATES[@]}"; do
    IFS='|' read -r WT BR <<< "${CANDIDATES[$i]}"
    REASON="${CANDIDATE_REASONS[$i]}"

    SHOULD_REMOVE=false
    case "$MODE" in
        interactive)
            printf "Remove %s [%s] (%s)? [y/N] " "$WT" "$BR" "$REASON"
            read -r ans
            case "$ans" in
                y|Y|yes|YES) SHOULD_REMOVE=true ;;
            esac
            ;;
        auto-confirm-merged-only)
            case "$REASON" in
                "merged into base"*) SHOULD_REMOVE=true ;;
            esac
            ;;
    esac

    if [ "$SHOULD_REMOVE" = "true" ]; then
        # Force-remove only when merged; for stale-but-unmerged use plain remove.
        case "$REASON" in
            "merged into base"*)
                git -C "$CANONICAL" worktree remove --force "$WT" 2>&1 || \
                    echo "  WARNING: could not remove $WT" >&2
                git -C "$CANONICAL" branch -d "$BR" 2>/dev/null || \
                    git -C "$CANONICAL" branch -D "$BR" 2>/dev/null || true
                ;;
            *)
                git -C "$CANONICAL" worktree remove "$WT" 2>&1 || \
                    echo "  WARNING: could not remove $WT (use --interactive --force? not supported -- handle manually)" >&2
                ;;
        esac
        echo "  Removed: $WT"
        REMOVED=$((REMOVED + 1))
    fi
done

echo ""
echo "Pruned $REMOVED of ${#CANDIDATES[@]} candidate worktree(s)."

# Audit-log if anything was removed (decisions.log entry per D3).
if [ "$REMOVED" -gt 0 ]; then
    {
        printf '%s\tlattice-worktree-prune\tREMOVED\tcount=%s\tmode=%s\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$REMOVED" "$MODE"
    } >> "$CANONICAL/.lattice/decisions.log" 2>/dev/null || true
fi
