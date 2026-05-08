#!/bin/bash
# post-commit-render-once.sh — Auto re-render synced skill bodies after a
# project-side commit that touched `lattice-project.toml` or `skill-content/`.
#
# This script is the consumer-side counterpart to lattice's own post-commit
# hook (which fires sync-skills + resync after EVERY lattice commit). When a
# project author edits their own manifest values or content files locally,
# the lattice-side hook does NOT fire — those edits never travel through a
# lattice commit. Without this script, the synced .claude/commands/*.md
# bodies stay frozen at the values they had at last sync.
#
# Wire-up (consumer side):
#   1. Set LATTICE_ROOT in your shell environment, OR set it inside this
#      script via the LATTICE_ROOT_DEFAULT below.
#   2. Either:
#      (a) Invoke from your project's existing post-commit hook:
#          bash "$LATTICE_ROOT/scripts/post-commit-render-once.sh"
#      (b) Symlink as the post-commit hook directly:
#          ln -s "$LATTICE_ROOT/scripts/post-commit-render-once.sh" .git/hooks/post-commit
#      (c) If the project uses core.hooksPath (e.g., .githooks/), chain
#          this script from the existing post-commit.
#
# Trigger paths (script no-ops unless any of these match in the just-
# committed diff):
#   - lattice-project.toml          (manifest values)
#   - lattice-platform.toml         (platform-pack values)
#   - **/skill-content/**           (any include-target file under any
#                                    skill-content/ directory)
#
# Convention requirement (lattice-project-spec.md §3.2): every {{include:
# project.X.Y}} target path declared in lattice-project.toml MUST resolve
# to a path matching glob **/skill-content/**. Include targets placed
# elsewhere will render correctly when `lattice render-once` runs but
# will NOT auto-trigger this hook -- the consumer must invoke render-once
# manually. Parsing TOML from bash to detect arbitrary include paths was
# considered and rejected: the path-based convention is simpler and keeps
# the hook reliable.
#
# What it runs when triggered:
#   $ lattice render-once <project-root>
#   (equivalent to: bash <lattice>/scripts/sync-skills.sh <project> +
#    node <lattice>/executor/dist/cli.js resync <project>)
#
# Exit semantics:
#   0 — no-op (no trigger paths in this commit) OR render-once succeeded
#   1 — render-once reported errors (logged to stderr; commit is NOT
#       reverted, but the consumer should investigate before invoking
#       any synced skill)

set -uo pipefail

# Default lattice install location -- override by exporting LATTICE_ROOT
# before invoking, or by editing this line for a single-project deploy.
LATTICE_ROOT_DEFAULT=""

LATTICE_ROOT="${LATTICE_ROOT:-$LATTICE_ROOT_DEFAULT}"

if [ -z "$LATTICE_ROOT" ]; then
    echo "[render-once] SKIPPED: LATTICE_ROOT is unset and LATTICE_ROOT_DEFAULT is empty." >&2
    echo "[render-once]          Set LATTICE_ROOT in your environment or edit this script." >&2
    exit 0
fi

if [ ! -d "$LATTICE_ROOT" ]; then
    echo "[render-once] SKIPPED: LATTICE_ROOT=$LATTICE_ROOT does not exist." >&2
    exit 0
fi

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$PROJECT_ROOT" ]; then
    echo "[render-once] SKIPPED: not inside a git working tree." >&2
    exit 0
fi

# Detect whether HEAD touched any trigger path. Walk the commit diff via
# `git show --name-only HEAD` (works for the very first commit too).
CHANGED=$(git -C "$PROJECT_ROOT" show --name-only --format= HEAD 2>/dev/null || true)

TRIGGERED=0
while IFS= read -r path; do
    [ -z "$path" ] && continue
    case "$path" in
        lattice-project.toml|lattice-platform.toml)
            TRIGGERED=1
            break
            ;;
        */skill-content/*|skill-content/*)
            TRIGGERED=1
            break
            ;;
    esac
done <<< "$CHANGED"

if [ "$TRIGGERED" -eq 0 ]; then
    # No trigger paths in this commit; nothing to do.
    exit 0
fi

CLI_JS="$LATTICE_ROOT/executor/dist/cli.js"
if [ ! -f "$CLI_JS" ]; then
    echo "[render-once] SKIPPED: $CLI_JS not built. Run 'cd $LATTICE_ROOT/executor && npm run build' first." >&2
    exit 0
fi

echo "[render-once] HEAD touched manifest or skill-content; re-rendering synced skill bodies..." >&2
node "$CLI_JS" render-once "$PROJECT_ROOT" 2>&1 | sed 's/^/[render-once] /' >&2
RC=${PIPESTATUS[0]}

if [ "$RC" -ne 0 ]; then
    echo "[render-once] WARNING: render-once exited with code $RC. Investigate before invoking synced skills." >&2
    exit 1
fi

exit 0
