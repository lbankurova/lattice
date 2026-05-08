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

**Pattern family:** Classify into one of these families (or propose a new one). The combined table is the universal baseline (Layer 1) plus the project's domain-specific extension (Layer 3, when configured via `lattice-project.toml [skills.bug_stress] pattern_families`):

### Universal baseline (`scaffold/universal-bug-patterns.md`)

| Family | Description | Example |
|--------|-------------|---------|
| `null-handling` | Field is null/undefined when code assumes it exists | a struct field accessed without checking it's set |
| `off-by-one` | Boundary condition wrong: index, length, range, count | `for i in 0..n-1` where the intent is `0..n` |
| `threshold-boundary` | Comparison operator wrong direction or wrong inclusive/exclusive | `x > 0.3` vs `x >= 0.3` |
| `encoding-mismatch` | Same data accessible under multiple encodings; consumer reads one form, producer emits another | `"ALT"` vs `"Alanine Aminotransferase"` |
| `race` | Two or more concurrent paths interleave on shared state | parallel session writes interleave on git index |
| `lock-acquisition-order` | Two locks acquired in different orders → deadlock | thread A: lock(x) lock(y); thread B: lock(y) lock(x) |
| `null-deref` | Dereferencing a value the type system claims is non-null but runtime can be null | TS `!` non-null assertion on async return |
| `regex-backtracking` | Catastrophic backtracking on adversarial input | `^(a+)+$` against `aaaa…X` runs exponentially |
| `encoding-utf8-vs-cp1252` | File I/O without explicit encoding picks platform default | Python on Windows defaults to cp1252 |
| `feature-flag-inversion` | Flag name implies one polarity but code branches on the other | `ENABLE_X = False` but the gate is `if not ENABLE_X` |
| `cache-invalidation` | Cached value not invalidated when source changes; stale read | mutation doesn't invalidate dependent query |
| `path-injection` | User input flows into a file path without sanitization | `open("data/" + user_input)` allows traversal |
| `command-injection` | User input flows into a shell command without escaping | `exec("git log --grep=" + user_input)` |
| `time-zone-drift` | Timestamps stored in one zone, displayed in another, compared in a third | naive datetime compared to UTC |
| `int-overflow` | Arithmetic exceeds the integer type's representable range | int32 multiplied by int32 silently wraps |

### Project-specific families

{{include:project.skills.bug_stress.pattern_families}}

When `[skills.bug_stress] pattern_families` is unconfigured, only the universal baseline applies; the include throws and the skill aborts asking the project author to configure the file or set the key to `""` to acknowledge the project intentionally has no domain-specific families.

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

**Search strategy by pattern family:** consult the per-family search heuristics that ship with each family table — both the universal baseline (`scaffold/universal-bug-patterns.md` § "Search-strategy guidance") and the project-specific extension (when configured) include a "what to grep for" column alongside each pattern. The right grep depends on the family identified in Step 1.

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

## Step 4.5: Coverage-density audit (LIT-07 — Nyquist signal)

A passing bug-fix test confirms the SPECIFIC branch is now covered. It does NOT confirm the SURROUNDING module has structural coverage. The Nyquist question (gsd literature note): *would the existing test suite have caught this bug class structurally, not by accident?* If the answer is no, the bug-pattern search in Step 3 found instances but the codebase has no scaffolding to catch the next instance pre-emptively.

Run the density report on each module changed in the fix:

```bash
C:/pg/pcc/backend/venv/Scripts/python.exe scripts/coverage-density-report.py <changed-module>
```

Supported: `.py` (matches `backend/tests/test_<base>.py` + scans all `backend/tests/test_*.py` for name references), `.ts` / `.tsx` (matches `frontend/tests/<base>.test.ts(x)` and sibling `*.test.ts(x)`).

Output classes:

| Density | Reading | Action |
|---|---|---|
| **>= 65%** (calibrated adequate) | Structurally adequate. Most functions are referenced from at least one test file. | Proceed to Step 5. |
| **35-65%** (mid-range) | Mixed. Verify the unreferenced functions are intentionally test-exempt (glue / wrappers / pure formatters). | Document the exempt set in the bug-stress retrospective; add tests for any that encode domain rules. |
| **< 35%** (calibrated weak) | The bug-pattern search likely under-covered this module. | **Add tests for the listed unreferenced functions before closing the bug-stress retro.** Pair this gap with the Step 3 pattern search — same-pattern instances in undertested code are the highest-priority next-bug surface. |

Thresholds calibrated 2026-04-27 against 7 representative analytical modules. Observed distribution was bimodal: backend modules tend to cluster low (18-33%, heavy use of private `_compute_*` helpers exercised transitively but not name-referenced); frontend modules tend to cluster high (67-80%, vitest tests typically import + call by name). The 35% / 65% bands separate those clusters; the mid-range gap is empirically unpopulated in the current corpus, so a module landing there warrants extra scrutiny.

The check is heuristic — a name reference in a test file proves the function is at least imported and probably exercised, not that branch coverage is good. Pair with explicit branch coverage tooling (pytest --cov, vitest --coverage) when stronger evidence is needed. The density signal is calibrated to surface modules where the test suite cannot, by name reference alone, prove it touches the code path.

