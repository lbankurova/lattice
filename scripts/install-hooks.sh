#!/bin/bash
#
# Install git hooks from hooks/ into .git/hooks/.
# Uses symlinks on Unix, copies on Windows. Re-run after pulling updates.
#
# Usage:
#   bash scripts/install-hooks.sh                    # install in current repo
#   bash scripts/install-hooks.sh /path/to/project   # install in another repo
#

set -euo pipefail

TARGET_ROOT="${1:-.}"
TARGET_ROOT="$(cd "$TARGET_ROOT" && pwd)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LATTICE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Use project's own hooks/ if it exists, otherwise use lattice framework hooks/
if [ -d "$TARGET_ROOT/hooks" ]; then
    HOOKS_SOURCE="$TARGET_ROOT/hooks"
else
    HOOKS_SOURCE="$LATTICE_ROOT/hooks"
fi

GIT_DIR="$TARGET_ROOT/.git"
HOOKS_DIR="$GIT_DIR/hooks"

if [ ! -d "$GIT_DIR" ]; then
    echo "ERROR: $TARGET_ROOT is not a git repository."
    exit 1
fi

# C5 (2026-05-05): refuse to silently install into the wrong location.
# `git config core.hooksPath` redirects all hook resolution -- if it's set
# (typical: husky, monorepo root, prior framework install), writing to
# .git/hooks/ creates dead hooks that git never executes. The user has to
# either unset the override or run install-hooks.sh against the override
# path explicitly. Silently succeeding here was the prior failure mode.
HOOKS_PATH_OVERRIDE="$(cd "$TARGET_ROOT" && git config --get core.hooksPath 2>/dev/null || true)"
if [ -n "$HOOKS_PATH_OVERRIDE" ] && [ "$HOOKS_PATH_OVERRIDE" != ".git/hooks" ]; then
    echo "ERROR: core.hooksPath is set to '$HOOKS_PATH_OVERRIDE' in $TARGET_ROOT."
    echo "       Writing to $HOOKS_DIR would produce dead hooks (git would still"
    echo "       resolve to the override path)."
    echo ""
    echo "       Fix one of:"
    echo "         (a) git -C \"$TARGET_ROOT\" config --unset core.hooksPath"
    echo "         (b) re-run with the override path:"
    echo "             bash scripts/install-hooks.sh \"$HOOKS_PATH_OVERRIDE/..\""
    if [ -d "$TARGET_ROOT/.githooks" ]; then
        echo "         (c) source-direct model: '$TARGET_ROOT' already has a .githooks/"
        echo "             directory. Skip install-hooks.sh entirely and point git at it:"
        echo "                 git -C \"$TARGET_ROOT\" config core.hooksPath .githooks"
        echo "             Hooks fire from .githooks/ on every commit; no copy step."
    fi
    exit 1
fi

if [ ! -d "$HOOKS_SOURCE" ]; then
    echo "ERROR: No hooks/ directory found at $HOOKS_SOURCE or $LATTICE_ROOT/hooks"
    exit 1
fi

mkdir -p "$HOOKS_DIR"

INSTALLED=0

for HOOK_FILE in "$HOOKS_SOURCE"/*; do
    [ ! -f "$HOOK_FILE" ] && continue

    HOOK_NAME="$(basename "$HOOK_FILE")"

    # Skip non-hook files
    case "$HOOK_NAME" in
        *.json|*.md|*.txt|*.sample) continue ;;
    esac

    DEST="$HOOKS_DIR/$HOOK_NAME"

    # Back up existing non-managed hooks
    if [ -f "$DEST" ] && ! grep -q "# managed-by: install-hooks.sh" "$DEST" 2>/dev/null; then
        echo "  Backing up existing $HOOK_NAME -> $HOOK_NAME.bak"
        cp "$DEST" "$DEST.bak"
    fi

    # Copy with marker after shebang (works on all platforms)
    SHEBANG=$(head -1 "$HOOK_FILE")
    {
        echo "$SHEBANG"
        echo "# managed-by: install-hooks.sh -- re-run to update"
        echo "# source: $HOOK_FILE"
        tail -n +2 "$HOOK_FILE"
    } > "$DEST"
    chmod +x "$DEST"
    echo "  Installed: $HOOK_NAME (from $HOOKS_SOURCE)"
    INSTALLED=$((INSTALLED + 1))
done

echo ""
echo "Done. $INSTALLED hook(s) installed in $HOOKS_DIR"
echo "Source: $HOOKS_SOURCE"
