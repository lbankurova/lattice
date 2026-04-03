---
name: sweep
description: Garbage collection for project state — validate and clean TODO.md, incoming/, MANIFEST.md, decisions.log. Prerequisite for /lattice:prioritize.
---

You are running a state sweep — validating and cleaning all project index files so downstream skills (especially `/lattice:prioritize`) read accurate data.

**Input:** None. Reads all index files automatically.

This is mechanical work — recount, cross-reference, archive. Not analytical. Target: 5 minutes, not 30.

## Step 1: TODO.md Recount

Read `docs/_internal/TODO.md` fully. For each section:

1. **Count actual open items** — items NOT struck through (`~~`) and NOT marked with a commit hash
2. **Count actual resolved items** — items with strikethrough or commit hash
3. **Compare to summary table** at the top of the file

If counts disagree:
- Update the summary table to match actual content
- Report: `TODO.md: summary said {X} open, actual is {Y}. Fixed.`

Also flag:
- Open bugs older than 60 days without activity (might be stale or already fixed)
- Items marked as resolved but missing commit hash (incomplete resolution)

## Step 2: incoming/ Spec Audit

Read `docs/_internal/incoming/`. For each `.md` file:

1. **Check git log** for commits referencing this spec (search for the filename or key terms from the spec title)
2. **Check ROADMAP.md** for entries linking to this spec
3. **Classify:**

| Status | Criteria | Action |
|--------|----------|--------|
| **Implemented** | Commits reference this spec, features exist in code | Move to `incoming/archive/`, note commit hash |
| **Superseded** | A newer spec covers the same area | Move to `incoming/archive/`, note superseding spec |
| **Active** | No implementation found, spec is still relevant | Keep, verify it has a ROADMAP entry (rule 12) |
| **Stale** | >90 days old, no ROADMAP entry, no recent references | Move to `incoming/archive/` with "stale" note |

Report: `incoming/: {N} specs — {A} active, {B} archived (implemented), {C} archived (stale)`

## Step 3: MANIFEST.md Staleness Check

Read `docs/_internal/MANIFEST.md`. For each tracked asset:

1. Check "Last validated" date
2. Check "Depends on" files — have any been modified since last validation? (`git log --since="{last_validated}" -- {file}`)
3. If dependencies changed since last validation, mark as `STALE — dependencies modified since {date}`

Report: `MANIFEST: {N} assets — {A} current, {B} stale`

## Step 4: decisions.log Maintenance

Read `.lattice/decisions.log`. 

1. Count total entries
2. If >200 entries: archive entries older than 90 days to `.lattice/decisions-archive-{date}.log`
3. Check for duplicate entries (same skill + context + outcome within 1 hour)
4. Report: `decisions.log: {N} entries ({M} active, {K} archived)`

## Step 5: ROADMAP.md Cross-Reference

Read `docs/_internal/ROADMAP.md`. For each item:

1. Check if linked spec exists (if `Spec: incoming/X.md` is referenced, does the file exist or was it archived?)
2. Check if item is marked done — if so, verify the spec was archived
3. Check if item has no linked spec but matching work exists in recent commits

Report: `ROADMAP: {N} items — {A} active, {B} done, {C} orphaned (no spec or commits)`

## Step 6: Research INDEX.md

If `docs/_internal/research/INDEX.md` exists:

1. Verify each listed research file still exists at the stated path
2. Check status markers (active/validated/dormant) against peer review files — a "validated" doc should have R2 review
3. Flag research docs not in the index (orphaned)

Report: `Research: {N} docs — {A} validated, {B} active, {C} dormant, {D} orphaned`

## Output

Write a sweep report and record the timestamp:

```
SWEEP REPORT — {ISO date}
===========================
TODO.md:       {open} open, {resolved} resolved {fixes applied}
incoming/:     {active} active, {archived} archived
MANIFEST:      {current} current, {stale} stale
decisions.log: {entries} entries
ROADMAP:       {active} active, {done} done, {orphaned} orphaned
Research:      {validated} validated, {active} active

Actions taken: {list of archives, count fixes, stale flags}
```

Write timestamp to `.lattice/last-sweep`:
```
echo "{ISO timestamp}" > .lattice/last-sweep
```

Append to decisions log:
```
{timestamp}	sweep	COMPLETED	all-indexes	todo:{open}/{resolved} incoming:{active}/{archived} manifest:{current}/{stale}	{one-line summary}
```

## Rules

- **Don't delete anything.** Archive to `incoming/archive/`. Stale items may have context that's useful later.
- **Don't change spec content.** Only move files and update index summaries.
- **Be conservative on "implemented" classification.** If you're not sure a spec was fully implemented, keep it as active. A false archive hides work that's not done.
- **Fix counts mechanically.** Don't re-interpret TODO items — just count strikethroughs and commit hashes.
- **This is fast.** If it's taking more than 10 minutes, you're reading too deeply. Skim, count, cross-reference, move on.
