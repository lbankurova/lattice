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

# Stdin-interface helpers. Current Claude Code delivers the hook payload as
# JSON on STDIN (NOT env vars). These feed that interface and assert the exact
# exit-code contract: 0 = permit, 2 = block (exit 1 is a non-blocking error
# and would let the tool proceed -- so blocks must be 2, not just "non-zero").
# This is the interface that silently no-op'd in production while the env-var
# cases above passed -- the regression guard for that drift.
check_stdin_permit() {
    local desc="$1" payload="$2" rc
    printf '%s' "$payload" | bash "$HOOK" >/dev/null 2>&1; rc=$?
    if [ "$rc" -eq 0 ]; then echo "  PASS  $desc"; ok=$((ok+1));
    else echo "  FAIL  $desc (expected exit 0, got $rc)"; fail=$((fail+1));
    fi
}
check_stdin_block() {
    local desc="$1" payload="$2" rc
    printf '%s' "$payload" | bash "$HOOK" >/dev/null 2>&1; rc=$?
    if [ "$rc" -eq 2 ]; then echo "  PASS  $desc"; ok=$((ok+1));
    else echo "  FAIL  $desc (expected exit 2, got $rc)"; fail=$((fail+1));
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
# Construct an absolute path that resolves INSIDE canonical AND is NOT in the
# Tier 1 allowlist (src.ts, not CLAUDE.md / .lattice/ / .claude/). Derive the
# canonical root the SAME way the hook does -- from `git rev-parse
# --git-common-dir` + `pwd -P` -- NOT from $REPO (mktemp output). On MSYS
# these differ: git reports the common-dir in C:/... form, and `cd`-ing into
# it resolves through the /tmp mount alias (/tmp/claude/...), whereas the
# mktemp string is /c/Users/.../Temp/.... The hook compares against the /tmp
# form, so the test must build the expected path identically. (Real-world
# C:/... drive-form file_paths -- e.g. C:/pg/pcc/... with no /tmp alias --
# are normalized by the hook's to_msys_path and exercised in verification.)
CANON_RESOLVED="$(dirname "$(cd "$(git rev-parse --git-common-dir)" && pwd -P)")"
ABS_PATH="$CANON_RESOLVED/src.ts"
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

# ── Case 10: STDIN interface -- Edit at canonical root -> BLOCK (exit 2) ──
# THE regression test for the 2026-05 interface-drift no-op: env-var cases
# above passed while this exact scenario silently permitted in production.
echo "[case 10] STDIN: Edit at canonical root -> BLOCK (exit 2)"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
check_stdin_block "stdin Edit src.ts at canonical root blocks with exit 2" \
    '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"src.ts"}}'
cd / && rm -rf "$REPO"

# ── Case 11: STDIN -- Edit CLAUDE.md at canonical root -> PERMIT (allowlist) ──
echo "[case 11] STDIN: Edit CLAUDE.md at canonical root -> PERMIT"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
check_stdin_permit "stdin Edit CLAUDE.md at canonical root is permitted" \
    '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"CLAUDE.md"}}'
cd / && rm -rf "$REPO"

# ── Case 12: STDIN -- Bash(git add) at canonical root -> BLOCK (exit 2) ──
echo "[case 12] STDIN: Bash(git add) at canonical root -> BLOCK (exit 2)"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
check_stdin_block "stdin 'git add foo.txt' at canonical blocks with exit 2" \
    '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git add foo.txt"}}'
check_stdin_permit "stdin 'git status' at canonical is permitted (not gated)" \
    '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"}}'
cd / && rm -rf "$REPO"

# ── Case 13: STDIN -- non-gated tool (Read) -> PERMIT (exit 0) ──
echo "[case 13] STDIN: non-gated tool (Read) -> PERMIT"
REPO=$(setup_repo)
cd "$REPO"
mkdir -p .lattice
check_stdin_permit "stdin Read is not gated" \
    '{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"src.ts"}}'
cd / && rm -rf "$REPO"

# ── Case 14: STDIN -- Edit inside worktree -> PERMIT (exit 0) ──
echo "[case 14] STDIN: Edit inside worktree -> PERMIT"
REPO=$(setup_repo)
WT=$(mktemp -d)
rmdir "$WT"
git -C "$REPO" worktree add -b session/test-stdin "$WT" HEAD >/dev/null 2>&1
mkdir -p "$REPO/.lattice"
cd "$WT"
check_stdin_permit "stdin Edit src.ts inside worktree is permitted" \
    '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"src.ts"}}'
cd / && git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1
rm -rf "$REPO"

# -- Case 15-17: Bash git hard-block + inline exemption (FIX-03) --
echo "[case 15] STDIN: raw/prefixed git commit + git add at canonical -> BLOCK"
REPO=$(setup_repo); cd "$REPO"; mkdir -p .lattice
check_stdin_block "git commit at canonical blocks (exit 2)" '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}'
check_stdin_block "PREFIXED git commit still blocks (no bypass)" '{"tool_name":"Bash","tool_input":{"command":"true; git commit -m x"}}'
check_stdin_block "git add at canonical blocks" '{"tool_name":"Bash","tool_input":{"command":"git add ."}}'
check_stdin_permit "git status not gated" '{"tool_name":"Bash","tool_input":{"command":"git status"}}'
cd / && rm -rf "$REPO"

echo "[case 16] STDIN: inline exemption with valid rationale -> PERMIT"
REPO=$(setup_repo); cd "$REPO"; mkdir -p .lattice
check_stdin_permit "valid >=10-char inline rationale permits git commit" '{"tool_name":"Bash","tool_input":{"command":"LATTICE_ALLOW_MAIN_TREE=1 LATTICE_EXEMPTION_RATIONALE=\"committing the hardblock fix\" git commit -m x"}}'
cd / && rm -rf "$REPO"

echo "[case 17] STDIN: inline exemption with trivial/missing rationale -> BLOCK"
REPO=$(setup_repo); cd "$REPO"; mkdir -p .lattice
check_stdin_block "trivial rationale fix is rejected" '{"tool_name":"Bash","tool_input":{"command":"LATTICE_ALLOW_MAIN_TREE=1 LATTICE_EXEMPTION_RATIONALE=\"fix\" git commit"}}'
check_stdin_block "allow without rationale is rejected" '{"tool_name":"Bash","tool_input":{"command":"LATTICE_ALLOW_MAIN_TREE=1 git commit"}}'
cd / && rm -rf "$REPO"

# -- Case 18: command-position gating (FIX-03 over-gating fix) --
# git subcommands MENTIONED inside quotes are NOT real invocations -> PERMIT;
# real invocations after a separator still BLOCK.
echo "[case 18] STDIN: quoted git-subcommand mentions -> PERMIT; real -> BLOCK"
REPO=$(setup_repo); cd "$REPO"; mkdir -p .lattice
check_stdin_permit "quoted 'git commit' mention not gated" '{"tool_name":"Bash","tool_input":{"command":"echo \"git commit done\""}}'
check_stdin_permit "quoted Bash(git add) mention not gated" '{"tool_name":"Bash","tool_input":{"command":"echo \"see Bash(git add) docs\""}}'
check_stdin_block "cd && git commit (real) still blocks" '{"tool_name":"Bash","tool_input":{"command":"cd sub && git commit -m x"}}'
cd / && rm -rf "$REPO"

echo ""
echo "Tests: $ok passed, $fail failed"
if [ "$fail" -gt 0 ]; then exit 1; fi
exit 0
