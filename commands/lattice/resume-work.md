---
name: resume-work
description: Restore context from previous session and resume work. Reads `.continue-here-*.md` handoffs.
---

You are resuming work from a previous session. Your goal is to fully restore context so the user doesn't have to re-explain anything.

## Protocol

### 1. Load handoff

Glob the project root for handoff files:

```
ls .continue-here-*.md 2>/dev/null
ls .continue-here.md 2>/dev/null   # legacy form (back-compat)
```

**If exactly one handoff exists:** read it fully and proceed.

**If multiple handoffs exist** (concurrent paused sessions, expected when slug naming is in use): list each with its `Slug:` and `Task:` line plus `Paused:` timestamp, ask the user which to resume. Example output:

```
Found 2 paused sessions:
  1. mechanical-checks-buildout (paused 2026-04-29) -- Mechanical-check buildout triggered by GAP-304 retro
  2. radar-forest-cleanup (paused 2026-04-29 09:13 EDT) -- radar-forest-cleanup rollup tables -> TanStack Table rework

Which one are you resuming?
```

**If no handoff exists:** fall back to:
1. `git log --oneline -10` — what was the last work?
2. `git status` / `git diff --stat` — anything uncommitted?
3. Ask the user: "No handoff file found. What were you working on?"

### 2. Verify state

Confirm the handoff is still accurate:
- Is the branch correct? `git branch --show-current`
- Are the uncommitted changes still there? `git status`
- Do the "key files touched" still exist and match expectations?

If anything has diverged (e.g., someone else committed, branch was changed), flag it.

### 3. Read context

Based on the handoff's "key files touched" and "what's next" sections:
- Read the files you'll be working on
- Read relevant CLAUDE.md design decisions
- Check `docs/_internal/TODO.md` for any new items added since the handoff

### 4. Present status

Tell the user:
- **Last session:** [task summary from handoff]
- **Where we left off:** [specific location]
- **What's next:** [immediate next actions]
- **Decisions carried forward:** [any session decisions that affect current work]
- **Anything that changed:** [divergences from handoff, if any]

Ask: **"Ready to continue, or do you want to change direction?"**

### 5. Clean up

Once work resumes, delete the resumed handoff file (`.continue-here-<slug>.md` or legacy `.continue-here.md`). It's consumed. **Leave any other `.continue-here-*.md` files in place** -- they belong to other paused sessions that haven't been resumed yet. If the user pauses again later, `/pause-work` will create a fresh slug-named file.
