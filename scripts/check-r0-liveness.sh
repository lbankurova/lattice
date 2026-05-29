#!/bin/bash
# check-r0-liveness.sh -- liveness canary for the R0 worktree-isolation hook.
#
# Exercises hooks/preToolUse/require-worktree.sh through the EXACT production
# interface (stdin JSON payload + the PreToolUse exit-code contract) and asserts
# it still discriminates BLOCK (exit 2) from PERMIT (exit 0). This is the
# interface-drift-proof catch for the failure modes that left R0 silently dead
# 2026-05-16..2026-05-29 (BUG-009 / INFRA-03):
#   - interface drift   : hook reads env vars while the host sends stdin JSON
#                         -> hook sees empty input -> permits everything
#   - exit-code drift   : hook exits 1 while the host treats only 2 as a block
#                         -> "block" is a non-blocking warning
#   - blanket regression: hook permits (or blocks) everything
#
# Unlike eyeballing .lattice/require-worktree-block.log for accumulation (the
# original observable #5, which a dead-but-quiet gate passes), this ACTIVELY
# drives the hook and checks the result -- a dead hook fails the self-test.
#
# cwd-independent: the BLOCK probe uses an absolute non-allowlisted path under
# the canonical root, so it fires via prong A (cwd == canonical) OR prong B
# (file_path resolves into canonical from a worktree). The PERMIT probe uses an
# allowlisted .lattice/ path. The canary therefore gives the right verdict from
# canonical root AND from a linked worktree.
#
# Usage:  bash scripts/check-r0-liveness.sh [--quiet]
# Exit:   0 = hook healthy (enforcing);  1 = hook NOT enforcing (alert).
#   --quiet : print nothing on success; print the diagnosis on failure.
#
# Per INFRA-03 (BUG-009 retro Q5.4). See .lattice/worktree-isolation-protocol.md
# "Interface drift (FIX-03)".

set -uo pipefail

QUIET=0
for a in "$@"; do [ "$a" = "--quiet" ] && QUIET=1; done
say() { [ "$QUIET" -eq 1 ] || echo "$@"; }

GIT_COMMON="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$GIT_COMMON" ]; then
    echo "check-r0-liveness: not in a git repo -- skipping." >&2
    exit 0
fi
CANON="$(cd "$GIT_COMMON" && cd .. && pwd -P)"
HOOK="$CANON/hooks/preToolUse/require-worktree.sh"

if [ ! -f "$HOOK" ]; then
    echo "check-r0-liveness: R0 hook NOT FOUND at $HOOK" >&2
    echo "  The worktree-isolation hook is missing entirely -- R0 is not deployed." >&2
    exit 1
fi

# Sentinel string in probe paths so log readers can filter canary-induced
# block entries from real ones in .lattice/require-worktree-block.log.
BLOCK_PATH="$CANON/.r0-liveness-canary-sentinel.nonallowlisted"   # under canonical, NOT allowlisted -> must block
PERMIT_PATH="$CANON/.lattice/.r0-liveness-canary-sentinel"        # .lattice/* -> allowlisted -> must permit

probe() {  # $1 = tool, $2 = file_path ; echoes the hook's exit code
    printf '{"tool_name":"%s","tool_input":{"file_path":"%s"}}' "$1" "$2" \
        | bash "$HOOK" >/dev/null 2>&1
    echo $?
}

rc_block=$(probe Edit "$BLOCK_PATH")
rc_permit=$(probe Edit "$PERMIT_PATH")
rc_nongated=$(probe Read "$BLOCK_PATH")

fail=0
diag=""
if [ "$rc_block" != "2" ]; then
    fail=1
    diag="$diag\n  BLOCK probe returned exit $rc_block (expected 2): the hook is NOT blocking"
    diag="$diag\n    a canonical-root non-allowlisted Edit. This is the BUG-009 signature"
    diag="$diag\n    (interface drift -> all-permit, or exit-code drift -> exit 1 not 2)."
fi
if [ "$rc_permit" != "0" ]; then
    fail=1
    diag="$diag\n  PERMIT probe returned exit $rc_permit (expected 0): the hook is WRONGLY"
    diag="$diag\n    blocking an allowlisted .lattice/ path (allowlist/path-normalization broken)."
fi
if [ "$rc_nongated" != "0" ]; then
    fail=1
    diag="$diag\n  NON-GATED probe (Read) returned exit $rc_nongated (expected 0): the hook is"
    diag="$diag\n    gating a tool it should ignore."
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VERDICT=$([ "$fail" -eq 0 ] && echo HEALTHY || echo DEAD)
{
    printf '%s\tr0-liveness\t%s\tblock=%s\tpermit=%s\tnongated=%s\n' \
        "$TS" "$VERDICT" "$rc_block" "$rc_permit" "$rc_nongated"
} >> "$CANON/.lattice/r0-liveness.log" 2>/dev/null || true

if [ "$fail" -eq 0 ]; then
    say "check-r0-liveness: HEALTHY (block=2, permit=0, nongated=0) -- R0 is enforcing."
    exit 0
fi

# Loud on failure regardless of --quiet.
echo "" >&2
echo "!!! R0 LIVENESS FAILURE: the worktree-isolation hook is NOT enforcing !!!" >&2
echo -e "$diag" >&2
echo "" >&2
echo "  Hook: $HOOK" >&2
echo "  This is a silently-dead enforcement gate (BUG-009 class). Canonical-root" >&2
echo "  writes are NOT being blocked. Investigate before trusting isolation." >&2
echo "  See INFRA-03 and .lattice/worktree-isolation-protocol.md 'Interface drift'." >&2
{ printf '%s\tr0-liveness\tDEAD\tblock=%s\tpermit=%s\tnongated=%s\n' "$TS" "$rc_block" "$rc_permit" "$rc_nongated"; } \
    >> "$CANON/.lattice/decisions.log" 2>/dev/null || true
exit 1
