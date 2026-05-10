#!/bin/bash
#
# Install git hooks from hooks/ into .git/hooks/.
# Uses symlinks on Unix, copies on Windows. Re-run after pulling updates.
#
# Usage:
#   bash scripts/install-hooks.sh                       # install git hooks
#   bash scripts/install-hooks.sh /path/to/project      # in another repo
#   bash scripts/install-hooks.sh --enable-r0           # ALSO register the
#                                                       # require-worktree
#                                                       # PreToolUse hook in
#                                                       # .claude/settings.json
#                                                       # (R0 worktree
#                                                       # isolation enforcement;
#                                                       # only run after R1
#                                                       # stop-light passes)
#

set -euo pipefail

TARGET_ROOT="."
ENABLE_R0=false
for arg in "$@"; do
    case "$arg" in
        --enable-r0) ENABLE_R0=true ;;
        --*) echo "ERROR: unknown flag '$arg'" >&2; exit 1 ;;
        *) TARGET_ROOT="$arg" ;;
    esac
done
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
SKIP_GIT_HOOKS=false
if [ -n "$HOOKS_PATH_OVERRIDE" ] && [ "$HOOKS_PATH_OVERRIDE" != ".git/hooks" ]; then
    if [ "$ENABLE_R0" = "true" ]; then
        # R0 registration only patches .claude/settings.json, independent of
        # git hooks. If the project manages its git hooks via core.hooksPath
        # (e.g., pcc's .githooks/ directory), skip the git-hook copy step
        # but still proceed to the R0 PreToolUse registration below.
        echo "NOTE: core.hooksPath is '$HOOKS_PATH_OVERRIDE' -- skipping git-hook copy step"
        echo "      (project manages git hooks elsewhere). Proceeding to R0 registration only."
        SKIP_GIT_HOOKS=true
    else
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
        echo ""
        echo "       For R0-only registration (no git-hook install), pass --enable-r0:"
        echo "         bash scripts/install-hooks.sh \"$TARGET_ROOT\" --enable-r0"
        exit 1
    fi
fi

if [ "$SKIP_GIT_HOOKS" = "false" ]; then
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
fi  # end SKIP_GIT_HOOKS guard

# ── Worktree-isolation R0: optional PreToolUse hook registration ──
#
# Per worktree-isolation-synthesis.md, the require-worktree.sh hook is only
# safe to register AFTER R1 (autopilot beachhead) clears five named
# observables (zero orphan worktrees > 24h, zero non-FF aborts, zero
# .lattice/ symlink failures or audited fallback, zero session-creation
# failures, hook block-event count > 0 confirming the hook fires). The
# --enable-r0 flag is the operational gate: invoking it is the user's
# attestation that R1 has cleared.
#
# When invoked WITHOUT --enable-r0 (default), this section is skipped --
# the hook stays as a built artifact at hooks/preToolUse/require-worktree.sh
# but is NOT registered in .claude/settings.json.

