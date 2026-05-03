---
name: implement-todo
description: Apply a single TODO.md mechanical fix end-to-end -- read, locate, edit, declare commit intent. Used by mechanical-fix-cycle. Effort is not a gate; correctness is.
---

You are executing a single mechanical TODO item. Your job is to read its
description, make the change, and declare the resulting commit intent.
You exit either:

- successfully (with files edited + intent declared), or
- cleanly with `ESCALATED:` on the first line of your final output, when
  you genuinely cannot determine a deterministic edit.

**Input:** `todo_id` -- the section header id from TODO.md, e.g. `GAP-271`,
`BFIELD-21`, `DATA-GAP-HCD-HET-06`.

## Hard rules

1. **No effort gate.** There is no LOC cap. If the change spans 200 files
   and 4000 lines, proceed. The only reasons to escalate are (a) vague
   spec, (b) impossible-to-execute, (c) missing prerequisite (cited file
   doesn't exist).

2. **Stash > broken commit.** If your edits don't compile or break tests,
   the workflow's ops-check node will catch that and the autopilot will
   stash your work. You do NOT need to "commit broken work as wip:" --
   leave the tree dirty and let the parent flow handle cleanup.

3. **Don't escalate on first surprise.** Read more code, reconsider the
   spec, try one more approach. Only escalate when you genuinely cannot
   determine *what* the change should be -- not when you're nervous about
   doing it right. Effort is not the bar.

4. **Declare commit intent before exiting.** Final step is always
   `bash scripts/declare-commit-intent.sh "{{topic-slug}}" <each-file>` so
   the workflow's commit-intent-check node has something to compare
   against. Skip this and the workflow blocks at the next gate.

## Step 1: Locate the TODO entry

Find the project's TODO.md. The candidate paths (in order):

1. `docs/_internal/TODO.md`
2. `TODO.md`
3. `docs/TODO.md`

Read it. Find the section whose `### ` header starts with `{{todo_id}}`
or `{{todo_id}}:` or `{{todo_id} -- `. The id may be a prefix match -- the
header could read `### GAP-271: foo bar` or `### GAP-271 -- baz`.

If not found: write to `ESCALATION.md`:

```
{ISO timestamp}  {{todo_id}}  not_found
  Searched: docs/_internal/TODO.md, TODO.md, docs/TODO.md
  Resolution: TODO id was passed but no matching section exists. Either the
  id is wrong or the TODO was removed. Caller should re-check the queue.
```

Then output `ESCALATED: TODO {{todo_id}} not found` as the first line of
your response and exit.

## Step 2: Parse the change description

Read the section body. Extract:

- **What changes.** The concrete edit description -- file paths, search/
  replace targets, enum values, etc.
- **Where.** Specific file paths or line ranges. If only directories are
  named, infer the file from imports / file conventions.
- **Why** (optional context). Useful for the commit message but not the
  edit.

If the body is too vague to determine a deterministic edit -- it says
"clean up the X module" without naming files, or asks for a "review"
without a specific change, or describes a *symptom* without an
*intervention* -- write to `ESCALATION.md`:

```
{ISO timestamp}  {{todo_id}}  vague_spec
  Body excerpt: {first 200 chars of the body}
  Resolution: TODO description doesn't specify a deterministic change.
  Needs spec refinement before mechanical-fix-cycle can act on it.
  Suggested: convert to `kind: spike` or rewrite the body with concrete
  file paths + change targets.
```

Then output `ESCALATED: TODO {{todo_id}} vague spec` as the first line
of your response and exit.

**Heuristics for "is this vague?"** -- not gates, just guidance:

- "Update X to do Y" with X = file/function/enum and Y = concrete value -> proceed
- "Clean up dead code in X" with X = file -> proceed if you can identify dead code; escalate if it's truly subjective
- "Fix the X bug" with no reproduction or file -> escalate (this is a bugfix item miscategorized as mechanical)
- "Rename X to Y everywhere" -> proceed (mechanical by definition)
- "Add feature Z" -> escalate (not mechanical; spec it as `kind: spike` or `bugfix`)

## Step 3: Verify prerequisites

For each file the spec names:
- Does it exist? If not, write to `ESCALATION.md` with `prerequisite_missing` and exit `ESCALATED:`.
- Read it. Confirm the spec's claims about its contents are true (the named line/symbol/enum value actually exists at the named location).

If a prerequisite is missing, the spec is stale -- escalate rather than
guess. The autopilot's stash-on-exit logic will preserve any partial work.

## Step 4: Apply the edit

Use the Edit / Write / Bash tools to make the change. Constraints:

- **Only touch files the spec names** (or files transitively required by
  those edits, e.g. an import that has to be added in a sibling file).
  If you find yourself touching files the spec didn't anticipate, that's
  scope creep -- pause, document why in the commit description, and
  proceed only if the alternative is clearly worse.
- **Run mid-flight syntax checks** for any language with cheap parsing
  (Python `python -c "import ast; ast.parse(...)"`, TypeScript via `npm
  run build`). Don't accumulate errors across files.
- **Preserve domain logic.** If the change crosses into algorithm /
  scoring / classification code (CLAUDE.md rule 14: science preservation
  gate), STOP and escalate -- mechanical-fix-cycle is not the right
  workflow for science changes. Write to `ESCALATION.md` with
  `science_sensitive` and route the user toward `bug-fix-cycle` or a
  full build cycle.

## Step 5: Declare commit intent

Once edits are saved, declare the file set:

```bash
bash scripts/declare-commit-intent.sh "{{topic-slug}}" <file1> <file2> ...
```

Where `{{topic-slug}}` is the todo id lowercased + slugified (e.g.
`GAP-271` -> `gap-271`, `DATA-GAP-HCD-HET-06` -> `data-gap-hcd-het-06`).

Stage the files:

```bash
git add <file1> <file2> ...
```

Do NOT use `git add -A` or `git add .` -- the commit-intent check
compares against the staged set, and accidental adds (untracked files,
unrelated edits from a parallel session) will fail the gate.

## Step 6: Final output

Print a structured summary:

```
TODO {{todo_id}}: {one-line change description}

Files changed:
  - path/to/file1.ts (added enum value, +3 lines)
  - path/to/file2.py (mirror change, +1 line)

Intent declared: {{topic-slug}}
Staged files: {N}
```

The mechanical-fix-cycle workflow's commit-intent-check + ops-check
nodes will gate from here. You're done.

## Decision log

After completing (success or escalation), append to `.lattice/decisions.log`:

```
{ISO timestamp}\timplement-todo\t{COMPLETED|ESCALATED}\t{{todo_id}}\tfiles:{N} reason:{one-line}
```

## Notes for the autopilot

- The autopilot stashes any dirty tree after this skill exits, regardless
  of outcome. So if you exit `ESCALATED:` with edits unsaved, those edits
  are recoverable via `git stash list`.
- The next candidate runs against a clean tree. Don't leave global state
  (env vars, lockfiles, tempfiles) that would pollute it. The release-lock
  node at the end of the workflow handles the topic lock; you don't need
  to manage it.
- Consecutive same-cause failures across items trip the autopilot's
  circuit breaker (CLAUDE.md rule 7). If your `ESCALATED:` message has a
  consistent prefix shape (e.g., always `vague_spec`), 5 in a row halts
  the queue. That's intentional -- it surfaces a systemic problem (TODO
  hygiene) that mass-running the queue can't fix.
