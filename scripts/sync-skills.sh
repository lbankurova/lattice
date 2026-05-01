#!/bin/bash
# sync-skills.sh — Copy framework skills to a target project
#
# Usage: bash scripts/sync-skills.sh <project-root>
#   e.g.: bash scripts/sync-skills.sh C:/pg/pcc
#
# Modes:
#   1. Full sync (default, manual invocation)
#      Copies the entire framework skill/script tree into the project.
#      Used for onboarding a new project.
#
#   2. Incremental sync (FRAMEWORK_CHANGED_FILES env var set)
#      Only copies the named files (lattice-relative paths, newline-
#      separated). Used by the post-commit hook to copy only what THIS
#      commit actually changed -- so files lattice did not touch are
#      never overwritten.
#
# Clobber protection (both modes, when target is a git repo):
#   For each destination file, run `git diff --quiet HEAD -- <dst>` in the
#   target repo. If the working tree differs from HEAD (uncommitted edit
#   from a parallel session), the copy is SKIPPED and the path is logged
#   to <target>/.lattice/sync-skip.log. The next clean-state sync will
#   retry automatically.
#
# Synced paths:
#   commands/lattice/X.md      -> <project>/.claude/commands/lattice/X.md
#   commands/ops/X.md          -> <project>/.claude/commands/ops/X.md
#   agents/X.md                -> <project>/.claude/agents/X.md
#   docs/skills-includes/X.md  -> <project>/docs/skills-includes/X.md
#   scripts/X.{sh,py}          -> <project>/scripts/X.{sh,py}
#                                 (excluding sync-skills.sh itself)

set -euo pipefail

FRAMEWORK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${1:-}" ]; then
    echo "Usage: sync-skills.sh <project-root>"
    echo "  e.g.: bash scripts/sync-skills.sh C:/pg/pcc"
    exit 1
fi

TARGET="$1"

if [ ! -d "$TARGET" ]; then
    echo "ERROR: $TARGET does not exist"
    exit 1
fi

