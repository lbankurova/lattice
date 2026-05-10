#!/bin/bash
# lattice-session-end.sh -- Tear down a lattice session worktree.
#
# Usage: bash scripts/lattice-session-end.sh <topic> [flags]
#   <topic>           -- session topic (must match the start invocation)
#   --merge-back      -- fast-forward session branch into base, remove worktree (default)
#   --branch-as-pr    -- push session branch but do NOT merge; print gh pr create cmd
#   --discard         -- abandon session (delete worktree + branch without merging)
#   --base <branch>   -- override base branch (default: master/main, auto-detected)
#
# Exit codes:
#   0 -- session ended cleanly
#   1 -- precondition failure (no matching worktree, dirty tree, etc.)
#   2 -- merge failed (non-FF, conflict)
#
# Per worktree-isolation-synthesis.md Section 1 R1, D2.

set -euo pipefail

if [ $# -lt 1 ] || [ "${1:0:2}" = "--" ]; then
    cat >&2 <<'EOF'
ERROR: missing <topic> argument.

Usage: bash scripts/lattice-session-end.sh <topic> [flags]
  --merge-back       fast-forward + remove worktree (default)
  --branch-as-pr     push branch only, no merge
  --discard          delete worktree + branch without merging
  --base <branch>    override base branch
EOF
    exit 1
fi

TOPIC="$1"
shift

MODE="merge-back"
BASE_OVERRIDE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --merge-back) MODE="merge-back"; shift ;;
        --branch-as-pr) MODE="branch-as-pr"; shift ;;
        --discard) MODE="discard"; shift ;;
        --base)
            shift
            [ $# -ge 1 ] || { echo "ERROR: --base requires a branch name" >&2; exit 1; }
            BASE_OVERRIDE="$1"; shift ;;
        *) echo "ERROR: unknown flag '$1'" >&2; exit 1 ;;
    esac
done

# ── Resolve canonical root + locate the matching worktree ──

# We may be called from inside the worktree (typical autopilot teardown) or
# from the canonical tree. Always resolve canonical via --git-common-dir.
GIT_COMMON_PATH="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$GIT_COMMON_PATH" ]; then
    echo "ERROR: not inside a git repository." >&2
    exit 1
fi
GIT_COMMON_ABS="$(cd "$GIT_COMMON_PATH" && pwd)"
# Canonical root is the parent of the .git directory in the canonical tree.
CANONICAL="$(dirname "$GIT_COMMON_ABS")"

# Find the worktree whose branch matches session/<topic>-*.
WORKTREE=""
BRANCH=""
while IFS= read -r line; do
    case "$line" in
        worktree\ *)
            WT="${line#worktree }"
            ;;
        branch\ refs/heads/session/${TOPIC}-*)
            BR="${line#branch refs/heads/}"
            WORKTREE="$WT"
            BRANCH="$BR"
            ;;
    esac
done < <(git -C "$CANONICAL" worktree list --porcelain)

if [ -z "$WORKTREE" ]; then
    echo "ERROR: no worktree found for topic '$TOPIC'." >&2
    echo "  Run 'git -C \"$CANONICAL\" worktree list' to see active worktrees." >&2
    exit 1
fi

echo "Session worktree: $WORKTREE"
echo "Session branch:   $BRANCH"

# ── Detect base branch ──

if [ -n "$BASE_OVERRIDE" ]; then
    BASE="$BASE_OVERRIDE"
else
    # Try to detect from the branch's upstream tracking, fall back to master/main.
    BASE=""
    for candidate in master main; do
        if git -C "$CANONICAL" show-ref --verify --quiet "refs/heads/$candidate"; then
            BASE="$candidate"
            break
        fi
    done
    if [ -z "$BASE" ]; then
        echo "ERROR: cannot determine base branch (neither master nor main exists)." >&2
        echo "       Use --base <branch> to specify." >&2
        exit 1
    fi
fi

echo "Base branch:      $BASE"
echo "Mode:             $MODE"

# ── Validate clean tree ──

