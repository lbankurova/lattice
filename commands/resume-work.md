---
name: resume-work
description: Restore context from previous session and resume work. Reads .continue-here.md handoff.
---

You are resuming work from a previous session. Your goal is to fully restore context so the user doesn't have to re-explain anything.

## Protocol

### 1. Load handoff

Check for `.continue-here.md` in the project root. If it exists, read it fully.

If it doesn't exist, fall back to:
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

Once work resumes, delete `.continue-here.md` — it's consumed. If the user pauses again later, `/pause-work` will create a fresh one.
