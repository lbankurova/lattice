#!/bin/bash
# lattice-build.sh -- Launch a build cycle inside its own git worktree.
#
# Usage: bash scripts/lattice-build.sh <topic> [-- <extra claude args>]
#
# This is the deterministic worktree-per-build-cycle entry point. It is a thin
# launcher over two already-proven pieces:
#   1. scripts/lattice-session-start.sh -- creates + PROVISIONS the worktree
#      (branch session/<topic>-<ts>, .lattice/ shared via symlink OR the
#      LATTICE_PROJECT_ROOT env fallback that pcc's tracked-.lattice requires,
#      dep reuse). All the hard, Windows-fragile, project-specific provisioning
#      lives there -- this launcher does not re-implement any of it.
#   2. `claude` -- launched FROM the worktree, so the interactive session
#      starts already isolated. Per the Claude Code docs, "pre-create the
#      worktree, launch Claude into it" is the canonical deterministic pattern;
#      a running session cannot be relocated by any hook or frontmatter, and
#      `EnterWorktree` is model-discretion only.
#
# Why a launcher and not `claude --worktree <topic>` + a hook:
#   `--worktree` does NATIVE creation (branch worktree-<name>, no .lattice
#   sharing, no dep reuse). Provisioning would have to run from a SessionStart
#   hook -- but pcc TRACKS .lattice/ (CLAUDE.md rule 24), which forces the
#   env-var (LATTICE_PROJECT_ROOT) sharing mode, and a hook cannot reliably
#   export that into the session's subsequent tool calls. session-start already
#   solves exactly this, so we reuse it rather than re-derive it in a hook.
#
# Scope: BUILD phase only. Research/blueprint write only allowlisted paths
# (docs/**, .lattice/**, .claude/**) and stay in canonical; isolating them
# buys nothing and costs a dep setup. Autopilot is exempt -- it owns one
# batch-scoped worktree (executor/src/autopilot.ts).
#
# Resume: re-run with the same <topic>. If a worktree for the topic already
# exists, the launcher RE-ENTERS it instead of failing -- this is the
# resume-after-/clear path.
#
# Teardown/merge-back: run /lattice:integrate from inside the worktree when the
# build cycle finishes (rebase-onto-base, re-gate, fast-forward, remove). R0
# (the require-worktree PreToolUse hook) is the backstop: a build run in
# canonical instead of via this launcher fails SAFE -- blocked at the first
# code write, never an unsafe canonical write.

set -euo pipefail

if [ $# -lt 1 ] || [ "${1:0:2}" = "--" ]; then
    cat >&2 <<'EOF'
ERROR: missing <topic>.

Usage: bash scripts/lattice-build.sh <topic> [-- <extra claude args>]

Examples:
  bash scripts/lattice-build.sh organ-weight-normalization
  bash scripts/lattice-build.sh noael-alg -- --model opus
EOF
    exit 1
fi

TOPIC="$1"; shift
# Optional pass-through args to claude after a literal `--`.
CLAUDE_ARGS=()
if [ $# -gt 0 ]; then
    if [ "$1" = "--" ]; then shift; fi
    CLAUDE_ARGS=("$@")
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANONICAL="$(git rev-parse --show-toplevel)"

# ── Refuse to nest: this must run from the canonical tree ──
GIT_DIR_ABS="$(git rev-parse --absolute-git-dir 2>/dev/null || true)"
GIT_COMMON_ABS="$(cd "$(git rev-parse --git-common-dir 2>/dev/null)" && pwd 2>/dev/null || true)"
if [ "$GIT_DIR_ABS" != "$GIT_COMMON_ABS" ]; then
    echo "ERROR: already inside a linked worktree. Run lattice-build.sh from the canonical tree." >&2
    exit 1
fi

# ── Resume: re-enter an existing worktree for this topic ──
# Branch convention is session/<topic>-<ts>; match on the topic segment.
EXISTING="$(git worktree list --porcelain 2>/dev/null \
    | awk -v t="$TOPIC" '
        /^worktree /{ wt=$2 }
        /^branch /{
            b=$2
            # refs/heads/session/<topic>-<ts>
            if (b ~ ("refs/heads/session/" t "-")) { print wt; exit }
        }')"

if [ -n "$EXISTING" ]; then
    echo "Resuming existing worktree for '$TOPIC':"
    echo "  $EXISTING"
    WORKTREE="$EXISTING"
else
    echo "Creating worktree for build cycle '$TOPIC'..."
    # Reuse canonical's deps (symlink node_modules) instead of re-installing.
    # session-start prints a human-readable block; capture it, surface it on
    # stderr, and parse the "Path:" line for the worktree directory.
    START_OUT="$(bash "$SCRIPT_DIR/lattice-session-start.sh" "$TOPIC" --reuse-deps "$CANONICAL" 2>&1)" || {
        echo "$START_OUT" >&2
        echo "ERROR: lattice-session-start.sh failed for '$TOPIC'." >&2
        exit 2
    }
    echo "$START_OUT" >&2
    WORKTREE="$(printf '%s\n' "$START_OUT" | sed -n 's/^  Path:[[:space:]]*//p' | head -1)"
    if [ -z "$WORKTREE" ] || [ ! -d "$WORKTREE" ]; then
        echo "ERROR: could not determine the worktree path from session-start output." >&2
        exit 2
    fi
fi

echo ""
echo "Launching Claude in the worktree. When the build cycle completes, run"
echo "  /lattice:integrate"
echo "from inside the session to land the branch and remove the worktree."
echo ""

cd "$WORKTREE"
# If symlink mode was unavailable (pcc's tracked-.lattice -> env fallback),
# session-start wrote .lattice-env exporting LATTICE_PROJECT_ROOT. Source it so
# the launched session's shell inherits shared-state visibility.
if [ -f "$WORKTREE/.lattice-env" ]; then
    # shellcheck disable=SC1091
    . "$WORKTREE/.lattice-env"
fi

exec claude "${CLAUDE_ARGS[@]}"
