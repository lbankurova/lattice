#!/bin/bash
# require-worktree.sh -- PreToolUse hook for project-wide worktree isolation.
#
# Refuses Edit/Write/Bash(git add|commit|stash) when the session's cwd
# resolves to a canonical repo root (i.e., NOT a session worktree). When the
# call is permitted, writes nothing; when blocked, prints an actionable
# session-spawn message to stderr and exits 2.
#
# INPUT INTERFACE: Claude Code delivers the tool-call payload as a JSON object
# on STDIN (fields: tool_name, tool_input{...}, cwd, hook_event_name, ...).
# This hook reads stdin first, and falls back to the CLAUDE_TOOL_NAME /
# CLAUDE_TOOL_INPUT environment variables when set (the unit-test harness and
# some alternate callers use env vars). Reading ONLY the env vars is what
# silently no-op'd this hook 2026-05-16..2026-05-29: Claude Code never set
# them, so TOOL was empty, Step 1's '*' branch fired, and every call was
# permitted (exit 0). See worktree-isolation-protocol.md "Interface drift".
#
# EXIT CODES (PreToolUse contract -- current Claude Code):
#   0 -- tool call permitted (in worktree, OR allowlisted path, OR exempted).
#        Non-blocking. stdout/stderr are logged, not surfaced as an error.
#   2 -- tool call BLOCKED. stderr is fed back to Claude as the block reason.
#        (Exit 1 is a NON-blocking error in the hook protocol -- it would
#        print a warning and let the tool proceed, so blocks MUST use 2.)
#
# Per worktree-isolation-synthesis.md Section 1 R0, D5.

set -euo pipefail

# ── Step 0: Read the tool-call payload (stdin JSON, env-var fallback) ──

TOOL="${CLAUDE_TOOL_NAME:-}"
INPUT="${CLAUDE_TOOL_INPUT:-}"

if [ -z "$TOOL" ] || [ -z "$INPUT" ]; then
    STDIN_PAYLOAD=""
    # Only read when stdin is not a terminal (it never is under the hook
    # protocol); guards against blocking on an interactive invocation.
    if [ ! -t 0 ]; then
        STDIN_PAYLOAD="$(cat 2>/dev/null || true)"
    fi
    if [ -z "$TOOL" ]; then
        TOOL="$(printf '%s' "$STDIN_PAYLOAD" | grep -oE '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/' || true)"
    fi
    if [ -z "$INPUT" ]; then
        # The full payload is a superset of tool_input; downstream greps key
        # off the quoted field names ("command", "file_path"), which appear
        # only inside tool_input -- so passing the whole payload is safe.
        INPUT="$STDIN_PAYLOAD"
    fi
fi

# ── Step 1: Should this tool call be gated at all? ──

case "$TOOL" in
    Edit|Write)
        # Always-gated.
        ;;
    Bash)
        # Match git add / git commit / git stash subcommands inside the
        # tool input's "command" field. Use a simple grep -- the hook is
        # advisory under settings.json's matcher (which already narrows
        # to Bash(git add*|...)) so this script's own check is a defense
        # in depth.
        if echo "$INPUT" | grep -qE 'git[[:space:]]+(add|commit|stash)\b'; then
            : # gated
        else
            exit 0
        fi
        ;;
    *)
        # Unknown tool / other tool -- not gated.
        exit 0
        ;;
esac

# ── Step 2: Resolve cwd against canonical-root ──

# Resolve the process's cwd to its absolute path (lexical, no symlink chase).
CWD_ABS="$(pwd -P)"

# Resolve canonical via git's --git-common-dir, which always points at the
# canonical's .git directory. The canonical root is the parent of that dir.
GIT_COMMON_PATH="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$GIT_COMMON_PATH" ]; then
    # Not in a git repo -- the hook isn't meaningful here. Permit.
    exit 0
fi
GIT_COMMON_ABS="$(cd "$GIT_COMMON_PATH" && pwd -P)"
CANONICAL_ROOT="$(dirname "$GIT_COMMON_ABS")"

# GIT_DIR == GIT_COMMON_DIR means we're in the canonical tree.
# GIT_DIR != GIT_COMMON_DIR means we're in a linked worktree.
GIT_DIR_PATH="$(git rev-parse --git-dir 2>/dev/null || true)"
GIT_DIR_ABS="$(cd "$GIT_DIR_PATH" && pwd -P)"

IN_CANONICAL=false
if [ "$GIT_DIR_ABS" = "$GIT_COMMON_ABS" ]; then
    IN_CANONICAL=true
fi

# Submodule guard: if we're inside a submodule, the parent project's
# canonical applies. For the R0 hook's purposes, treat submodules as
# canonical (the consumer's submodule write surface is per-project).
SUPERPROJECT="$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)"
if [ -n "$SUPERPROJECT" ]; then
    IN_CANONICAL=true
fi

