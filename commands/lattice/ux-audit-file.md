---
name: ux-audit-file
description: Stage 3 of the UX audit pipeline. Promotes validated findings (KEPT, CONVENTION VIOLATION, REFRAMED → wire, AMBIGUOUS) into TODO.md GAP entries with the correct recommendation form, then closes out the audit's INDEX status.
---

You are running **Stage 3** (terminal stage) of the 3-stage UX audit pipeline:

```
/lattice:ux-audit-walk       <persona> <workflow>     # candidate audit README
/lattice:ux-audit-validate   <audit-path>             # filtered hypotheses → VALIDATED.md
/lattice:ux-audit-file       <audit-path>             # this skill — VALIDATED → TODO.md
```

Your job: take a `VALIDATED.md` produced by Stage 2 and write its KEPT / CONVENTION-VIOLATION / REFRAMED / AMBIGUOUS findings into `{{lattice.project.backlog.todo}}` as new GAP entries with the right shape, then close out the audit. **You must not promote anything that Stage 2 marked WRONG** — those are refuted hypotheses, not gaps.

---

## Input

- `audit-path` — same shape as Stage 2: `{{lattice.project.docs.workflow_audits_dir}}/{persona}-{workflow}`. Must contain `VALIDATED.md`. If `VALIDATED.md` is absent, ask the user — Stage 2 has not been run.

---

## Step 0: Read inputs

1. `{audit-path}/VALIDATED.md` — the validated dispositions.
2. `{audit-path}/README.md` — for context (persona, workflow, observed surfaces).
3. `{{lattice.project.backlog.todo}}` — to find the next GAP-NNN number and to scan for duplicate / overlapping existing GAPs.
4. `{{lattice.project.docs.capabilities}}` — to identify which capability pillar(s) the GAPs touch (informs `[Area: ...]` tag and cross-references).

## Step 1: Pick the next GAP-NNN

Grep `{{lattice.project.backlog.todo}}` for `^### GAP-` and find the largest existing number. Allocate sequential numbers from `MAX + 1`. Reserve a contiguous block equal to the count of items you'll file (KEPT + CONVENTION + REFRAMED + AMBIGUOUS).

Note the block in your scratch state — `GAP-{N}..GAP-{M}`.

## Step 2: Duplicate scan

For each KEPT / CONVENTION / REFRAMED finding, grep `TODO.md` for keywords from the finding's UI surface (e.g., "Hy's Law", "OUTLIERS Excl.", "AnimalExclusion"). If you find a structurally similar existing GAP:

