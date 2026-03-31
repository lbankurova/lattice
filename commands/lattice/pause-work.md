---
name: pause-work
description: Create context handoff file when pausing work mid-task. Preserves state for /resume-work.
---

You are creating a context handoff so the next session can resume seamlessly. This replaces GSD's pause-work with a standalone implementation.

## Protocol

### 1. Gather state

Assess current work state:

- **What branch are you on?** `git branch --show-current`
- **What's uncommitted?** `git status` and `git diff --stat`
- **What was the task?** Summarize what the user was working on
- **Where did you stop?** Which file, which step, what was the last thing completed
- **What's next?** The immediate next action when resuming
- **What decisions were made?** Any design choices, trade-offs, or user preferences expressed this session
- **What's blocking?** Anything that prevented further progress

Ask the user to clarify anything you're unsure about — especially decisions and context that isn't in the code.

### 2. Write handoff file

Write `.continue-here.md` in the project root:

```markdown
# Continue Here

> Paused: [date and time]
> Branch: [branch name]
> Task: [1-line summary]

## Where I stopped
[Specific file, function, step. Be precise enough that a fresh agent with no context can find exactly where to pick up.]

## What's done
- [Completed item 1]
- [Completed item 2]

## What's next
1. [Immediate next action — be specific]
2. [Following action]
3. [...]

## Decisions made this session
- [Decision 1 — what was chosen and why]
- [Decision 2]

## Blockers / open questions
- [Blocker or question, if any]

## Key files touched
- `path/to/file.ts` — [what changed]
- `path/to/other.ts` — [what changed]

## Uncommitted changes
[Output of git diff --stat, or "all committed"]
```

### 3. Confirm with user

Show the handoff file and ask:
- "Anything I missed or got wrong?"
- "Want me to commit the current state before pausing?" (WIP commit if yes)

### 4. Final message

Tell the user: **"Handoff saved to `.continue-here.md`. Next session, start with `/resume-work`."**