# Normalize a Windows drive-letter absolute path (C:/x or C:\x) to MSYS form
# (/c/x), so file_path arguments (which Claude Code emits in C:/... form on
# Windows) compare correctly against CWD_ABS / CANONICAL_ROOT (which come from
# `pwd -P` in /c/... form). No-op on POSIX paths. Without this, prong B's
# absolute-path-bypass detection silently never fires on Windows (the
# C:/... vs /c/... prefix mismatch -- caught by test case 7b, 2026-05-29).
to_msys_path() {
    local p="$1"
    # Convert backslash separators to forward slashes, then squeeze duplicate
    # slashes. Claude Code emits Windows file_path values with backslash
    # separators, and JSON-escaped pairs survive in the stdin payload; without
    # the squeeze each escaped pair becomes // and the allowlist prefix-strip
    # fails (caught live 2026-05-29 blocking an allowlisted .claude/ edit).
    p="${p//\\//}"
    p="$(printf '%s' "$p" | tr -s '/')"
    case "$p" in
        [a-zA-Z]:/*)
            local drive rest
            drive="$(printf '%s' "${p%%:*}" | tr '[:upper:]' '[:lower:]')"
            rest="${p#*:}"
            printf '/%s%s' "$drive" "$rest"
            ;;
        *) printf '%s' "$p" ;;
    esac
}

# ── Step 3: Two-pronged detection (peer-review F3 finding) ──
#
# Prong A: cwd == canonical-root.
# Prong B: file_path (Edit/Write) resolves to a path INSIDE canonical even
#          when cwd is in a worktree -- catches absolute-path bypass.
# Either prong fires -> candidate block. Allowlist + exemption envelope
# can still permit. Bash absolute-path bypass is documented residual
# risk: $CLAUDE_TOOL_INPUT for Bash has no structured file_path field;
# git's worktree semantics natively reject staging files outside the
# worktree.

PRONG_FIRED=false
if [ "$IN_CANONICAL" = "true" ]; then
    PRONG_FIRED=true
fi

# Extract file_path from JSON tool input (Edit/Write only).
FILE_PATH_RAW=""
if [ "$TOOL" = "Edit" ] || [ "$TOOL" = "Write" ]; then
    # Crude JSON extraction; sufficient for the hook's purposes (Claude
    # Code emits a stable shape).
    FILE_PATH_RAW="$(echo "$INPUT" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"
fi

if [ -n "$FILE_PATH_RAW" ]; then
    # Lexical resolution (collapse .. without following symlinks). Per
    # synthesis R2-NI-1: do NOT realpath/readlink -- the worktree's
    # .lattice/ is a symlink to canonical's .lattice/, and chasing it
    # would false-positive every legitimate .lattice/ write from a
    # worktree.
    case "$FILE_PATH_RAW" in
        /*|[a-zA-Z]:[/\\]*) FILE_PATH_ABS="$FILE_PATH_RAW" ;;
        *) FILE_PATH_ABS="$CWD_ABS/$FILE_PATH_RAW" ;;
    esac
    # Normalize Windows drive-letter form to MSYS form before any prefix
    # comparison (CANONICAL_ROOT / CWD_ABS are already in MSYS form).
    FILE_PATH_ABS="$(to_msys_path "$FILE_PATH_ABS")"
    # Stable iterative collapse of `/a/b/..` segments using sed (the only
    # cross-platform reliable approach -- Bash glob ${//} doesn't match
    # path components correctly across versions). Loop terminates when no
    # further substitution applies (architect F2 fix, 2026-05-09).
    while true; do
        NEW="$(echo "$FILE_PATH_ABS" | sed 's:/[^/][^/]*/\.\.::g')"
        [ "$NEW" = "$FILE_PATH_ABS" ] && break
        FILE_PATH_ABS="$NEW"
    done

    # Prong B: does the file_path resolve INSIDE canonical, even though
    # cwd is in a worktree? If so, it's an absolute-path bypass attempt.
    case "$FILE_PATH_ABS" in
        "$CANONICAL_ROOT"/*|"$CANONICAL_ROOT")
            if [ "$IN_CANONICAL" = "false" ]; then
                PRONG_FIRED=true
            fi
            ;;
    esac
fi

if [ "$PRONG_FIRED" = "false" ]; then
    # In a worktree, file_path resolves into the worktree -- permit.
    exit 0
fi

# ── Step 4: Allowlist (Tier 1, implicit) ──
#
# Trust docs and shared lattice state are permitted at canonical-root
# without ceremony. Per-project additions go in lattice-project.toml's
# [project.worktree] allow_main_tree_paths.

is_allowlisted() {
    local f="$1"
    # Strip canonical prefix to get repo-relative path.
    local rel="${f#$CANONICAL_ROOT/}"
    case "$rel" in
        CLAUDE.md|README.md|ROADMAP.md|LICENSE|NOTICE) return 0 ;;
        .gitignore|.gitattributes|.gitmodules) return 0 ;;
        .claude/*) return 0 ;;
        # .lattice/** is the cross-worktree write surface -- worktrees
        # access canonical's via D1 symlink/env-var; without this
        # allowlist, prong B blocks every decisions.log append.
        .lattice/*) return 0 ;;
        # docs/ at canonical root, BUT not docs/_internal/ (which may be
        # a submodule -- per-project policy decides). Conservative: allow.
        docs/*) return 0 ;;
        *) return 1 ;;
    esac
}

if [ -n "${FILE_PATH_RAW}" ] && is_allowlisted "$FILE_PATH_ABS"; then
    # Audit-log allowlist hits so monitoring can detect over-broad lists.
    {
        printf '%s\trequire-worktree\tALLOWLIST_HIT\ttool=%s\tfile=%s\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TOOL" "$FILE_PATH_ABS"
    } >> "$CANONICAL_ROOT/.lattice/allowlist-audit.log" 2>/dev/null || true
    exit 0
fi

# ── Step 5: Exemption envelope (Tier 2, explicit) ──

# Resolve the exemption from the session environment OR -- for Bash commands --
# from an inline exemption embedded in the command string. Inline env vars set
# in a command (LATTICE_ALLOW_MAIN_TREE=1 ... git commit) do NOT reach this hook
# (it runs in Claude Code's environment, not as a child of the command), so the
# documented escape hatch is parsed out of the payload here. Edit/Write carry no
# command string -- their exemption must come from the session environment.
ALLOW="${LATTICE_ALLOW_MAIN_TREE:-}"
RATIONALE="${LATTICE_EXEMPTION_RATIONALE:-}"
if [ "$ALLOW" != "1" ] && printf '%s' "$INPUT" | grep -q 'LATTICE_ALLOW_MAIN_TREE=1'; then
    ALLOW=1
    if [ -z "$RATIONALE" ]; then
        RATIONALE="$(printf '%s' "$INPUT" | sed -n 's/.*LATTICE_EXEMPTION_RATIONALE=[\\]*"\([^"\\]*\).*/\1/p' | head -1)"
    fi
fi
if [ "$ALLOW" = "1" ]; then
    # Trivial-rationale rejection list. Inline because the list has 5
    # entries and one consumer.
    case "$RATIONALE" in
        ""|"fix"|"test"|"wip"|"edit"|"update")
            echo "BLOCKED by require-worktree: LATTICE_ALLOW_MAIN_TREE=1 set but rationale" >&2
            echo "  ('${RATIONALE:-(empty)}') is missing or trivial." >&2
            echo "  Set LATTICE_EXEMPTION_RATIONALE=\"<>=10-char specific reason\"." >&2
            exit 2
            ;;
    esac
    if [ "${#RATIONALE}" -lt 10 ]; then
        echo "BLOCKED by require-worktree: LATTICE_EXEMPTION_RATIONALE too short (<10 chars)." >&2
        exit 2
    fi
    # Audit-log the exemption to the per-event log AND to decisions.log
    # (Full System AC6 -- "decisions.log records every R0 hook block + every
    # exemption invocation"). Per-event log feeds monitoring; decisions.log
    # feeds incident review.
    {
        printf '%s\trequire-worktree\tEXEMPTION_USED\ttool=%s\tholder=%s\trationale=%s\tcwd=%s\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TOOL" "${USER:-unknown}" "$RATIONALE" "$CWD_ABS"
    } >> "$CANONICAL_ROOT/.lattice/exemption-audit.log" 2>/dev/null || true
    {
        printf '%s\trequire-worktree\tEXEMPTION\ttool=%s\trationale=%s\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TOOL" "$RATIONALE"
    } >> "$CANONICAL_ROOT/.lattice/decisions.log" 2>/dev/null || true
    exit 0