The reference map in the script's output also serves as a cheap "where would I add the next test" guide — it shows which integration tests already exercise the module, which is usually the right place to add the next assertion.

## Step 5: Grow the oracle

For each "SAME PATTERN FOUND" in Step 3 that has risk = likely:
- Write a test case for it NOW (not "later")
- If the pattern appears in 3+ subsystems, propose a **pattern test suite** — a parameterized test that checks the pattern across all instances

Check if the validation suite (ground truth studies) exercises this edge case:
- If yes: note which study covers it
- If no: consider whether a new assertion should be added to an existing study's reference card

## Step 6: Persist systemic gaps

If the pattern search (Step 3) found the same bug in 3+ subsystems, this is a **systemic gap** — a pattern family that the test suite and code review process failed to catch across the codebase.

1. **Read `docs/_internal/TODO.md`** — append:
   ```
   - [ ] **PATTERN-GAP: {family} in {N} subsystems** — {description of the systemic pattern}. Found via bug-stress on S{XX}. Instances: {file:line list}. [Area: {relevant}]
   ```

2. If the pattern suggests a deeper research question (e.g., "species-variance bugs in 5 modules suggest species-specific thresholds need systematic review"):
   - **Read `docs/_internal/research/REGISTRY.md`** — add or update a stream with `source: "bug-stress/{pattern-family}"`

Bug-stress finds systemic weaknesses. Persisting them ensures `/lattice:prioritize` and `/ops:sweep` can track and route them.

## Step 7: Log and report

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

## Step 7.5: Bug-pattern registry update (F6 — MANDATORY)

After Step 3 (Pattern search) and before Step 8 (Retrospective), update the project's bug-pattern registry at `{{lattice.project.scripts.bug_patterns_registry}}`:

1. **If the pattern matches an existing entry:** append the new instance to that entry's `representative_instances` list with `file`, `line`, `bug_id`, and `note`. Bump `last_updated`.
2. **If the pattern is new (not in registry):** add a new entry following the schema documented at the top of `bug-patterns.md`. Required fields: `name` (kebab-case), `title`, `status: active`, `root_cause`, `representative_instances`, `applies_to` (glob list), `prevention_property` (F2 link or null), `prevention_fact` (F1 link or null), `prevention_test` (existing test path or null), `introduced`, `last_updated`.
3. Run `python scripts/audit-bug-patterns.py` to verify the registry validates.

The pre-commit hook (Step 0d -- pcc-side) verifies that any future commit touching files in this pattern's `applies_to` glob carries a `kind=bug-pattern` attestation referencing this pattern. Without the registry update, the hook cannot fire on the right files.

## Step 8: Retrospective (MANDATORY — CLAUDE.md rule 20)

Every bug fix is evidence that some gate failed. The retrospective forces that lesson back into the framework. Skipping this step is the failure mode that lets the same class of bug recur.

Run the 5 questions and append the output to the bug's {{lattice.project.bugs.bug_log}} entry under a `#### Retrospective` heading. The pre-commit hook BLOCKS `fix:` commits when these fields are missing.

### Question 1: Root cause (1 sentence)

Name the specific defect — the line of code, the missing guard, the wrong threshold, the unwired requirement. Not the symptom; the cause.

```
Root cause — `{file:line or function name}` {does X / lacks Y / assumes Z}, producing {observed wrong behavior}.
```

### Question 2: Genesis

What decision or process produced the bug? Be specific about the wrong assumption or skipped step.

```
Genesis — {Spec author / implementer / reviewer / autopilot} {assumed X / skipped Y / scoped to Z without auditing W}. The originating artifact was {spec / commit / autopilot batch / refactor cycle} and the unaudited assumption was {one sentence}.
```

### Question 3: Detection gap

For EACH gate the diff passed through, name the gate and explain why it missed this bug:

```
Detection gap —
  - {Gate 1 name} ({verdict}): missed because {reason — outside agent's mandate / wrong question / mocked input / etc.}
  - {Gate 2 name} ({verdict}): missed because ...
  - {Gate N name}: ...
```

Common patterns seen in past retros:
- *Unit tests verify code matches mock inputs, not real data.*
- *Mirror tests verify code matches spec, not spec matches reality.*
- *Architect review checks complexity, not algorithmic defensibility.*
- *Decision auditor flagged correctly but accepted plumbing-only rebuttal (BUG-031).*
- *Spec author treated indefensible output as desired outcome (BUG-031).*
- *DATA check verified spec-vs-code, not code-vs-data-warranted-answer (BUG-031).*
- *No fixture test against real generated JSON existed for the affected algorithm.*

### Question 4: Prevention class

What process change would catch THIS CLASS of bug going forward? Generalize from the instance to the pattern. Avoid "be more careful" — that's not a prevention.

```
Prevention class — {one-paragraph description of the class of bug + the gate/check that would catch it}.
```

