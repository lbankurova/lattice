#!/bin/bash
# submodule-checkout-main.sh -- SessionStart hook. When a submodule is checked
# out at a DETACHED HEAD (the default state after `git submodule update`), put it
# back on `main` so work and the submodule's branch-guard (HEAD must be main)
# line up from the START of the session -- resolving the recurring "submodule is
# on a detached HEAD" pain at its source instead of mid-session.
#
# Safety model: a plain `git checkout main` IS the safety layer. If the working
# tree has uncommitted changes that are identical between the detached commit and
# main (the common case), git carries them onto main cleanly -- now committable.
# If main genuinely diverges in those files, git REFUSES ("local changes would be
# overwritten") and leaves everything untouched; we then warn with git's own
# message. No dirty pre-check and no auto-stash: git's native carry-or-refuse is
# more precise than any blunt "skip if dirty" rule, and resolves strictly more
# cases without additional risk.
#
# Never blocks the session (always exit 0). Submodule-scoped; the parent repo's
# HEAD only gets a no-action sanity note (parent detachment is rare and the
# Edit/Write + Bash R0 prongs already govern the parent).
#
# Per the BUG-009 / FIX-03 submodule follow-up; see
# .lattice/worktree-isolation-protocol.md.

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$ROOT" ] && exit 0
cd "$ROOT" 2>/dev/null || exit 0

# Parent-HEAD sanity note (no action).
if ! git symbolic-ref -q HEAD >/dev/null 2>&1; then
    echo "submodule-checkout-main: NOTE -- parent repo HEAD is detached ($(git rev-parse --short HEAD 2>/dev/null || echo '?')); no action taken on the parent." >&2
fi

# Iterate INITIALIZED submodules. `git submodule status` prefixes each line:
#   '-' uninitialized (skip), ' ' in-sync, '+' different commit, 'U' conflicts.
git submodule status 2>/dev/null | while IFS= read -r line; do
    case "$line" in
        -*) continue ;;   # uninitialized -- nothing to check out
    esac
    sub="$(printf '%s\n' "$line" | awk '{print $2}')"
    [ -n "$sub" ] || continue
    [ -e "$ROOT/$sub/.git" ] || continue   # .git is a file (gitlink) in submodules

    # Already on a branch? symbolic-ref succeeds -> leave it alone.
    if git -C "$ROOT/$sub" symbolic-ref -q HEAD >/dev/null 2>&1; then
        continue
    fi

    # Detached. Attempt to return to main; git is the safety layer.
    detached_at="$(git -C "$ROOT/$sub" rev-parse --short HEAD 2>/dev/null || echo '?')"
    if err="$(git -C "$ROOT/$sub" checkout main 2>&1)"; then
        echo "submodule-checkout-main: '$sub' was detached at $detached_at -> checked out 'main'." >&2
    else
        echo "submodule-checkout-main: '$sub' is detached at $detached_at and could NOT auto-switch to 'main':" >&2
        printf '%s\n' "$err" | sed 's/^/    /' >&2
        echo "    Resolve manually: commit or stash in $sub, then 'git -C $sub checkout main'." >&2
    fi
done

exit 0