if [ "$ENABLE_R0" = "true" ]; then
    SETTINGS="$TARGET_ROOT/.claude/settings.json"
    HOOK_REL="hooks/preToolUse/require-worktree.sh"

    if [ ! -f "$SETTINGS" ]; then
        echo "ERROR: $SETTINGS not found; cannot register R0 hook." >&2
        echo "       The project needs a .claude/settings.json with at least an empty" >&2
        echo "       hooks.PreToolUse array before --enable-r0 can patch it." >&2
        exit 1
    fi

    HOOK_SOURCE="$LATTICE_ROOT/hooks/preToolUse/require-worktree.sh"
    if [ ! -f "$HOOK_SOURCE" ]; then
        echo "ERROR: require-worktree.sh not found at $HOOK_SOURCE." >&2
        exit 1
    fi

    # Copy the hook script into the target so the PreToolUse command can
    # resolve it via $ROOT/hooks/preToolUse/require-worktree.sh. (We
    # cannot reference lattice's copy via absolute path because lattice's
    # location is per-machine; the hook command is committed to the
    # project's .claude/settings.json and must work for everyone who clones
    # the project.) Skip when source == target (running install-hooks
    # against lattice itself).
    TARGET_HOOK_DIR="$TARGET_ROOT/hooks/preToolUse"
    TARGET_HOOK_PATH="$TARGET_HOOK_DIR/require-worktree.sh"
    HOOK_SOURCE_REAL="$(cd "$(dirname "$HOOK_SOURCE")" && pwd)/$(basename "$HOOK_SOURCE")"
    if [ -f "$TARGET_HOOK_PATH" ]; then
        TARGET_HOOK_REAL="$(cd "$(dirname "$TARGET_HOOK_PATH")" && pwd)/$(basename "$TARGET_HOOK_PATH")"
    else
        TARGET_HOOK_REAL=""
    fi
    if [ "$HOOK_SOURCE_REAL" = "$TARGET_HOOK_REAL" ]; then
        echo "  require-worktree.sh source == target (lattice self-install) -- skipping copy"
    else
        mkdir -p "$TARGET_HOOK_DIR"
        cp "$HOOK_SOURCE" "$TARGET_HOOK_PATH"
        chmod +x "$TARGET_HOOK_PATH"
        echo "  Copied require-worktree.sh -> $TARGET_HOOK_DIR/"
    fi

    # Idempotent registration: refuse to add a second matcher for the same
    # hook command. Detection uses python (available on all lattice
    # consumer projects per lattice-project-spec.md [runtime] python).
    PYTHON="${PYTHON:-python}"
    if ! command -v "$PYTHON" >/dev/null 2>&1; then
        PYTHON="python3"
    fi

    if ! command -v "$PYTHON" >/dev/null 2>&1; then
        echo "ERROR: python required to patch settings.json idempotently; not found." >&2
        exit 1
    fi

    # Patch script reads settings.json, adds two PreToolUse matcher entries
    # if absent, writes back. Both matchers dispatch to the same script;
    # they must be ordered BEFORE the existing commit-lock matcher so users
    # see the structural fix message before the lock-contention message
    # (probe Target 1 in synthesis).
    #
    # Hook command uses git-rev-parse to resolve the repo root at fire time,
    # not a relative path. This is the same pattern pcc uses for the
    # design-mode-gate entry -- the comment there documents that relative-
    # path hook commands silently fail to fire on Windows (VERIFY-DS-01).
    HOOK_CMD="bash -c 'ROOT=\"\$(git rev-parse --show-toplevel 2>/dev/null || pwd)\"; bash \"\$ROOT/$HOOK_REL\"'" \
    SETTINGS_PATH="$SETTINGS" \
    "$PYTHON" - <<'PYEOF'
import json
import os
import sys

settings_path = os.environ["SETTINGS_PATH"]
hook_cmd = os.environ["HOOK_CMD"]

with open(settings_path, "r", encoding="utf-8") as f:
    config = json.load(f)

config.setdefault("hooks", {}).setdefault("PreToolUse", [])
existing = config["hooks"]["PreToolUse"]

def has_matcher(matcher_pattern, command):
    for entry in existing:
        if entry.get("matcher") == matcher_pattern:
            for h in entry.get("hooks", []):
                if h.get("command") == command:
                    return True
    return False

new_matchers = [
    ("Edit|Write", hook_cmd),
    ("Bash(git add*|git commit*|git stash*)", hook_cmd),
]

added = 0
for matcher, cmd in new_matchers:
    if has_matcher(matcher, cmd):
        continue
    new_entry = {
        "matcher": matcher,
        "hooks": [{
            "type": "command",
            "command": cmd,
            "_comment": "Worktree-isolation R0. BLOCKS Edit/Write/Bash(git add|commit|stash) at canonical root unless allowlisted or exempted. See .lattice/worktree-isolation-protocol.md.",
        }],
    }
    # Insert at BEGINNING of array (probe Target 1: fire before commit-lock).
    existing.insert(0, new_entry)
    added += 1

if added > 0:
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
        f.write("\n")
    print(f"  Registered {added} require-worktree matcher(s) in {settings_path}")
else:
    print(f"  require-worktree matchers already registered in {settings_path}")

PYEOF

    echo ""
    echo "R0 worktree isolation: ENABLED in $TARGET_ROOT/.claude/settings.json"
    echo "  The hook will fire on Edit/Write/Bash(git add|commit|stash) at canonical root."
    echo "  See .lattice/worktree-isolation-protocol.md for the full contract."
    echo "  To disable: edit .claude/settings.json and remove the require-worktree entries."
fi