# --- Path mapping: lattice-relative source -> target-relative destination.
# Returns empty string if the source is not a synced path.
map_to_dst() {
    local src="$1"
    local base
    base="$(basename "$src")"
    case "$src" in
        commands/lattice/*.md)     echo ".claude/commands/lattice/$base" ;;
        commands/ops/*.md)         echo ".claude/commands/ops/$base" ;;
        agents/*.md)               echo ".claude/agents/$base" ;;
        docs/skills-includes/*.md) echo "docs/skills-includes/$base" ;;
        scripts/*.sh|scripts/*.py)
            if [ "$base" = "sync-skills.sh" ]; then
                echo ""  # framework-only, never propagate
            else
                echo "scripts/$base"
            fi
            ;;
        *) echo "" ;;  # not a synced path
    esac
}

# --- Clobber check: returns 0 (safe to copy) if dst is clean vs HEAD,
# or if target is not a git repo (no protection possible -- proceed).
# Returns 1 (skip) if dst has uncommitted changes.
SKIP_LOG_DIR="$TARGET/.lattice"
SKIP_LOG="$SKIP_LOG_DIR/sync-skip.log"

is_clobber_safe() {
    local dst_rel="$1"
    if ! git -C "$TARGET" rev-parse --git-dir >/dev/null 2>&1; then
        return 0  # not a git repo -- nothing to protect
    fi
    if git -C "$TARGET" diff --quiet HEAD -- "$dst_rel" 2>/dev/null; then
        return 0  # clean
    fi
    return 1  # dirty
}

log_skip() {
    local dst_rel="$1"
    local reason="$2"
    mkdir -p "$SKIP_LOG_DIR"
    printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$dst_rel" "$reason" >> "$SKIP_LOG"
}

# --- Copy one source file to the mapped destination. Returns:
#   0 = copied, 1 = skipped (clobber), 2 = not a synced path
copy_one() {
    local src_rel="$1"
    local dst_rel
    dst_rel="$(map_to_dst "$src_rel")"
    if [ -z "$dst_rel" ]; then
        return 2
    fi
    local src_abs="$FRAMEWORK_ROOT/$src_rel"
    local dst_abs="$TARGET/$dst_rel"
    if [ ! -f "$src_abs" ]; then
        # source removed in this commit -- nothing to copy (sync does not delete)
        return 2
    fi
    if ! is_clobber_safe "$dst_rel"; then
        log_skip "$dst_rel" "uncommitted-pcc-change"
        return 1
    fi
    mkdir -p "$(dirname "$dst_abs")"
    cp "$src_abs" "$dst_abs"
    return 0
}

# --- Mode 2: incremental sync, driven by FRAMEWORK_CHANGED_FILES.
if [ -n "${FRAMEWORK_CHANGED_FILES:-}" ]; then
    copied=0; skipped=0; ignored=0
    while IFS= read -r src_rel; do
        [ -z "$src_rel" ] && continue
        copy_one "$src_rel" && rc=0 || rc=$?
        case $rc in
            0) copied=$((copied + 1)) ;;
            1) skipped=$((skipped + 1)) ;;
            *) ignored=$((ignored + 1)) ;;
        esac
    done <<< "$FRAMEWORK_CHANGED_FILES"
    echo "  incremental: $copied copied, $skipped skipped (clobber-safe), $ignored not-synced"
    if [ $skipped -gt 0 ]; then
        echo "  see: $SKIP_LOG"
    fi
    echo ""
    echo "Synced to $TARGET"
    exit 0
fi

# --- Mode 1: full sync (manual invocation). Walk the framework tree.
COMMANDS_DIR="$TARGET/.claude/commands"
AGENTS_DIR="$TARGET/.claude/agents"
mkdir -p "$COMMANDS_DIR/lattice" "$COMMANDS_DIR/ops"

run_full_sync() {
    local label="$1"; shift
    local glob_dir="$1"; shift
    local count=0 skipped=0 rc=0
    if [ ! -d "$glob_dir" ]; then
        echo "  $label: 0 (no source dir)"
        return
    fi
    shopt -s nullglob
    for f in "$glob_dir"/*; do
        [ -f "$f" ] || continue
        local src_rel="${f#$FRAMEWORK_ROOT/}"
        copy_one "$src_rel" && rc=0 || rc=$?
        case $rc in
            0) count=$((count + 1)) ;;
            1) skipped=$((skipped + 1)) ;;
        esac
    done
    shopt -u nullglob
    if [ $skipped -gt 0 ]; then
        echo "  $label: $count copied, $skipped skipped (clobber-safe)"
    else
        echo "  $label: $count"
    fi
}

# Note: full-sync uses the same per-file copy path (and clobber check) as
# incremental, so a manually-triggered onboarding sync also respects
# uncommitted pcc edits.
run_full_sync "lattice " "$FRAMEWORK_ROOT/commands/lattice"
run_full_sync "ops     " "$FRAMEWORK_ROOT/commands/ops"
[ -d "$FRAMEWORK_ROOT/agents" ] && run_full_sync "agents  " "$FRAMEWORK_ROOT/agents"
[ -d "$FRAMEWORK_ROOT/docs/skills-includes" ] && run_full_sync "partners" "$FRAMEWORK_ROOT/docs/skills-includes"

# Scripts: walk both .sh and .py, defer to copy_one's mapping for
# sync-skills.sh exclusion.
SCRIPTS_DIR="$TARGET/scripts"
mkdir -p "$SCRIPTS_DIR"
script_count=0; script_skipped=0; rc=0
shopt -s nullglob
for f in "$FRAMEWORK_ROOT"/scripts/*.sh "$FRAMEWORK_ROOT"/scripts/*.py; do
    src_rel="${f#$FRAMEWORK_ROOT/}"
    copy_one "$src_rel" && rc=0 || rc=$?
    case $rc in
        0) script_count=$((script_count + 1)) ;;
        1) script_skipped=$((script_skipped + 1)) ;;
    esac
done
shopt -u nullglob
if [ $script_skipped -gt 0 ]; then
    echo "  scripts : $script_count copied, $script_skipped skipped (clobber-safe)"
else
    echo "  scripts : $script_count"
fi

echo ""
echo "Synced to $TARGET"
