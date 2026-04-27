#!/bin/bash
# Design-mode preamble gate. Invoked from .claude/settings.json PreToolUse
# Write|Edit hook. Reads $CLAUDE_TOOL_INPUT (set by Claude Code) and the
# .lattice/design-mode.lock state.
#
# Behaviour:
#   - No lock file -> exit 0 (no session, no enforcement).
#   - Lock present and stale (>1h) -> auto-clear, exit 0.
#   - Lock present, preamble=complete -> exit 0 (UI edits unlocked).
#   - Lock present, preamble=pending, target file NOT in scope (not a
#     frontend UI file under frontend/src/** or frontend/e2e/mockups/**)
#     -> exit 0 (out-of-scope edits allowed even mid-session).
#   - Lock present, preamble=pending, target file IN scope -> exit 1
#     (BLOCK with recovery instructions on stderr).
#
# Cooperation: scripts/design-session.sh writes/maintains the lock.

# Resolve to repo root so the lock check runs against the right .lattice/
# directory regardless of where Claude Code fired the hook from. Fall back
# to the script's own location's parent if not in a git repo (the gate
# script lives in scripts/, so .. is the repo root).
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
# If we cannot resolve a repo root at all, exit 0 -- the agent is editing
# something outside any repo, which is unusual but not a design-gate concern.
cd "$REPO_ROOT" 2>/dev/null || exit 0

LOCK=".lattice/design-mode.lock"
STALE_SEC=3600

# No session -> no enforcement
[ ! -f "$LOCK" ] && exit 0

# Auto-expire stale lock
NOW=$(date +%s)
LOCK_TIME=$(stat -c %Y "$LOCK" 2>/dev/null || stat -f %m "$LOCK" 2>/dev/null || echo "$NOW")
LOCK_AGE=$((NOW - LOCK_TIME))
if [ "$LOCK_AGE" -gt "$STALE_SEC" ]; then
  echo "WARN: stale design-mode lock (${LOCK_AGE}s old, max ${STALE_SEC}s); auto-clearing." >&2
  rm -f "$LOCK"
  exit 0
fi

# Preamble complete -> unlocked
PREAMBLE=$(grep "^preamble:" "$LOCK" 2>/dev/null | sed 's/^preamble: *//' | tr -d '[:space:]')
if [ "$PREAMBLE" = "complete" ]; then
  exit 0
fi

# Extract target file path from the tool input JSON
FILE=$(echo "$CLAUDE_TOOL_INPUT" | python -c "import sys,json
try:
    d = json.load(sys.stdin)
    print(d.get('file_path', ''))
except Exception:
    pass
" 2>/dev/null)

# Out-of-scope file -> allow (the gate only blocks UI source/mockup edits)
if ! echo "$FILE" | grep -qE "frontend/(src|e2e/mockups)/.*\.(tsx|html|ts)$"; then
  exit 0
fi

# IN scope, preamble pending -> BLOCK
echo "BLOCKED: design session active; four-block preamble has not been produced." >&2
echo "" >&2
echo "Target file: $FILE" >&2
echo "Lock file:" >&2
sed 's/^/  /' "$LOCK" >&2
echo "" >&2
echo "Recovery (one of the following):" >&2
echo "  (A) Produce the preamble:" >&2
echo "      1. Write blocks 1.1 (analytical question), 1.2 (engine outputs survey)," >&2
echo "         1.3 (spine candidates, persona-mapped), 1.4 (rules in scope) in your" >&2
echo "         response to the user. See commands/lattice/design.md Step 1 for the" >&2
echo "         full structure." >&2
echo "      2. Save the four blocks to a file, e.g.," >&2
echo "         .lattice/design-preamble-<topic>.md" >&2
echo "      3. Run: bash scripts/design-session.sh preamble-done <that-file>" >&2
echo "  (B) Trivial-edit bypass (typo / copy fix / verbatim re-implementation):" >&2
echo "      bash scripts/design-session.sh end" >&2
echo "      (then retry the edit; the gate will not fire)" >&2
echo "" >&2
echo "Failure mode this gate prevents: port-mode redesign -- relocating existing" >&2
echo "UI without engaging engine outputs the existing UI doesn't surface." >&2
echo "Per CLAUDE.md rule 14 (science preservation) and rule 16 (verify empirical" >&2
echo "claims against actual data)." >&2
exit 1