WT_DIRTY="$(git -C "$WORKTREE" status --porcelain)"
if [ -n "$WT_DIRTY" ] && [ "$MODE" != "discard" ]; then
    echo "ERROR: worktree '$WORKTREE' has uncommitted changes:" >&2
    echo "$WT_DIRTY" | head -10 >&2
    echo "  Commit or stash before ending the session, or use --discard to abandon." >&2
    exit 1
fi

# ── Mode dispatch ──

case "$MODE" in
    merge-back)
        # Validate ahead of base by N >= 0 commits.
        AHEAD="$(git -C "$WORKTREE" rev-list --count "${BASE}..HEAD" 2>/dev/null || echo 0)"
        if [ "$AHEAD" = "0" ]; then
            echo "No commits to merge (session branch == base). Removing worktree."
        else
            echo "Session branch is $AHEAD commit(s) ahead of $BASE."

            # Validate fast-forwardable.
            BASE_SHA="$(git -C "$CANONICAL" rev-parse "$BASE")"
            MERGE_BASE="$(git -C "$WORKTREE" merge-base "$BASE_SHA" HEAD)"
            if [ "$MERGE_BASE" != "$BASE_SHA" ]; then
                cat >&2 <<EOF
ERROR: $BASE has advanced beyond the session's merge-base; cannot fast-forward.
  Recovery options:
    (a) Re-run with --branch-as-pr to push the branch and open a PR
    (b) See worktree-isolation-protocol.md for rebase guidance
  This is a normal multi-day-session edge case, not a worktree defect.
EOF
                exit 2
            fi

            # FF-merge in canonical tree.
            CURRENT_BASE="$(git -C "$CANONICAL" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
            if [ "$CURRENT_BASE" = "$BASE" ]; then
                echo "Fast-forwarding $BASE -> $BRANCH ..."
                git -C "$CANONICAL" merge --ff-only "$BRANCH"
            else
                echo "Updating $BASE ref directly (canonical HEAD is $CURRENT_BASE, not $BASE)..."
                git -C "$CANONICAL" branch -f "$BASE" "$BRANCH"
            fi
            echo "Merged $AHEAD commit(s) into $BASE."
        fi

        echo "Removing worktree..."
        git -C "$CANONICAL" worktree remove "$WORKTREE"
        if [ "$AHEAD" != "0" ]; then
            git -C "$CANONICAL" branch -d "$BRANCH" 2>/dev/null || \
                git -C "$CANONICAL" branch -D "$BRANCH"
        else
            git -C "$CANONICAL" branch -D "$BRANCH"
        fi
        echo "Session ended."
        ;;

    branch-as-pr)
        AHEAD="$(git -C "$WORKTREE" rev-list --count "${BASE}..HEAD" 2>/dev/null || echo 0)"
        if [ "$AHEAD" = "0" ]; then
            echo "ERROR: session branch has no commits to push." >&2
            exit 1
        fi

        echo "Pushing $BRANCH to origin (no merge)..."
        if git -C "$WORKTREE" push -u origin "$BRANCH"; then
            echo ""
            echo "Branch pushed. Create a PR with:"
            echo "  gh pr create --base $BASE --head $BRANCH"
        else
            echo "WARNING: push failed (no origin remote? auth issue?). Branch left local." >&2
        fi

        echo "Removing worktree (branch left in repo)..."
        git -C "$CANONICAL" worktree remove "$WORKTREE"
        echo "Session ended (branch retained for PR review)."
        ;;

    discard)
        echo "Discarding worktree + branch..."
        git -C "$CANONICAL" worktree remove --force "$WORKTREE"
        git -C "$CANONICAL" branch -D "$BRANCH"
        echo "Session discarded."
        ;;
esac

# Audit-log the session-end so the R1 stop-light observable can count
# non-FF aborts (resolved by the early-exit above) and successful merges.
{
    printf '%s\tlattice-session-end\t%s\t%s\tbase=%s\tahead=%s\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        "$MODE" "$TOPIC" "$BASE" "${AHEAD:-0}"
} >> "$CANONICAL/.lattice/decisions.log" 2>/dev/null || true
