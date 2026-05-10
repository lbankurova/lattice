#!/bin/bash
# Design session state machine.
#
# Cooperates with the design-mode-gate.sh PreToolUse hook to enforce the
# /lattice:design Step 1 four-block first-principles preamble before any
# UI edit. The hook reads the lock file written here; the lock file's
# `preamble:` field gates Write/Edit on frontend/{src,e2e/mockups}/*.tsx|html|ts.
#
# Failure mode this gate prevents: port-mode redesign — relocating
# existing UI structure without engaging engine outputs (syndromes,
# organ records, recovery verdicts, evidence-quality grades) that the
# existing UI doesn't surface. See commands/lattice/design.md Step 1.
#
# Usage:
#   bash scripts/design-session.sh begin "<trigger description>"
#       -> writes .lattice/design-mode.lock with status=started, preamble=pending
#   bash scripts/design-session.sh preamble-done <evidence-file>
#       -> verifies the file has all four block markers (1.1, 1.2, 1.3, 1.4)
#          and flips preamble=complete; UI edits unlocked
#   bash scripts/design-session.sh end
#       -> removes the lock
#   bash scripts/design-session.sh status
#       -> prints lock contents (or "no active session")
#
# Exit codes: 0 on success; 1 on user error (missing args, file not found,
# block markers missing, etc.).

set -e

# Resolve to repo root so .lattice/design-mode.lock always lands in the
# right place regardless of caller's cwd. git rev-parse covers the normal
# case; the dirname fallback covers the rare case where the script is run
# from outside any git repo (we still want it to write into the repo this
# script lives in, which is two levels up: scripts/ -> repo).
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT" || { echo "ERROR: cannot resolve repo root for design session script." >&2; exit 1; }

# D1 worktree-aware: design-mode lock lives in shared lattice state. From a
# session worktree in env-var fallback mode, redirect to canonical.
LATTICE_ROOT="${LATTICE_PROJECT_ROOT:-$REPO_ROOT}"
LOCK="$LATTICE_ROOT/.lattice/design-mode.lock"

ensure_lattice_dir() {
  mkdir -p "$LATTICE_ROOT/.lattice"
}

case "$1" in
  begin)
    ensure_lattice_dir
    TRIGGER="${2:-unspecified}"
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    cat > "$LOCK" <<EOF
status: started
started_at: $NOW
trigger: $TRIGGER
preamble: pending
EOF
    echo "Design session started."
    echo "Trigger: $TRIGGER"
    echo ""
    echo "Four-block preamble required before any UI edit (frontend/src/**, frontend/e2e/mockups/**)."
    echo "After writing blocks 1.1 (analytical question), 1.2 (engine outputs survey),"
    echo "1.3 (spine candidates), 1.4 (rules in scope), save them to a file (e.g.,"
    echo ".lattice/design-preamble-<topic>.md) and run:"
    echo ""
    echo "  bash scripts/design-session.sh preamble-done <that-file>"
    ;;

  preamble-done)
    if [ ! -f "$LOCK" ]; then
      echo "ERROR: no design session is active." >&2
      echo "Start one first: bash scripts/design-session.sh begin \"<trigger>\"" >&2
      exit 1
    fi
    EVIDENCE="$2"
    if [ -z "$EVIDENCE" ]; then
      echo "Usage: $0 preamble-done <path-to-evidence-file>" >&2
      echo "Evidence file must contain markers for all four blocks (1.1, 1.2, 1.3, 1.4)." >&2
      exit 1
    fi
    if [ ! -f "$EVIDENCE" ]; then
      echo "ERROR: evidence file '$EVIDENCE' does not exist." >&2
      exit 1
    fi
    MISSING=""
    for block in "1.1" "1.2" "1.3" "1.4"; do
      if ! grep -q "$block" "$EVIDENCE"; then
        MISSING="$MISSING $block"
      fi
    done
    if [ -n "$MISSING" ]; then
      echo "ERROR: evidence file missing block marker(s):$MISSING" >&2
      echo "Each of 1.1, 1.2, 1.3, 1.4 must appear as a heading or label in the file." >&2
      exit 1
    fi
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    # Rewrite the lock file with preamble=complete
    STATUS=$(grep "^status:" "$LOCK" | sed 's/^status: *//')
    STARTED=$(grep "^started_at:" "$LOCK" | sed 's/^started_at: *//')
    TRIGGER=$(grep "^trigger:" "$LOCK" | sed 's/^trigger: *//')
    cat > "$LOCK" <<EOF
status: $STATUS
started_at: $STARTED
trigger: $TRIGGER
preamble: complete
preamble_evidence: $EVIDENCE
preamble_completed_at: $NOW
EOF
    echo "Preamble accepted. UI edits unlocked."
    echo "Evidence: $EVIDENCE"
    ;;

  end)
    if [ -f "$LOCK" ]; then
      rm -f "$LOCK"
      echo "Design session ended. Lock cleared."
    else
      echo "No active design session."
    fi
    ;;

  status)
    if [ -f "$LOCK" ]; then
      cat "$LOCK"
    else
      echo "No active design session."
    fi
    ;;

  *)
    echo "Usage: $0 {begin <trigger>|preamble-done <evidence-file>|end|status}" >&2
    echo "" >&2
    echo "See commands/lattice/design.md Step 1 for the four-block preamble structure." >&2
    exit 1
    ;;
esac
