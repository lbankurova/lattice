#!/bin/bash
# lattice-session-start.sh -- Spawn an isolated git worktree for a lattice session.
#
# Usage: bash scripts/lattice-session-start.sh <topic> [flags]
#   <topic>            -- session topic (used for branch name + worktree dir)
#   --launch           -- print a cd-and-launch hint at the end
#   --skip-deps        -- skip npm/pip install steps (read-only sessions)
#   --reuse-deps <p>   -- symlink node_modules from <p> instead of installing
#   --retry-deps       -- retry failed dependency installs
#   --worktree-parent  -- override worktree parent dir (default: <canonical-parent>/.worktrees/)
#
# Exit codes:
#   0 -- worktree created (deps may have failed non-fatally; see warnings)
#   1 -- precondition failure (already in worktree, in submodule, branch exists)
#   2 -- git worktree add failed
#
# Borrows from obra/superpowers/skills/using-git-worktrees/SKILL.md (Step 0
# detection, Step 3 project-setup auto-detection, .worktrees/ directory
# convention, .gitignore safety check). Lattice extensions: branch namespacing
# (session/<topic>-<ts>), .lattice/ symlink with env-var fallback (D1),
# non-fatal dependency failure handling (R2-NI-4), --skip-deps / --reuse-deps
# flags for cold-cache budget control.
#
# Per worktree-isolation-synthesis.md Section 1 R1.

set -euo pipefail

# ── Argument parsing ────────────────────────────────────────────

if [ $# -lt 1 ] || [ "${1:0:2}" = "--" ]; then
    cat >&2 <<'EOF'
ERROR: missing <topic> argument.

Usage: bash scripts/lattice-session-start.sh <topic> [flags]
  --launch            print cd-and-launch hint at end
  --skip-deps         skip npm/pip install (read-only sessions)
  --reuse-deps <path> symlink node_modules from <path>
  --retry-deps        retry failed dep installs
  --worktree-parent <path>  override default <canonical-parent>/.worktrees/

Examples:
  bash scripts/lattice-session-start.sh autopilot-batch-2026-05-09
  bash scripts/lattice-session-start.sh fix-noael-bug --skip-deps
EOF
    exit 1
fi

TOPIC="$1"
shift

LAUNCH=false
SKIP_DEPS=false
REUSE_DEPS=""
RETRY_DEPS=false
WORKTREE_PARENT_OVERRIDE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --launch) LAUNCH=true; shift ;;
        --skip-deps) SKIP_DEPS=true; shift ;;
        --reuse-deps)
            shift
            [ $# -ge 1 ] || { echo "ERROR: --reuse-deps requires a path" >&2; exit 1; }
            REUSE_DEPS="$1"; shift ;;
        --retry-deps) RETRY_DEPS=true; shift ;;
        --worktree-parent)
            shift
            [ $# -ge 1 ] || { echo "ERROR: --worktree-parent requires a path" >&2; exit 1; }
            WORKTREE_PARENT_OVERRIDE="$1"; shift ;;
        *) echo "ERROR: unknown flag '$1'" >&2; exit 1 ;;
    esac
done

# Sanitize topic for branch + dirname use (preserve existing chars but reject
# shell metacharacters).
case "$TOPIC" in
    *[\ \\\"\$\`]*|*..*|/*)
        echo "ERROR: topic '$TOPIC' contains invalid characters (spaces, backslashes, quotes, '..', leading slash)." >&2
        exit 1
        ;;
esac

# ── Step 0: detect existing worktree / submodule (superpowers Step 0) ──

# GIT_DIR != GIT_COMMON_DIR means we're already inside a linked worktree
# (the canonical tree has GIT_DIR == GIT_COMMON_DIR; linked worktrees have
# GIT_DIR pointing to .git/worktrees/<name>). Refusing to double-spawn
# prevents recursive worktree pyramids.
GIT_DIR_PATH="$(git rev-parse --git-dir 2>/dev/null || true)"
GIT_COMMON_PATH="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$GIT_DIR_PATH" ] || [ -z "$GIT_COMMON_PATH" ]; then
    echo "ERROR: not inside a git repository." >&2
    exit 1
