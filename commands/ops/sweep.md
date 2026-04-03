---
name: sweep
description: Garbage collection for project state — validate and clean TODO.md, ROADMAP.md, incoming/, MANIFEST.md, decisions.log. Prerequisite for /lattice:prioritize.
---

You are running a state sweep — validating and cleaning all project index files so downstream skills (especially `/lattice:prioritize`) read accurate data.

**Input:** None. Reads all index files automatically.

This is mechanical work — recount, cross-reference, archive. Not analytical. Target: 5 minutes, not 30.

**Every step is mandatory.** A partial sweep is what causes prioritize to give bad recommendations — one stale index poisons the ranking. Sweep everything or sweep nothing.

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

## Step 2: ROADMAP.md Cross-Reference

ROADMAP is the highest-impact index for prioritization accuracy. `/lattice:prioritize` reads it first. Stale ROADMAP entries directly cause bad recommendations (e.g., recommending features that already shipped).

Read `docs/_internal/ROADMAP.md`. For each item:

1. **Check linked specs.** If the item references `Spec: incoming/X.md`:
   - Does `incoming/X.md` still exist? → item is active
   - Was it moved to `incoming/archive/`? → item is **done but unmarked** — flag it
   - Does the file not exist at all? → orphaned reference — flag it

2. **Check git log.** Search recent commits for the item's key terms. If substantial implementation commits exist but the item is still marked "Open", flag as **done but unmarked**.

3. **Check for items with no spec and no commits.** These are either aspirational (fine) or forgotten (flag for review).

**For every "done but unmarked" item:** Mark it with strikethrough or "Done" status + the commit hash or archive reference. Don't leave it for the next sweep.

Report: `ROADMAP: {N} items — {A} active, {B} done (newly marked), {C} orphaned`

## Step 3: incoming/ Spec Audit + ROADMAP Backlink

Read `docs/_internal/incoming/`. For each `.md` file:

1. **Check git log** for commits referencing this spec
2. **Check ROADMAP.md** for entries linking to this spec
3. **Classify:**

| Status | Criteria | Action |
|--------|----------|--------|
| **Implemented** | Commits reference this spec, features exist in code | Move to `incoming/archive/`, note commit hash |
| **Superseded** | A newer spec covers the same area | Move to `incoming/archive/`, note superseding spec |
| **Active** | No implementation found, spec is still relevant | Keep, verify it has a ROADMAP entry (rule 12) |
| **Stale** | >90 days old, no ROADMAP entry, no recent references | Move to `incoming/archive/` with "stale" note |

**After archiving:** For every spec just archived, scan ROADMAP for entries that reference it (`Spec: incoming/{filename}`). If found and still marked active, update the ROADMAP entry to reflect the archive (mark done, add archive reference). This is the cross-reference that was missing — archiving specs without updating ROADMAP leaves prioritize reading "Open" items that are actually shipped.

Report: `incoming/: {N} specs — {A} active, {B} archived (implemented), {C} archived (stale). ROADMAP backlinks updated: {D}`

## Step 4: MANIFEST.md Staleness Check

Read `docs/_internal/MANIFEST.md`. For each tracked asset:

1. Check "Last validated" date
2. Check "Depends on" files — have any been modified since last validation? (`git log --since="{last_validated}" -- {file}`)
3. If dependencies changed since last validation, mark as `STALE — dependencies modified since {date}`

Report: `MANIFEST: {N} assets — {A} current, {B} stale`

## Step 5: decisions.log Maintenance

Read `.lattice/decisions.log`.

1. Count total entries
2. If >200 entries: archive entries older than 90 days to `.lattice/decisions-archive-{date}.log`
3. Check for duplicate entries (same skill + context + outcome within 1 hour)
4. Report: `decisions.log: {N} entries ({M} active, {K} archived)`

## Step 6: Research INDEX.md

If `docs/_internal/research/INDEX.md` exists:

1. Verify each listed research file still exists at the stated path
2. Check status markers (active/validated/dormant) against peer review files — a "validated" doc should have R2 review
3. Flag research docs not in the index (orphaned)

Report: `Research: {N} docs — {A} validated, {B} active, {C} dormant, {D} orphaned`

## Step 7: Coverage Facts Freshness

If `scripts/generate-coverage-facts.py` exists (project has coverage tracking):

1. **Check coverage-facts.md age.** Read the generation timestamp from `docs/_internal/help/coverage-manifest.json` (field: `generated_at` or `commit`). Compare against latest engine file commits:
   ```bash
   git log -1 --format="%H" -- backend/services/analysis/ backend/generator/ frontend/src/lib/
   ```
   If engine files have been committed since the last coverage-facts generation, flag: `COVERAGE STALE — engine files changed since last generation.`

2. **Regenerate if stale.** Run:
   ```bash
   cd $REPO_ROOT && backend/venv/Scripts/python.exe scripts/generate-coverage-facts.py
   ```
   Stage the updated files.

3. **Cross-check wiki.** If `docs/_internal/help/wiki_sendex_coverage.md` exists, scan for `[CF §N]` references. For each section header in coverage-facts.md, check if the wiki has a corresponding `[CF §N]` reference. Flag sections with no wiki reference as: `WIKI GAP — coverage-facts §{N} ({section name}) not referenced in wiki.`

Report: `Coverage: {current|stale|regenerated}, wiki gaps: {N}`

## Output

Write a sweep report and record the timestamp:

```
SWEEP REPORT — {ISO date}
===========================
TODO.md:       {open} open, {resolved} resolved {fixes applied}
ROADMAP:       {active} active, {done} done (newly marked), {orphaned} orphaned
incoming/:     {active} active, {archived} archived, {backlinks updated} ROADMAP backlinks
MANIFEST:      {current} current, {stale} stale
decisions.log: {entries} entries
Research:      {validated} validated, {active} active
Coverage:      {current|regenerated}, wiki gaps: {N}

Actions taken: {list of archives, count fixes, stale flags, ROADMAP updates}
```

Write timestamp to `.lattice/last-sweep`:
```
echo "{ISO timestamp}" > .lattice/last-sweep
```

Append to decisions log:
```
{timestamp}	sweep	COMPLETED	all-indexes	todo:{open}/{resolved} roadmap:{active}/{done}/{orphaned} incoming:{active}/{archived} manifest:{current}/{stale}	{one-line summary}
```

## Rules

- **Every step is mandatory.** No skipping, no "low priority." A partial sweep is worse than no sweep — it gives false confidence that state is clean.
- **Don't delete anything.** Archive to `incoming/archive/`. Stale items may have context that's useful later.
- **Don't change spec content.** Only move files and update index summaries.
- **Always backlink.** When archiving a spec, always check ROADMAP for references and update them. This is the cross-reference that prevents "Open" items from pointing to shipped work.
- **Be conservative on "implemented" classification.** If you're not sure a spec was fully implemented, keep it as active. A false archive hides work that's not done.
- **Fix counts mechanically.** Don't re-interpret TODO items — just count strikethroughs and commit hashes.
- **This is fast.** If it's taking more than 10 minutes, you're reading too deeply. Skim, count, cross-reference, move on.
