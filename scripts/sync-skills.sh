#!/bin/bash
# sync-skills.sh — Copy framework skills to a target project
#
# Usage: bash scripts/sync-skills.sh <project-root>
#   e.g.: bash scripts/sync-skills.sh C:/pg/pcc
#
# Copies:
#   commands/lattice/      -> <project>/.claude/commands/lattice/
#   commands/ops/          -> <project>/.claude/commands/ops/
#   agents/                -> <project>/.claude/agents/
#   docs/skills-includes/  -> <project>/docs/skills-includes/
#   scripts/*.{sh,py}      -> <project>/scripts/   (excluding sync-skills.sh itself)

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

COMMANDS_DIR="$TARGET/.claude/commands"
AGENTS_DIR="$TARGET/.claude/agents"

mkdir -p "$COMMANDS_DIR/lattice" "$COMMANDS_DIR/ops"

# Sync lattice skills
count=0
for f in "$FRAMEWORK_ROOT"/commands/lattice/*.md; do
    cp "$f" "$COMMANDS_DIR/lattice/"
    count=$((count + 1))
done
echo "  lattice: $count skills"

# Sync ops commands
count=0
for f in "$FRAMEWORK_ROOT"/commands/ops/*.md; do
    cp "$f" "$COMMANDS_DIR/ops/"
    count=$((count + 1))
done
echo "  ops:     $count commands"

# Sync agents if they exist
if [ -d "$FRAMEWORK_ROOT/agents" ]; then
    mkdir -p "$AGENTS_DIR"
    count=0
    for f in "$FRAMEWORK_ROOT"/agents/*.md; do
        cp "$f" "$AGENTS_DIR/"
        count=$((count + 1))
    done
    echo "  agents:  $count agents"
fi

# Sync skill partner files (docs/skills-includes/) if they exist.
# These are skill prompt fragments referenced by skills via path
# (e.g., commands/lattice/review.md -> docs/skills-includes/review-protocols.md).
# They live OUTSIDE commands/ so Claude Code's skill auto-discovery
# doesn't surface them as standalone skills, but they must still be
# present at the referenced path in the consumer project. Without this
# sync, a skill that points to a partner file would resolve to a
# missing path in the project (broken pointer).
if [ -d "$FRAMEWORK_ROOT/docs/skills-includes" ]; then
    SKILL_INCLUDES_DIR="$TARGET/docs/skills-includes"
    mkdir -p "$SKILL_INCLUDES_DIR"
    count=0
    shopt -s nullglob
    for f in "$FRAMEWORK_ROOT"/docs/skills-includes/*.md; do
        cp "$f" "$SKILL_INCLUDES_DIR/"
        count=$((count + 1))
    done
    shopt -u nullglob
    echo "  partners: $count skill-include files"
fi

# Sync scripts (lock, merge, validation ratchet, audits, linters).
# Both .sh and .py extensions propagate. Python audit/lint scripts
# (audit-knowledge-graph.py, lint-knowledge.py, etc.) are framework-tier
# when their logic operates on documented file conventions; they belong
# in lattice/scripts/ and sync down to projects that adopt those conventions.
SCRIPTS_DIR="$TARGET/scripts"
mkdir -p "$SCRIPTS_DIR"
count=0
shopt -s nullglob
for f in "$FRAMEWORK_ROOT"/scripts/*.sh "$FRAMEWORK_ROOT"/scripts/*.py; do
    basename=$(basename "$f")
    # Don't overwrite sync-skills.sh in target (it's framework-only)
    if [ "$basename" = "sync-skills.sh" ]; then
        continue
    fi
    cp "$f" "$SCRIPTS_DIR/"
    count=$((count + 1))
done
shopt -u nullglob
echo "  scripts: $count scripts"

echo ""
echo "Synced to $TARGET"