- **Do not file a duplicate.** Instead, edit the existing GAP to add a `**Cross-ref:**` line pointing to this audit and noting any new evidence the audit surfaced.
- Reserve the GAP-NNN slot you would have used by leaving it unallocated (don't shift the others up — gaps in numbering are fine and preserve traceability).
- Note in the audit's filing summary that the finding merged into the existing GAP.

## Step 3: Recommendation form by disposition

For each non-WRONG finding from VALIDATED.md, file using this form:

### KEPT — genuine missing capability

```markdown
### GAP-NNN: {short title — what's missing} [Area: UI | Engine | Backend | Science | combinations]
- **autopilot:** {ready _score: N_ | waiting-data | deferred-dg | needs-user}
- **Source:** Workflow audit `audits/workflow-audits/{persona}-{workflow}/README.md` step {N} (YYYY-MM-DD); validated `audits/workflow-audits/{persona}-{workflow}/VALIDATED.md`.
- **What:** {1-3 sentences — observed state quoting README.md verbatim where possible}
- **What needed:** {concrete recommendation — what to build, where to build it, what shape}
- **Why:** {persona impact in 1 sentence}
- **Status:** Open. P{1|2|3}.
```

### CONVENTION VIOLATION — utility/rule exists but cited surface bypasses it

```markdown
### GAP-NNN: {short title} — convention violation [Area: UI]
- **autopilot:** ready _score: {N}_
- **Source:** Workflow audit `audits/workflow-audits/{persona}-{workflow}/README.md` step {N} (YYYY-MM-DD); validated as **convention violation** per `.claude/rules/design-decisions.md` row {N} ({rule short name}).
- **What:** {cited surface} renders `{example string}` by {bypass mechanism — e.g., manual concatenation in `<file:line>` instead of `<canonical-utility>`}.
- **What needed:** Replace {bypass} with `<canonical-utility>` in {cited file}. The 3-tier convention (or whichever rule applies) requires {brief rule restatement}.
- **Why:** {analytical impact + the convention-violation specifics — labels collide, format mixes within a chart, etc.}
- **Status:** Open. P{1|2|3}.
```

### REFRAMED → wire — built-not-mounted component

```markdown
### GAP-NNN: Wire {ComponentName} into {target view/pane} [Area: UI]
- **autopilot:** ready _score: {N}_  ({higher than build-from-scratch — wire is cheap})
- **Source:** Workflow audit `audits/workflow-audits/{persona}-{workflow}/README.md` step {N} (YYYY-MM-DD); validated as **built-not-mounted** per `.claude/rules/ux-audit-validate.md` Section 4.
- **What:** Component exists at `frontend/src/components/.../{ComponentName}.tsx` ({brief description of what it provides — line range or LOC}). Zero imports across `frontend/src/`. {Cited persona surface} has no path to this content.
- **What needed:** Mount `{ComponentName}` in `{target component path}` as a {sub-pane | tab | route}. {Any extension needed beyond pure mount, e.g., "extend with X / Y filters per audit feedback"}.
- **Why:** {persona impact — and explicit note that this is a wire-not-build effort estimate}
- **Status:** Open. P{1|2|3}.
```

### AMBIGUOUS — needs runtime repro before promotion

```markdown
### INVESTIGATE-NNN: {short title — what was claimed} [Area: UI]
- **autopilot:** needs-user
- **Source:** Workflow audit `audits/workflow-audits/{persona}-{workflow}/README.md` step {N} (YYYY-MM-DD); validated as **AMBIGUOUS** — Stage 2 could not resolve from code alone, runtime repro required before promoting to GAP.
- **What:** {observed claim verbatim from README.md, with note on what code check showed}.
- **Repro plan:** {specific steps the user (or a follow-on Playwright session) should run to confirm/refute, e.g., "navigate to PointCross > Findings > select ALT > inspect SyndromeContextPanel via DevTools; confirm whether the cited text actually overflows or whether the audit's ellipsis is its own quote convention"}.
- **Status:** Open. Investigate before promoting.
```

> **Numbering convention:** INVESTIGATE entries draw from the same number block as GAPs. They are promoted to GAPs (with the same number, prefix swapped) only after runtime repro confirms the claim.

## Step 4: Update INDEX.md

Mark the audit's status in `{{lattice.project.docs.workflow_audits_dir}}/INDEX.md` from `VALIDATED` to `FILED ({N} GAPs, {M} INVESTIGATE)`. Reference the GAP-NNN range in a note column.

## Step 5: Update VALIDATED.md filing summary

Append a `## Filed` section to `{audit-path}/VALIDATED.md`:

```markdown
## Filed

| Disposition | Walk step | Filed as | Notes |
|---|---|---|---|
| KEPT | Step N | GAP-NNN | (or "merged into existing GAP-XXX") |
| CONVENTION VIOLATION | Step N | GAP-NNN | per design-decisions.md row N |
| REFRAMED → wire | Step N | GAP-NNN | wire {Component} into {target} |
| AMBIGUOUS | Step N | INVESTIGATE-NNN | needs runtime repro |
| WRONG | Step N | (not filed) | per VALIDATED.md disposition |

Filed YYYY-MM-DD by `/lattice:ux-audit-file`.
```

## Step 6: Theme registry update (manual, escalate)

Stage 3 does NOT promote themes automatically. Theme promotion requires cross-audit synthesis (a single citation isn't enough to promote a theme). After filing:

- If VALIDATED.md notes new candidate themes touched, append to a "Pending theme review" section in `{{lattice.project.docs.workflow_audits_dir}}/THEMES.md` with the audit citation.
- Tell the user in the hand-off that themes are pending manual review.

## Step 7: Run autopilot tagger

If the user has the autopilot tagger script available (`scripts/tag-todo-autopilot.py`), suggest running it to re-tag and re-score the new entries:

```
python scripts/tag-todo-autopilot.py --in {{lattice.project.backlog.todo}} --out-active {{lattice.project.backlog.todo}} --out-archive docs/_internal/TODO-archive.md
```

(Don't run it yourself unless the user authorizes — it rewrites the entire TODO.md.)

## Step 8: Hand off

End your turn with:

```
FILE COMPLETE — {persona}-{workflow}
Audit:    {{lattice.project.docs.workflow_audits_dir}}/{persona}-{workflow}/
Filed to: {{lattice.project.backlog.todo}} (GAP-{NNN}..GAP-{MMM})

Breakdown:
  KEPT                 → {K} new GAPs, {X} merged into existing
  CONVENTION VIOLATION → {C} new GAPs (cite design-decisions.md rows: {list})
  REFRAMED → wire      → {R} new GAPs (built-not-mounted: {component list})
  AMBIGUOUS            → {A} INVESTIGATE entries (need runtime repro)
  WRONG                → {W} not filed (refuted at validate; see VALIDATED.md history)

Pending manual review:
  Themes added to "Pending theme review" in THEMES.md: {list, or "none"}
  Run `python scripts/tag-todo-autopilot.py ...` to re-tag autopilot scores.
```

---

## Rules

- **Never file WRONG findings.** Stage 2 marked them refuted — promoting them is a defect.
- **Filed text must trace to evidence.** Every `What needed:` line must be derivable from the VALIDATED.md disposition + the README.md observation. Do not invent recommendations the audit didn't support.
- **Recommendation form is structural, not stylistic.** A REFRAMED entry says "wire X into Y" with the component path and target — not "build a Recovery feature." A CONVENTION VIOLATION entry cites the rule row, not "follow the design system." Form difference signals effort estimate.
- **De-duplicate before filing.** Two audits citing the same gap should produce one GAP entry with two cross-refs, not two near-identical GAPs.
- **You don't pick priority.** Default to P3 unless VALIDATED.md or the audit's `Why:` line provides explicit signal for P1/P2 (regulatory blocker, primary persona blocker, multi-audit convergence). When in doubt, P3 — the user re-prioritizes via `/lattice:prioritize` later.
- **You don't update capabilities.yaml.** If a finding shows that capabilities.yaml has drift (claims "no UI" when UI exists), file a doc-drift GAP rather than editing the capabilities file directly. The capability file's truth has to come from a deliberate `/lattice:probe` or doc-refresh pass, not from a UX audit's side-effect.

## Cross-references

- `{{lattice.project.backlog.todo}}` — the destination
- `{{lattice.project.docs.workflow_audits_dir}}/CORRIGENDA.md` — exemplar GAP-delta document showing recommendation forms
- `.claude/rules/ux-audit-validate.md` — Stage 2 rule file (sections 3 + 4 underpin recommendation forms here)
- `{{lattice.project.docs.capabilities}}` — pillar lookup for `[Area: ...]` tagging
- `docs/_internal/knowledge/autopilot-flow.md` — autopilot scoring rubric (pillars × data × impl)
