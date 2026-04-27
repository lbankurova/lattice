#!/bin/bash
# sync-skills.sh — Copy framework skills to a target project
#
# Usage: bash scripts/sync-skills.sh <project-root>
#   e.g.: bash scripts/sync-skills.sh C:/pg/pcc
#
# Copies commands/lattice/ and commands/ops/ to <project>/.claude/commands/
# Also copies agents/ to <project>/.claude/agents/ if it exists

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
