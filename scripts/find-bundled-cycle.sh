#!/bin/bash
# find-bundled-cycle.sh — Find any cycle-state YAML that bundles a given topic.
#
# Usage: bash scripts/find-bundled-cycle.sh <topic>
#   topic: a specific work item ID (e.g. GAP-VEHICLE-2, DATA-GAP-VEH-5-CITATION-HYGIENE)
#          that may be covered by a bundled parent cycle (e.g. gap-vehicle,
#          GAP-VEHICLE-5).
#
# Output (one line per match): <bundled_topic>\t<phase>\t<state_file>
#
# Exit codes:
#   0 — at least one bundled match found (output above)
#   1 — no bundled cycle covers this topic
#
# Why: /lattice:cycle dedup at Step 0a greps decisions.log for the literal
# topic name. But bundled cycles log COMPLETED under the bundle name (e.g.
# "gap-vehicle"), not the child IDs in scope. Re-invoking with a child ID
# misses the dedup and re-runs work that already shipped. This helper closes
# the gap by scanning cycle-state YAMLs.
#
# What gets scanned: ANY YAML list item in the file (lines matching `- `),
# at any nesting depth, under any parent key. The line is matched against
# the topic via THREE patterns:
#
#   1. Whole-item match — `- TOPIC` or `- "TOPIC"`.
#      Covers bare-ID arrays like `scope:` and `known_anchors:`.
#
#   2. Colon-prefix match — `- TOPIC: <description>` or `- "TOPIC: <description>"`.
#      Covers descriptive arrays like `known_gap_anchors:` and the nested
#      `todo_verified.entries:` block (the canonical post-completion record
#      of data-gaps absorbed into the run).
#
#   3. id-field match — `- id: TOPIC` (inside a mapping list item).
#      Covers `bundled_bugs:` and similar mapping-list patterns.
#
# Pre-2026-05-11 the script only scanned the top-level `scope:` array, so a
# child ID listed only in `todo_verified.entries[]` slipped past dedup and
# triggered a re-cycle. See DATA-GAP-VEH-5-CITATION-HYGIENE incident:
# GAP-VEHICLE-5 Phase 0 shipped the cleanup work, but the child ID was not
# in `scope:`, so /lattice:cycle DATA-GAP-VEH-5-CITATION-HYGIENE proceeded
# as if no coverage existed.
#
# Free-text mentions (the topic ID appearing inside a `source:` string, a
# prose `todo:` field, or a comment) are INTENTIONALLY NOT MATCHED — those
# are too prone to false positives ("this cycle was triggered BY topic X"
# vs "this cycle DID topic X's work"). When the work is genuinely bundled,
# authors should list the child ID under a structured list field.

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

    # Awk scans every YAML list item (lines matching `^[[:space:]]*- `) and
    # tests the three match patterns described in the header.
    if awk -v t="$TOPIC" '
        function strip(s) {
            sub(/^[[:space:]]*-[[:space:]]+/, "", s)
            sub(/[[:space:]]*#.*$/, "", s)
            sub(/[[:space:]]+$/, "", s)
            if (s ~ /^".*"$/) { s = substr(s, 2, length(s) - 2) }
            if (s ~ /^'\''.*'\''$/) { s = substr(s, 2, length(s) - 2) }
            return s
        }
        function colon_prefix(s,    p) {
            p = index(s, ":")
            if (p == 0) return s
            s = substr(s, 1, p - 1)
            sub(/[[:space:]]+$/, "", s)
            return s
        }
        /^[[:space:]]*-[[:space:]]/ {
            item = strip($0)
            if (item == t) { found = 1; exit }
            if (colon_prefix(item) == t) { found = 1; exit }
            if (item ~ /^id:[[:space:]]/) {
                v = item
                sub(/^id:[[:space:]]+/, "", v)
                sub(/[[:space:]]+$/, "", v)
                if (v ~ /^".*"$/) { v = substr(v, 2, length(v) - 2) }
                if (v == t) { found = 1; exit }
            }
            next
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