Examples of valid prevention classes:
- *Algorithm-defensibility check on real data when consumer code is touched* (BUG-031).
- *Per-day scoping requirement for any aggregation across multi-timepoint endpoints*.
- *Fixture test against generated JSON for any new analytical function.*
- *Gate that verifies SCIENCE-FLAG rebuttals include data-grounded counter-evidence.*

Examples of invalid (insufficient) prevention classes:
- *"Reviewer should have caught it"* — names the same gate that missed it; not a change.
- *"Add more tests"* — too vague to enforce.
- *"Read the code more carefully"* — not a process.

### Question 5: Lattice change

Concrete edits to the framework. List file paths + the specific change. If structural (new skill, new rule, new hook), file a proposal in `incoming/` for the next architect review. If "no change needed," justify why (e.g., bug fits an existing pattern that already has a gate).

```
Lattice change —
  - `{path}` — {specific edit, e.g., "Step 3b: add ALGORITHM CHECK subsection"}
  - `{path}` — {specific edit}
  - ...
```

For BUG-031 in SENDEX the lattice change list is the canonical example — see `{{lattice.project.bugs.bug_log}}#BUG-031` in pcc. Other projects' bug logs will accumulate their own canonical examples over time.

### Question 5 — disposition (F7 — MANDATORY tracking)

Each Lattice-change bullet from Question 5 MUST be dispositioned into one of:

- **(a) Implemented in this commit** — the same `fix:` commit that triggered the retro implements the framework change. (Current default for tightly-scoped retros — BUG-031 was this.)
- **(b) Filed to TODO.md** — append a TODO entry tagged `[from BUG-XXX]` and `autopilot:` per existing TODO conventions; the bullet is tracked but deferred.
- **(c) Filed to ESCALATION.md** — append an ESCALATION entry explaining why neither (a) nor (b) applies (e.g., requires architect-gate revision; needs scientist input; cross-cycle dependency).

For each bullet, compose ONE attestation via the SIMPLIFY-1 unified format BEFORE running `write-review-gate.sh`:

```bash
bash scripts/append-attestation.sh \
  retro-action \
  "BUG-XXX#5.<bullet-N>" \
  "{implemented-this-commit | filed-to-todo | filed-to-escalation | not-applicable}" \
  "{1-line summary identifying the bullet AND the disposition target -- e.g. 'CLAUDE.md rule 19 added at line 84-86' OR 'TODO.md GAP-123 [from BUG-XXX]' OR 'ESCALATION.md entry 2026-04-26 (algorithm path)'}"
```

Bullet numbering is 1-indexed against the order in the rendered Lattice-change list. `not-applicable` is permitted ONLY when the bullet was determined unnecessary in this retro (e.g., duplicate of a prior retro's action item) — the rationale must cite the prior retro and the reason.

The pre-commit hook (Step 5b -- pcc-side) verifies that:
1. The commit has a `Bug-Retro: BUG-XXX` trailer (existing rule 20 check, unchanged).
2. The bug-log entry contains all 5 retro fields (existing check, unchanged).
3. **The gate carries at least one `kind=retro-action` attestation with `ref-prefix=BUG-XXX`** (NEW for F7).

The periodic audit (`scripts/audit-retro-action-items.py`) lints existing entries: when a bug-log entry has Lattice-change bullets but no F7 disposition table, no fix commit, no `[from BUG-XXX]` TODO tag, and no ESCALATION entry referencing the bug id, the bullets are reported as silently-abandoned. Pre-F7 retros can be retroactively annotated with an explicit "F7 disposition" subsection (BUG-031 in pcc has the canonical example) — the audit script accepts the table itself as evidence.

Failure mode this prevents: rule 20 added action items but nothing enforced their tracking; past retros (informal, pre-rule-20) had action items that were quietly dropped. F7 makes the drop the explicit (a/b/c) decision rather than implicit silence.

### Output

Append directly to the bug's {{lattice.project.bugs.bug_log}} entry:

```markdown
#### Retrospective

1. **Root cause** — ...
2. **Genesis** — ...
3. **Detection gap** —
   - {gate}: missed because ...
   - ...
4. **Prevention class** — ...
5. **Lattice change** —
   - `{path}` — {edit}
   - ...
```

After writing the retro: if the lattice change requires structural edits beyond a one-line rule tweak, present the proposal to the user before editing framework files. The user owns lattice direction.

## When to use

**Mandatory** after every bug fix that touches engine/analytical code (subsystems S01-S24).

**Recommended** after UI bug fixes that affect data display or interaction state.

**Skip** for pure cosmetic fixes (typos, spacing) with no data impact.

## Rules

- **Fix the pattern, not just the instance.** If you found the same bug in 3 places, fix all 3 in the same commit. A bug fix that knowingly leaves identical bugs elsewhere is incomplete.
- **Tests are not optional.** The bug must have a test. The pattern should have tests. "I'll add tests later" is a lie the codebase has heard before.
- **Silent wrong answers are the highest priority pattern family.** A crash is visible. A wrong NOAEL is invisible until a regulatory reviewer catches it. Prioritize pattern searches for silent-wrong-answer bugs.
- **The oracle must grow.** Every bug fix is evidence that the test suite had a gap. Close the gap.