fi
GIT_DIR_ABS="$(cd "$GIT_DIR_PATH" && pwd)"
GIT_COMMON_ABS="$(cd "$GIT_COMMON_PATH" && pwd)"
if [ "$GIT_DIR_ABS" != "$GIT_COMMON_ABS" ]; then
    echo "ERROR: already inside a linked worktree." >&2
    echo "  GIT_DIR:        $GIT_DIR_ABS" >&2
    echo "  GIT_COMMON_DIR: $GIT_COMMON_ABS" >&2
    echo "  Run lattice-session-start.sh from the canonical (main) repo, not from inside a worktree." >&2
    exit 1
fi

# Submodule guard. If we're inside a submodule, --show-superproject-working-tree
# returns the parent project's path -- creating a worktree from inside the
# submodule would target the submodule, not the parent. Refuse.
SUPERPROJECT="$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)"
if [ -n "$SUPERPROJECT" ]; then
    echo "ERROR: you are inside a submodule (parent: $SUPERPROJECT)." >&2
    echo "  Run lattice-session-start.sh from the parent project, not from inside a submodule." >&2
    exit 1
fi

CANONICAL="$(git rev-parse --show-toplevel)"
CANONICAL_NAME="$(basename "$CANONICAL")"
CANONICAL_PARENT="$(dirname "$CANONICAL")"

# ── Worktree-parent directory + .gitignore safety (superpowers convention) ──

if [ -n "$WORKTREE_PARENT_OVERRIDE" ]; then
    WORKTREE_PARENT="$WORKTREE_PARENT_OVERRIDE"
else
    # Per-project override via lattice-project.toml [project.worktree]
    # worktree_parent. We don't parse TOML here -- lattice-session-start.sh
    # is bash; toml parsing belongs in the executor. The flag override is
    # the project-author's escape hatch.
    WORKTREE_PARENT="$CANONICAL_PARENT/.worktrees"
fi

mkdir -p "$WORKTREE_PARENT"