fi

# ── Step 6: Block ──

# Audit-log the block event to the per-event log (R1 stop-light observable
# #5: confirms the hook is actually firing on canonical-root attempts) AND
# to decisions.log (Full System AC6).
{
    printf '%s\trequire-worktree\tBLOCK\ttool=%s\tfile=%s\tcwd=%s\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TOOL" "${FILE_PATH_RAW:-(n/a)}" "$CWD_ABS"
} >> "$CANONICAL_ROOT/.lattice/require-worktree-block.log" 2>/dev/null || true
{
    printf '%s\trequire-worktree\tBLOCK\ttool=%s\tfile=%s\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TOOL" "${FILE_PATH_RAW:-(n/a)}"
} >> "$CANONICAL_ROOT/.lattice/decisions.log" 2>/dev/null || true

cat >&2 <<EOF
BLOCKED by require-worktree: This repo requires worktree-isolated sessions.

  Tool:   $TOOL
  cwd:    $CWD_ABS
  ${FILE_PATH_RAW:+File:   $FILE_PATH_RAW}

To proceed:
  1. Spawn a session worktree:
       bash scripts/lattice-session-start.sh <topic>
     (use a short, memorable topic like 'fix-noael' or 'autopilot-batch')
  2. Re-launch Claude Code from the printed worktree path.
  3. Resume your work; this hook will permit the call there.

Trust-doc edits (CLAUDE.md, README.md, ROADMAP.md, .claude/, .lattice/)
are allowlisted at canonical root -- you do not need a worktree for those.

For one-off exemptions:
  LATTICE_ALLOW_MAIN_TREE=1 LATTICE_EXEMPTION_RATIONALE="<reason >=10 chars>" <cmd>

See .lattice/worktree-isolation-protocol.md for full details.
EOF
exit 2
