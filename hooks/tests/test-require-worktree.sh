#!/bin/bash
# test-require-worktree.sh -- Unit tests for hooks/preToolUse/require-worktree.sh.
#
# Usage: bash hooks/tests/test-require-worktree.sh
# Exit:  0 = all pass; non-zero = test count failed.
#
# Per worktree-isolation-synthesis.md Section 1c (Test Strategy).

set -uo pipefail

# Resolve real lattice root for the SUT path.
LATTICE_REAL=$(cd "$(dirname "$0")/../.." && pwd)
HOOK="$LATTICE_REAL/hooks/preToolUse/require-worktree.sh"

if [ ! -f "$HOOK" ]; then
    echo "ERROR: $HOOK not found"
    exit 1
fi

# Tests run inside a per-test temp git repo. Unset any inherited
# LATTICE_PROJECT_ROOT / LATTICE_ALLOW_MAIN_TREE so tests see a clean env.
unset LATTICE_PROJECT_ROOT LATTICE_ALLOW_MAIN_TREE LATTICE_EXEMPTION_RATIONALE

ok=0; fail=0
check() {
    local desc="$1"; shift
    if "$@" >/dev/null 2>&1; then echo "  PASS  $desc"; ok=$((ok+1));
    else echo "  FAIL  $desc"; fail=$((fail+1));
    fi
}
check_fail() {
    local desc="$1"; shift
    if ! "$@" >/dev/null 2>&1; then echo "  PASS  $desc"; ok=$((ok+1));
    else echo "  FAIL  $desc"; fail=$((fail+1));
    fi
}

setup_repo() {
    local d
    d=$(mktemp -d)
    (cd "$d" && git init --quiet -b master \
        && git config user.email test@test \
        && git config user.name test \
        && echo init > README.md \
        && git add README.md \
        && git commit --quiet -m initial)
    echo "$d"
}

# ── Case 1: Edit at canonical root, non-allowlisted path -> BLOCK ──
echo "[case 1] Edit at canonical root, non-allowlisted path"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
check_fail "Edit src.ts at canonical root is blocked" \
    env CLAUDE_TOOL_NAME=Edit CLAUDE_TOOL_INPUT='{"file_path": "src.ts"}' bash "$HOOK"
cd / && rm -rf "$REPO"

# ── Case 2: Edit in worktree (file_path inside worktree) -> PERMIT ──
echo "[case 2] Edit in worktree, non-allowlisted path inside worktree"
REPO=$(setup_repo)
WT=$(mktemp -d)
rmdir "$WT"  # git worktree add wants a non-existent path
git -C "$REPO" worktree add -b session/test-1 "$WT" HEAD >/dev/null 2>&1
mkdir -p "$REPO/.lattice"
cd "$WT"
check "Edit src.ts inside worktree is permitted" \
    env CLAUDE_TOOL_NAME=Edit CLAUDE_TOOL_INPUT='{"file_path": "src.ts"}' bash "$HOOK"
cd / && git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1
rm -rf "$REPO"

# ── Case 3: Edit at canonical root, trust-doc allowlist hit -> PERMIT ──
echo "[case 3] Edit CLAUDE.md at canonical root (trust-doc allowlist)"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
check "Edit CLAUDE.md at canonical root is permitted (allowlist)" \
    env CLAUDE_TOOL_NAME=Edit CLAUDE_TOOL_INPUT='{"file_path": "CLAUDE.md"}' bash "$HOOK"
check "allowlist-audit.log row appended for CLAUDE.md hit" \
    test -s "$REPO/.lattice/allowlist-audit.log"
cd / && rm -rf "$REPO"

# ── Case 4: Bash(git add) at canonical root -> BLOCK ──
echo "[case 4] Bash(git add) at canonical root"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
check_fail "Bash 'git add foo.txt' at canonical is blocked" \
    env CLAUDE_TOOL_NAME=Bash CLAUDE_TOOL_INPUT='{"command": "git add foo.txt"}' bash "$HOOK"
check "Bash 'git status' at canonical is permitted (not gated)" \
    env CLAUDE_TOOL_NAME=Bash CLAUDE_TOOL_INPUT='{"command": "git status"}' bash "$HOOK"
cd / && rm -rf "$REPO"

# ── Case 5: Exemption envelope honored with valid rationale ──
echo "[case 5] LATTICE_ALLOW_MAIN_TREE=1 with valid rationale"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
check "Edit src.ts with valid 10+char rationale is permitted" \
    env CLAUDE_TOOL_NAME=Edit \
        CLAUDE_TOOL_INPUT='{"file_path": "src.ts"}' \
        LATTICE_ALLOW_MAIN_TREE=1 \
        LATTICE_EXEMPTION_RATIONALE="schema migration sweep" \
        bash "$HOOK"
check "exemption-audit.log row appended" \
    test -s "$REPO/.lattice/exemption-audit.log"
cd / && rm -rf "$REPO"