# .gitignore safety check (superpowers Step 0). If the worktree-parent is
# inside the canonical repo (e.g., user override placing it under canonical),
# verify it's gitignored to prevent the worktree's contents from being
# tracked as part of the canonical repo. When parent is outside canonical
# (default), this check is a no-op.
case "$WORKTREE_PARENT" in
    "$CANONICAL"/*)
        WORKTREE_PARENT_REL="${WORKTREE_PARENT#$CANONICAL/}"
        if ! git -C "$CANONICAL" check-ignore -q "$WORKTREE_PARENT_REL" 2>/dev/null; then
            echo "WARNING: $WORKTREE_PARENT_REL is not in .gitignore." >&2
            echo "         Worktree contents may be tracked by the canonical repo." >&2
            echo "         Add the following line to .gitignore:" >&2
            echo "           $WORKTREE_PARENT_REL/" >&2
        fi
        ;;
esac

# ── Branch + worktree paths ──

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BRANCH="session/${TOPIC}-${TS}"
WORKTREE_DIR_NAME="${CANONICAL_NAME}-session-${TOPIC}-${TS}"
WORKTREE="$WORKTREE_PARENT/$WORKTREE_DIR_NAME"

# Branch collision check. session/<topic>-<ts> includes a timestamp so
# practical collisions are rare, but a stale branch from a prior crashed
# session could match.
if git -C "$CANONICAL" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "ERROR: branch '$BRANCH' already exists." >&2
    echo "  Precedent: lattice-self-fix-2026-05-05 used 'lattice-self-fix/stream-<x>' for namespaced session branches." >&2
    echo "  Recovery: 'git branch -d $BRANCH' (if merged) or 'git branch -D $BRANCH' (force-delete)." >&2
    exit 1
fi

if [ -e "$WORKTREE" ]; then
    echo "ERROR: worktree directory '$WORKTREE' already exists." >&2
    echo "  Recovery: 'bash scripts/lattice-worktree-prune.sh' to clean up abandoned worktrees." >&2
    exit 1
fi

# ── git worktree add ──

echo "Creating worktree:"
echo "  branch:   $BRANCH (from HEAD)"
echo "  path:     $WORKTREE"
echo "  canonical: $CANONICAL"

if ! git -C "$CANONICAL" worktree add -b "$BRANCH" "$WORKTREE" HEAD; then
    echo "ERROR: 'git worktree add' failed." >&2
    exit 2
fi

# ── .lattice/ visibility (D1: symlink primary, env-var fallback) ──
#
# Worktrees do NOT inherit .lattice/ from the canonical tree -- it's just a
# regular tracked directory if it's tracked, or an untracked-but-gitignored
# directory otherwise. lattice's .lattice/ is gitignored (decisions.log,
# locks, attestations -- all per-checkout state), so it does NOT appear in
# the new worktree at all.
#
# Two strategies:
#   (a) symlink .lattice -> <canonical>/.lattice  (ALL state shared)
#   (b) env-var fallback: LATTICE_PROJECT_ROOT=<canonical>; scripts honor it
#
# Strategy (a) is simpler and works on Linux/macOS unconditionally. On
# Windows it requires Developer Mode or Administrator -- standard users
# get permission denied. Detect and fall back automatically.

CANONICAL_LATTICE="$CANONICAL/.lattice"
mkdir -p "$CANONICAL_LATTICE"

# If the worktree's .lattice/ already exists with tracked content (e.g., pcc
# tracks handoffs per its CLAUDE.md rule 24), DO NOT attempt the symlink.
# `ln -s TARGET EXISTING_DIR/` creates a nested TARGET symlink INSIDE the
# existing dir instead of failing -- and the resulting working tree shows
# `.lattice/.lattice/` as an untracked entry that blocks session-end.
TRACKED_LATTICE_PRE="$(git -C "$WORKTREE" ls-files .lattice/ 2>/dev/null | head -1)"

SYMLINK_OK=false
if [ -z "$TRACKED_LATTICE_PRE" ]; then
    if ln -s "$CANONICAL_LATTICE" "$WORKTREE/.lattice" 2>/dev/null; then
        if [ -L "$WORKTREE/.lattice" ]; then
            # Verify it actually resolves (some Windows configs create a junction
            # that ln reports as success but doesn't behave as a real symlink).
            if [ -d "$WORKTREE/.lattice" ] && [ -e "$WORKTREE/.lattice/." ]; then
                SYMLINK_OK=true
            fi
        fi
    fi
fi

if [ "$SYMLINK_OK" = "true" ]; then
    echo "  .lattice/ -> $CANONICAL_LATTICE (symlink mode)"
else
    rm -f "$WORKTREE/.lattice" 2>/dev/null || true
    # PRESERVE TRACKED CONTENT: a project may track files inside .lattice/
    # (pcc tracks handoffs per its CLAUDE.md rule 24). rm -rf would surface
    # tracked files as 'D' deletions and block lattice-session-end.sh's
    # clean-tree check. Only remove the dir if it has no tracked content;
    # otherwise leave it in place and let scripts use LATTICE_PROJECT_ROOT
    # for shared state while the worktree's own .lattice/ files stay as
    # ordinary tracked working-tree files.
    TRACKED_LATTICE="$(git -C "$WORKTREE" ls-files .lattice/ 2>/dev/null | head -1)"
    if [ -z "$TRACKED_LATTICE" ]; then
        rm -rf "$WORKTREE/.lattice" 2>/dev/null || true
    fi
    cat <<EOF
WARNING: .lattice/ symlink creation failed.
         Likely cause: Windows without Developer Mode (standard user lacks
         SeCreateSymbolicLinkPrivilege).
         Falling back to env-var mode. The session shell must source
         .lattice-env BEFORE running lattice scripts; CLI invocations of
         scripts should use:
           LATTICE_PROJECT_ROOT="$CANONICAL" bash scripts/<name>.sh
EOF
    printf 'export LATTICE_PROJECT_ROOT=%q\n' "$CANONICAL" > "$WORKTREE/.lattice-env"
    # The .lattice-env file is a per-worktree session artifact, not source
    # we want git to track or surface in `git status`. Add to the
    # worktree's local exclude so it doesn't block lattice-session-end.sh's
    # clean-tree check.
    EXCLUDE_FILE="$WORKTREE/.git/info/exclude"
    if [ ! -f "$EXCLUDE_FILE" ]; then
        # Linked worktrees share .git/info/exclude with the canonical; create
        # the file in either location depending on what git resolves to.
        EXCLUDE_FILE="$(git -C "$WORKTREE" rev-parse --git-path info/exclude 2>/dev/null || true)"
    fi
    if [ -n "$EXCLUDE_FILE" ] && [ -f "$EXCLUDE_FILE" ] && ! grep -qx '\.lattice-env' "$EXCLUDE_FILE"; then
        printf '\n# session-internal artifact (lattice-session-start.sh fallback mode)\n.lattice-env\n' >> "$EXCLUDE_FILE"
    fi
    # Audit log entry so the R0 stop-light observable can count fallback
    # events (one of the five named observables).
    {
        printf '%s\tlattice-session-start\tSYMLINK_FALLBACK\t%s\t%s\t%s\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            "$TOPIC" "$WORKTREE" "$CANONICAL"
    } >> "$CANONICAL_LATTICE/symlink-fallback.log" 2>/dev/null || true
    echo "  .lattice/ via LATTICE_PROJECT_ROOT=$CANONICAL (env-var fallback mode)"
fi

# ── Project setup auto-detection (superpowers Step 3, R2-NI-4 non-fatal) ──
#
# node_modules/ is gitignored -- git worktree add does not copy it. Without
# this step, the new worktree cannot run `npm test` / `npm run build`.
# Failures are NON-FATAL: the worktree is still usable for read-only paths,
# trust-doc edits, and operations that don't need deps. Setting hard-stop
# would defeat the prevention layer (session can't start -> user falls back
# to canonical -> conflation class survives).

run_npm_install() {
    if [ ! -f "$WORKTREE/package.json" ]; then return 0; fi

    local FRONTEND_DIR=""
    # Project may be a monorepo -- detect frontend/ subdir convention.
    if [ -f "$WORKTREE/package.json" ] && grep -q '"name"' "$WORKTREE/package.json" 2>/dev/null; then
        FRONTEND_DIR="$WORKTREE"
    elif [ -d "$WORKTREE/frontend" ] && [ -f "$WORKTREE/frontend/package.json" ]; then
        FRONTEND_DIR="$WORKTREE/frontend"
    else
        return 0
    fi

    if [ "$SKIP_DEPS" = "true" ]; then
        echo "  npm install: SKIPPED (--skip-deps)"
        return 0
    fi

    if [ -n "$REUSE_DEPS" ]; then
        if [ -d "$REUSE_DEPS/node_modules" ]; then
            if ln -s "$REUSE_DEPS/node_modules" "$FRONTEND_DIR/node_modules" 2>/dev/null; then
                echo "  npm install: REUSED from $REUSE_DEPS/node_modules"
                return 0
            else
                echo "  npm install: --reuse-deps symlink failed; falling back to install" >&2
            fi
        else
            echo "  npm install: --reuse-deps target $REUSE_DEPS/node_modules not found; installing fresh" >&2
        fi
    fi

    echo "  npm install: running in $FRONTEND_DIR (cold cache may take ~60s)..."
    if ! ( cd "$FRONTEND_DIR" && npm install --no-audit --no-fund 2>&1 | tail -20 ); then
        echo "WARNING: npm install failed (non-fatal). Worktree is usable for read-only paths." >&2
        echo "         Re-run: bash scripts/lattice-session-start.sh $TOPIC --retry-deps" >&2
        printf '%s\tlattice-session-start\tNPM_INSTALL_FAILED\t%s\t%s\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TOPIC" "$FRONTEND_DIR" \
            >> "$CANONICAL_LATTICE/session-creation-errors.log" 2>/dev/null || true
    fi
}

run_pip_check() {
    # Python projects vary widely on venv handling -- never auto-install.
    # Just notify the user.
    if [ -f "$WORKTREE/requirements.txt" ] || [ -f "$WORKTREE/pyproject.toml" ]; then
        echo "  python: requirements.txt/pyproject.toml detected. Venv setup is per-project;"
        echo "          if your tests need a venv, configure it manually in $WORKTREE."
    fi
}

run_npm_install
run_pip_check

# ── Done ──────────────────────────────────────────────────────

echo ""
echo "Worktree session ready."
echo "  Topic:     $TOPIC"
echo "  Branch:    $BRANCH"
echo "  Path:      $WORKTREE"
echo ""
echo "Next:"
echo "  cd \"$WORKTREE\""
if [ "$SYMLINK_OK" != "true" ]; then
    echo "  source .lattice-env  # required when symlink fallback is active"
fi
if [ "$LAUNCH" = "true" ]; then
    echo "  claude               # launch Claude Code from the worktree"
fi
echo ""
echo "When done:"
echo "  bash scripts/lattice-session-end.sh $TOPIC --merge-back"
