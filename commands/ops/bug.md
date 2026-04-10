---
name: bug
description: Log a bug into BUG-SWEEP.md. Fast capture during manual QA -- agent parses description, guesses location/category, appends structured entry.
---

You are logging a bug. Fast capture -- get the entry into `docs/_internal/BUG-SWEEP.md` with the right structure so it can be triaged and fixed later. Don't investigate or fix -- just log.

**Input:** A short description. Examples:
- `bug "LOO chart empty on PointCross BW"`
- `bug "dose label shows raw number instead of mg/kg format"`
- `bug "context panel doesn't update when switching rail items"`

Optional structured input (from bug-fix-cycle classification):
- `description`: bug description
- `severity`: silent-wrong-answer | misleading-display | crash | cosmetic
- `category`: pane-drift | stale-state | count-mismatch | cache-staleness | layout | interaction | data-pipeline | other
- `subsystem`: S{XX} ({name})

## Protocol

### 1. Determine next BUG ID

Read `docs/_internal/BUG-SWEEP.md`. Find the highest BUG-NNN number. Next ID = BUG-{NNN+1}.

### 2. Parse and classify

From the description, determine:

**Category** (guess from keywords -- the user can correct later):

| Keywords in description | Category |
|------------------------|----------|
| "stale", "doesn't update", "old data", "previous" | `stale-state` |
| "count", "number", "mismatch", "wrong total" | `count-mismatch` |
| "panel", "pane", "context", "wrong info" | `pane-drift` |
| "cache", "refresh", "load" | `cache-staleness` |
| "overflow", "alignment", "truncat", "z-index", "layout" | `layout` |
| "click", "hover", "select", "keyboard", "toggle", "filter" | `interaction` |
| "wrong value", "incorrect", "calculation", "pipeline", "generated" | `data-pipeline` |
| none of the above | `other` |

**Component** (guess from description -- look for view names, file names, feature names):
- Search the codebase for keywords from the description
- Map to file path(s) if possible
- If unclear, write "TBD"

**View** (which UI view is affected):
- FindingsView, HistopathologyView, CohortView, TimeCoursePane, etc.
- If unclear, write "TBD"

If severity/category/subsystem were provided as structured input (from bug-fix-cycle), use those directly instead of guessing.

### 3. Append entry

Append to `docs/_internal/BUG-SWEEP.md`, at the top of the Bugs section (newest first):

```markdown
### BUG-{NNN} -- {short title from description}

- **logged:** {today's date}
- **status:** open
- **category:** {guessed category}
- **view:** {guessed view or TBD}
- **component:** {guessed file path(s) or TBD}
- **observed:** {user's description, cleaned up to 1-2 sentences}
```

Only include fields you can fill. Omit `expected`, `repro`, `screenshot`, `root_cause`, `fix_batch`, `commit` -- those are filled during triage and fix.

### 4. Update summary table

In the Summary section, increment the `open` count by 1.

### 5. Report

```
Logged BUG-{NNN}: {short title}
Category: {value} (guessed -- correct if wrong)
File: docs/_internal/BUG-SWEEP.md
```

## Rules

- **Speed over precision.** This is fast capture. Wrong category is fine -- triage corrects it. Missing component is fine -- investigation finds it. The goal is: the bug exists in the registry with a searchable description.
- **Never investigate.** Don't read the code to find the root cause. Don't propose a fix. Just log.
- **Never duplicate.** Before appending, scan existing entries for the same bug (search by component and keywords). If a match exists, note: "Possible duplicate of BUG-{NNN}. Logging anyway -- merge during triage if confirmed."