# ── Case 6: Exemption envelope rejected with trivial rationale ──
echo "[case 6] LATTICE_ALLOW_MAIN_TREE=1 with trivial rationale -> BLOCK"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
check_fail "trivial rationale 'fix' is rejected" \
    env CLAUDE_TOOL_NAME=Edit \
        CLAUDE_TOOL_INPUT='{"file_path": "src.ts"}' \
        LATTICE_ALLOW_MAIN_TREE=1 \
        LATTICE_EXEMPTION_RATIONALE="fix" \
        bash "$HOOK"
check_fail "missing rationale (env var unset) is rejected" \
    env CLAUDE_TOOL_NAME=Edit \
        CLAUDE_TOOL_INPUT='{"file_path": "src.ts"}' \
        LATTICE_ALLOW_MAIN_TREE=1 \
        bash "$HOOK"
cd / && rm -rf "$REPO"

# ── Case 7: .lattice/ writes from worktree resolve via prong B as INSIDE
#     canonical, but allowlist permits .lattice/** ──
echo "[case 7] .lattice/decisions.log write from worktree -> PERMIT (allowlist)"
REPO=$(setup_repo)
WT=$(mktemp -d)
rmdir "$WT"
git -C "$REPO" worktree add -b session/test-2 "$WT" HEAD >/dev/null 2>&1
mkdir -p "$REPO/.lattice"
# Create a symlink inside the worktree to canonical's .lattice/ so the
# write resolves through it (typical R1 setup).
ln -s "$REPO/.lattice" "$WT/.lattice" 2>/dev/null || cp -r "$REPO/.lattice" "$WT/.lattice"
cd "$WT"
check "Edit .lattice/decisions.log from worktree is permitted" \
    env CLAUDE_TOOL_NAME=Edit CLAUDE_TOOL_INPUT='{"file_path": ".lattice/decisions.log"}' bash "$HOOK"
cd / && git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1
rm -rf "$REPO"

# ── Case 7b: Critical -- absolute-path bypass from worktree to a
#     non-allowlisted canonical path -> BLOCK (closes the cwd-only-
#     detection bypass identified in peer-review Finding 3) ──
echo "[case 7b] absolute-path bypass from worktree (non-allowlisted) -> BLOCK"
REPO=$(setup_repo)
WT=$(mktemp -d)
rmdir "$WT"
git -C "$REPO" worktree add -b session/test-bypass "$WT" HEAD >/dev/null 2>&1
mkdir -p "$REPO/.lattice"
cd "$WT"
# Construct an absolute path that resolves INSIDE canonical AND is NOT
# in the Tier 1 allowlist (src.ts, not CLAUDE.md / .lattice/ / .claude/).
ABS_PATH="$REPO/src.ts"
check_fail "Edit absolute-path canonical/src.ts from worktree is blocked" \
    env CLAUDE_TOOL_NAME=Edit \
        CLAUDE_TOOL_INPUT="{\"file_path\": \"$ABS_PATH\"}" bash "$HOOK"
cd / && git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1
rm -rf "$REPO"

# ── Case 8: Block-event log row appended on block ──
echo "[case 8] block events appended to require-worktree-block.log"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
env CLAUDE_TOOL_NAME=Edit CLAUDE_TOOL_INPUT='{"file_path": "src.ts"}' bash "$HOOK" >/dev/null 2>&1 || true
check "require-worktree-block.log has at least one row" \
    test -s "$REPO/.lattice/require-worktree-block.log"
cd / && rm -rf "$REPO"

# ── Case 9: Submodule guard -- when inside a submodule, hook treats it
#     as canonical (per spec Section 1c test strategy). ──
echo "[case 9] submodule guard treats submodule as canonical"
REPO=$(setup_repo)
SUB=$(setup_repo)  # separate repo to act as submodule
# Add SUB as submodule of REPO. -- on Windows / git-bash, file:// URL is
# the portable cross-platform way to add a local-path submodule.
SUB_URL="file://$(echo "$SUB" | sed 's|^/||;s|^\([a-zA-Z]\):|/\1|')"
(cd "$REPO" && git -c protocol.file.allow=always submodule add "$SUB_URL" subm 2>/dev/null) >/dev/null 2>&1 || {
    # Fallback: regular submodule add via direct path (works on POSIX).
    (cd "$REPO" && git -c protocol.file.allow=always submodule add "$SUB" subm) >/dev/null 2>&1
}
if [ -d "$REPO/subm" ]; then
    cd "$REPO/subm"
    mkdir -p "$REPO/.lattice"
    # From inside submodule, --show-superproject-working-tree returns the
    # parent repo's path -> hook sets IN_CANONICAL=true.
    check_fail "Edit src.ts from inside submodule is blocked (treated as canonical)" \
        env CLAUDE_TOOL_NAME=Edit CLAUDE_TOOL_INPUT='{"file_path": "src.ts"}' bash "$HOOK"
else
    echo "  SKIP  submodule add failed in this environment; case 9 not exercised"
fi
cd /; rm -rf "$REPO" "$SUB"

echo ""
echo "Tests: $ok passed, $fail failed"
if [ "$fail" -gt 0 ]; then exit 1; fi
exit 0
