#!/bin/bash
# find-bundled-cycle.sh — Find any cycle-state YAML that bundles a given topic.
#
# Usage: bash scripts/find-bundled-cycle.sh <topic>
#   topic: a specific work item ID (e.g. GAP-VEHICLE-2) that may be
#          covered by a bundled parent cycle (e.g. gap-vehicle).
#
# Output (one line per match): <bundled_topic>\t<phase>\t<state_file>
#
# Exit codes:
#   0 — at least one bundled match found (output above)
#   1 — no bundled cycle covers this topic
#
# Why: /lattice:cycle dedup at Step 0a greps decisions.log for the literal
# topic name. But bundled cycles log COMPLETED under the bundle name (e.g.
# "gap-vehicle"), not the GAP IDs in scope. Re-invoking with a child GAP ID
# misses the dedup and re-runs work that already shipped. This helper closes
# the gap by scanning cycle-state YAMLs' `scope:` arrays.
#
# Cycle-state YAML scope block looks like:
#   scope:
#     - GAP-VEHICLE-2  # comment
#     - GAP-VEHICLE-3
#   <next-top-level-key>:

set -euo pipefail

LATTICE_ROOT="${LATTICE_PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
TOPIC="${1:?Usage: find-bundled-cycle.sh <topic>}"
STATE_DIR="$LATTICE_ROOT/.lattice/cycle-state"

[ -d "$STATE_DIR" ] || exit 1

found=0
for f in "$STATE_DIR"/*.yaml; do
    [ -f "$f" ] || continue
    # Skip exact-name match — caller already checks {topic}.yaml directly.
    base=$(basename "$f" .yaml)
    if [ "$base" = "$TOPIC" ]; then continue; fi

    # Awk extracts the scope: block and tests for membership.
    if awk -v t="$TOPIC" '
        BEGIN { in_scope = 0; found = 0 }
        /^scope:[[:space:]]*$/ { in_scope = 1; next }
        /^[^[:space:]#]/ && in_scope { in_scope = 0 }
        in_scope {
            line = $0
            sub(/[[:space:]]*#.*$/, "", line)
            sub(/^[[:space:]]*-[[:space:]]+/, "", line)
            sub(/[[:space:]]+$/, "", line)
            if (line == t) { found = 1; exit }
        }
        END { exit !found }
    ' "$f"; then
        bundled_topic=$(awk '/^topic:[[:space:]]/ {sub(/^topic:[[:space:]]+/,""); print; exit}' "$f")
        phase=$(awk '/^phase:[[:space:]]/ {sub(/^phase:[[:space:]]+/,""); print; exit}' "$f")
        [ -n "$bundled_topic" ] || bundled_topic="$base"
        [ -n "$phase" ] || phase="unknown"
        printf '%s\t%s\t%s\n' "$bundled_topic" "$phase" "$f"
        found=1
    fi
done

[ $found -eq 1 ]
