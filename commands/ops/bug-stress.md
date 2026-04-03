---
name: bug-stress
description: After fixing a bug, classify it, stress-test the pattern across downstream subsystems, and grow the oracle. Mandatory post-fix QC.
---

You just fixed a bug. Now harden the system against the pattern. This command runs AFTER the fix, BEFORE the commit.

**Input:** The file(s) you changed to fix the bug, or a description of the bug. Examples:
- `bug-stress backend/services/analysis/classification.py`
- `bug-stress "null severity in recovery endpoint"`
- `bug-stress` (auto-detect from `git diff`)

## Step 1: Classify the bug

Read the fix diff (`git diff` or `git diff --cached`). Determine:

**Subsystem:** Map the changed file(s) to subsystem IDs using the system manifest (`docs/_internal/knowledge/system-manifest.md`). If no manifest exists, identify the module name.

**Pattern family:** Classify into one of these families (or propose a new one):

| Family | Description | Example |
|--------|-------------|---------|
| `null-handling` | Field is null/undefined when code assumes it exists | `avg_severity` undefined for endpoints with no severity |
| `encoding-variance` | CDISC/data allows multiple encodings for same concept | TESTCD "ALT" vs "Alanine Aminotransferase" |
| `threshold-boundary` | Off-by-one, wrong operator, or boundary not tested | `gLower > 0.3` vs `gLower >= 0.3` |
| `domain-logic` | Scientific rule incorrectly implemented | Adverse classification ignoring reversibility |
| `statistical-edge` | Small N, zero variance, all-same values, empty groups | Hedges' g with n=1 producing NaN |
| `contract-drift` | Output format changed but consumer not updated | Backend adds field, frontend doesn't read it |
| `species-variance` | Assumption valid for one species but not others | Rat liver regeneration threshold applied to dog |
| `temporal-edge` | Time-dependent logic with boundary cases | Recovery verdict when recovery period = 0 days |
| `ui-state-sync` | Selection/filter state not propagated across surfaces | Rail selection doesn't update context panel |
| `cascade-failure` | Override or upstream change propagates incorrectly | Pattern override doesn't update downstream NOAEL |

**Severity:** How bad was it?
- **Silent wrong answer** — produced incorrect analytical output without error (worst)
- **Misleading display** — showed wrong data in UI
- **Crash/error** — threw an exception
- **Cosmetic** — visual glitch, no data impact

## Step 2: Identify blast radius

Read the system manifest's adjacency graph. List:
- **Direct consumers** of the affected subsystem
- **2-hop consumers** (consumers of consumers)

```
BUG IN: S{XX} ({name})
DIRECT CONSUMERS: S{YY}, S{ZZ}, ...
2-HOP CONSUMERS: S{AA}, S{BB}, ...
```

## Step 3: Pattern search — does this bug exist elsewhere?

This is the key step. The bug you fixed is one instance of a pattern. Search for the SAME pattern in:

1. **The affected subsystem's other code paths** — if the bug was null-handling in one branch of classification.py, check the other branches
2. **Direct consumer subsystems** — do they make the same assumption that broke?
3. **Sibling subsystems** (same pattern family) — if S02 had a threshold-boundary bug, check S03, S04, S05 which also use thresholds

**Search strategy by pattern family:**

| Family | What to grep for |
|--------|-----------------|
| `null-handling` | Same field name without null guard across consumers |
| `encoding-variance` | Same TESTCD/ORRES/etc. field used without normalization |
| `threshold-boundary` | Same threshold value with different comparison operators |
| `domain-logic` | Same domain rule implemented in multiple places |
| `statistical-edge` | Same statistical function called without n-check |
| `contract-drift` | Same field name across backend→frontend boundary |
| `species-variance` | Same hardcoded constant used across species contexts |
| `cascade-failure` | Same upstream field consumed without re-validation |

Report each finding:
```
SAME PATTERN FOUND:
  File: {path}:{line}
  Subsystem: S{XX}
  Risk: {is this likely to produce the same bug?}
  Action: {fix now / add test / monitor}
```

## Step 4: Verify test coverage

Check that the fix includes a test that:
1. **Reproduces the exact bug** (would fail on the old code)
2. **Covers the edge case** (not just the happy path)
3. **Is in the right test file** for the subsystem

If no test was written: flag it. The pre-commit hook already enforces test-first for pipeline modules, but this catches bugs in non-pipeline code.

## Step 5: Grow the oracle

For each "SAME PATTERN FOUND" in Step 3 that has risk = likely:
- Write a test case for it NOW (not "later")
- If the pattern appears in 3+ subsystems, propose a **pattern test suite** — a parameterized test that checks the pattern across all instances

Check if the validation suite (ground truth studies) exercises this edge case:
- If yes: note which study covers it
- If no: consider whether a new assertion should be added to an existing study's reference card

## Step 6: Log and report

Append to `.lattice/decisions.log`:
```
{timestamp}	bug-stress	{pattern-family}	S{XX}:{bug description}	blast:{consumer count} same-pattern:{count found} tests-added:{count}	{one-line summary}
```

Report:
```
BUG STRESS: {bug description}
================================
Subsystem:    S{XX} ({name})
Pattern:      {family}
Severity:     {silent wrong answer / misleading display / crash / cosmetic}

BLAST RADIUS:
  Direct: {list}
  2-hop:  {list}

SAME PATTERN SEARCH:
  Checked: {count} files across {count} subsystems
  Found:   {count} instances
  {list each with file:line and action}

TESTS:
  Bug test:     {exists / MISSING}
  Pattern tests: {count} added
  Oracle:       {expanded / unchanged}

COMMIT READY: {yes / no — missing tests}
```

## When to use

**Mandatory** after every bug fix that touches engine/analytical code (subsystems S01-S24).

**Recommended** after UI bug fixes that affect data display or interaction state.

**Skip** for pure cosmetic fixes (typos, spacing) with no data impact.

## Rules

- **Fix the pattern, not just the instance.** If you found the same bug in 3 places, fix all 3 in the same commit. A bug fix that knowingly leaves identical bugs elsewhere is incomplete.
- **Tests are not optional.** The bug must have a test. The pattern should have tests. "I'll add tests later" is a lie the codebase has heard before.
- **Silent wrong answers are the highest priority pattern family.** A crash is visible. A wrong NOAEL is invisible until a regulatory reviewer catches it. Prioritize pattern searches for silent-wrong-answer bugs.
- **The oracle must grow.** Every bug fix is evidence that the test suite had a gap. Close the gap.
