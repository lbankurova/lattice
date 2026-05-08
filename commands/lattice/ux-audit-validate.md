---
name: ux-audit-validate
description: Stage 2 of the UX audit pipeline. Filters walk-time GAP candidates against rule files + code via the 5-step Grep checklist + pre-approved conventions. Required before any walk-time GAP becomes a TODO entry.
---

You are running **Stage 2** of the 3-stage UX audit pipeline:

```
/lattice:ux-audit-walk       <persona> <workflow>     # candidate audit README
/lattice:ux-audit-validate   <audit-path>             # this skill — filters hypotheses
/lattice:ux-audit-file       <audit-path>             # validated findings → TODO.md
```

**Mandate:** the rule file at `{{lattice.project.docs.ux_audit_validate}}` is your specification. Do not paraphrase or re-derive its checks — apply them. This skill is the executor; the rule file is the law. If the rule file changes, the skill picks up the change automatically.

**Empirical justification:** the 2026-04-26 sweep had ~21% walk-time GAP refute rate. Skipping this stage means filing 1 in 5 GAPs as false positives. Validation is mandatory.

---

## Input

- `audit-path` — path to a walked audit, e.g., `{{lattice.project.docs.workflow_audits_dir}}/p1-noael-determination`. Must contain a `README.md` produced by `/lattice:ux-audit-walk` with `STATUS: WALK-ONLY (UNVALIDATED)` in its header.

If the path does not exist or the README does not show that status header, ask the user — you may have been pointed at a non-walk artifact.

---

## Step 0: Read the rule file (mandatory)

Read `{{lattice.project.docs.ux_audit_validate}}` in full. This contains:

- Section 1: pipeline definition.
- Section 2: the 5-step Grep checklist (with the **Step 0** prefix that reads `.claude/rules/design-decisions.md` and `.claude/rules/frontend-ui-gate.md` first).
- Section 3: pre-approved conventions (a–e: right-click overrides, OverridePill, vocabulary tooltips, dose label tiers, route consolidation).
- Section 4: built-not-mounted inventory.
- Section 5: verdict-tag conventions (which require code proof).
- Section 7: theme citation suppression rules.

These are not suggestions — they are the criteria you apply.

Then read **`.claude/rules/design-decisions.md`** and **`.claude/rules/frontend-ui-gate.md`** in full. The 2026-04-26 GAP-308 miss happened because validators did not consult the always-loaded rule files first; do not repeat the mistake.

## Step 1: Read the candidate audit

Read the entire `README.md` at the audit path. Make a list of every claim that produced a non-PASS verdict — `FRICTION`, `PASS w/ FRICTION`, `GAP`, `GAP (architectural)`, `DEAD-END (real bug)`. For each, capture:

- Step number.
- Verdict tag.
- Cited UI element (component name, route path, or DOM region described).
- The "missing" / "wrong" claim verbatim from the audit.

Also read the **Open questions for validate** section — those are the walker's explicit requests for code lookup.

## Step 2: Apply Step 0 (rule files first) per claim

For every claim from Step 1:

1. Search `.claude/rules/design-decisions.md` for the cited UI element type (dose label, severity color, tier badge, casing, etc.). If a documented utility or convention applies, the claim becomes one of:
   - **WRONG** if the audit asked for behavior the rule already mandates and the cited surface complies.
   - **WEAKENED → CONVENTION VIOLATION** if the rule mandates a utility (e.g., `getDoseLabel()`) and the cited surface bypasses it. This is still a real gap, but the framing changes from "format bug" to "convention violation per design-decisions.md row N." Cite the row.
2. Search `.claude/rules/frontend-ui-gate.md` for the cited element. If documented (Rule 0 reference component, Rule 6 existing utility), apply same logic.

Record results inline before moving to code grep.

## Step 3: Apply the 5-step Grep checklist

For each remaining claim, run the matching check from Section 2 of the rule file. Use `Grep` (or the project-scoped Grep tool) — never `bash grep`.

| Claim shape | Check |
|---|---|
| "no tooltip on `<token>`" | `grep -rn 'title="[^"]*<token>' frontend/src` |
| "no visible affordance" / "hidden right-click only" | grep `cell-overridable` and `bg-violet` in `frontend/src/components` and `frontend/src/index.css:147-164` |
| "feature not in UI" / "no UI surface" | `grep -rn '<ComponentName' frontend/src` AND `grep -rn 'import.*ComponentName' frontend/src` — distinguishes built-not-mounted from genuinely unbuilt |
| "disabled button without explanation" | grep for `disabled` near the cited component then check for `title=` |
| "text truncated mid-sentence" | grep `truncate\|line-clamp\|overflow-hidden` in cited component — if zero matches, audit's quote convention is the ellipsis source |
| "no drill-in" / "click does nothing" | grep `onClick\|onPress\|cursor-pointer` in cited component; if handler exists, re-scope to "downstream renderer fails" |
| `DEAD-END (real bug)` | **strict** — must show: (a) component grep with zero mounts, OR (b) console-error from runtime, OR (c) explicit `null` return in mount path. No proof → AMBIGUOUS, not refutation either way (needs runtime repro by user). |

Record each check verbatim with quoted code snippets and `file:line` evidence.

## Step 4: Apply pre-approved-convention suppression

Cross-check each remaining `GAP` against Section 3 of the rule file:

- **3a (right-click override on table cells):** if the audit cites lack of override affordance on a cell using `cell-overridable`, **WRONG**.
- **3b (OverridePill note-presence indicator):** if the audit calls the dot a "pink override-state collapsed indicator," **WRONG** — color is blue/grey, semantics is note-presence on already-overridden cells.
- **3c (vocabulary tooltips):** if the audit cites a token in the table (Bio, LOO, POC, S2-S4, XS01-09, mechanism enums, retained-effect, etc.), **WRONG**.
- **3d (dose label tier system):** if the audit cites "raw dose number rendered" without checking which tier applies, run the tier check: which surface is this (axis/legend/header)? Does the cited code bypass `dose-label-utils.ts`? If bypass → **CONVENTION VIOLATION** (real gap, reframed). If correct tier → **WRONG**.
- **3e (route consolidation `<Navigate>`):** if the audit cites `/noael-determination`, `/target-organs`, etc. as 404 / dead route, **WRONG** — those are intentional redirects (`App.tsx:99-115`). The MANIFEST.md drift portion CAN remain a real gap (separate item).

## Step 5: Apply built-not-mounted check

For every `GAP` that says "component missing" or "no UI surface", cross-check Section 4 of the rule file (the built-not-mounted inventory snapshot, plus any current entries you find).

- If component file exists in `frontend/src/components/` but `import.*ComponentName` returns zero hits across `frontend/src/`: **REFRAME** from "build new feature" to "wire `ComponentName` into {target}". Note the cheaper effort estimate.
- If component file does not exist at all: **KEEP as genuine build gap.**

When you find new built-not-mounted components during this validation pass, append them to Section 4 of the rule file (it's a live inventory).

## Step 6: Apply theme suppression

Use Section 7 of the rule file. For each candidate theme citation in the audit:

- CT-3: suppress if the cited surface is OverridePill.
- CT-7: suppress if cited route is in App.tsx Navigate redirect list (MANIFEST drift portion can stay).
- CT-9: suppress if cited token has tooltip in Section 3c table.
- CT-11: suppress entirely (theme refuted 2026-04-26).
- CT-13: reframe as "AuditTrailPanel built-not-mounted."
- CT-15: split — `RecoveryPane` retracted (user 2026-04-26, dead-code candidate); AnimalExclusion partial-UI portion stays.
- CT-22: suppress entirely (theme refuted 2026-04-26).

## Step 7: Write the validated findings document

Write to `{audit-path}/VALIDATED.md` (sibling of the walk's `README.md`). Format:

```markdown
# Validated Findings — {Persona name}: {Workflow human-readable name}

> Validation date: YYYY-MM-DD. Walk artifact: `README.md`. Validator: claude-code via `/lattice:ux-audit-validate`.
> Rule file applied: `{{lattice.project.docs.ux_audit_validate}}` (read in full at validate time).
> **STATUS: VALIDATED.** Eligible for `/lattice:ux-audit-file` to file remaining KEPT findings to TODO.md.

## Validation summary

| Walk verdict | Walk count | KEPT | WRONG | WEAKENED / CONVENTION VIOLATION | REFRAMED (built→wire) | AMBIGUOUS |
|---|---:|---:|---:|---:|---:|---:|
| GAP | N | a | b | c | d | e |
| GAP (architectural) | N | ... | ... | ... | ... | ... |
| DEAD-END (real bug) | N | ... | ... | ... | ... | ... |
| FRICTION (informational) | N | n/a | n/a | n/a | n/a | n/a |

**Refute rate this audit:** (WRONG + WEAKENED) / (WRONG + WEAKENED + KEPT + REFRAMED) = X%.
**Sweep contribution:** if this raises the rolling rate above 15%, flag for walk-methodology revision (Section 8 of rule file).

---

## Per-claim disposition

### Step N — {step name} — {walk verdict}

- **Walk claim:** {verbatim from README.md}
- **Rule-file check (Step 0):** {what design-decisions.md / frontend-ui-gate.md says}
- **Code check:** {grep command run + quoted evidence with file:line}
- **Convention suppression:** {applied? cite section 3a/b/c/d/e}
- **Built-not-mounted check:** {N/A or "imports=0; component at <path>"}
- **Disposition:** **{KEPT | WRONG | WEAKENED → CONVENTION VIOLATION | REFRAMED → wire | AMBIGUOUS}**.
- **Rationale:** {1-2 sentences citing rule-file section + grep evidence}
- **Recommendation form (filed by Stage 3):**
  - For KEPT: file as new GAP-NNN with the original claim.
  - For WEAKENED: file as new GAP-NNN reframed as "convention violation per `.claude/rules/design-decisions.md` row N."
  - For REFRAMED: file as new GAP-NNN with reframed scope ("wire {Component} into {target}; {component path}").
  - For AMBIGUOUS: file as new INVESTIGATE-NNN; needs runtime repro before promotion to GAP.
  - For WRONG: do not file. Note in the audit's history.

[... repeat for each non-PASS claim ...]

---

## Theme citation outcomes

| Walk-time theme touched | Disposition | Reason |
|---|---|---|
| {CT-N} | {KEPT / SUPPRESSED / NARROWED} | {section reference} |

## Inventory updates

- **New built-not-mounted components found this pass:** {list, or "none"}. Appended to Section 4 of `{{lattice.project.docs.ux_audit_validate}}`: {yes/no}.
- **New pre-approved conventions surfaced:** {list, or "none"}. Propose addition to Section 3 of rule file by editing it directly with the new entry.

## Open items for /lattice:ux-audit-file

- KEPT: {count} — file as GAP entries.
- WEAKENED → CONVENTION VIOLATION: {count} — file as GAP entries with reframed wording.
- REFRAMED → wire: {count} — file as GAP entries with wire-not-build wording + component path.
- AMBIGUOUS: {count} — file as INVESTIGATE entries (runtime repro needed).
```

## Step 8: Update the walk README header

Edit the walk's `README.md`: change the status line from `STATUS: WALK-ONLY (UNVALIDATED)` to `STATUS: VALIDATED — see VALIDATED.md`. Do NOT delete the candidate findings — they remain as historical record (per the post-validation sweep precedent).

## Step 9: Update INDEX.md

Mark the audit's status in `{{lattice.project.docs.workflow_audits_dir}}/INDEX.md` as `VALIDATED` (was `WALKED`).

## Step 10: Hand off

End your turn with:

```
VALIDATE COMPLETE — {persona}-{workflow}
Walk artifact:      {{lattice.project.docs.workflow_audits_dir}}/{persona}-{workflow}/README.md
Validated findings: {{lattice.project.docs.workflow_audits_dir}}/{persona}-{workflow}/VALIDATED.md

Disposition: {K} KEPT, {W} WRONG, {C} CONVENTION VIOLATION, {R} REFRAMED → wire, {A} AMBIGUOUS.
Refute rate this audit: {X}%.

NEXT: run `/lattice:ux-audit-file {persona}-{workflow}` to file KEPT/CONVENTION/REFRAMED to TODO.md.
```

Do NOT update TODO.md, do NOT promote themes — that's Stage 3 + the manual themes-update process.

---

## Rules

- **Code is one oracle. Documented conventions are another.** A claim refuted by a grep is no more authoritative than a claim refuted by `.claude/rules/design-decisions.md`. Both must be checked.
- **Quote, don't summarize.** Every disposition must cite `file:line` AND a verbatim quote of the relevant code or rule snippet. "I checked and the tooltip exists" is not validation; quoting `OutliersPane.tsx:378  title="Biological outlier flag..."` is.
- **AMBIGUOUS is not a synonym for WRONG.** When the code can't resolve the claim (e.g., the audit says "text truncated mid-sentence" and you find no truncate class but also no way to verify the screenshot from code alone), record AMBIGUOUS and route to runtime repro. Do not silently retract.
- **Keep the walk-time README intact.** Don't edit candidate claims — write VALIDATED.md as a separate sibling so the audit's progressive disclosure is preserved.
- **Suppress, don't argue.** When a pre-approved convention applies, write "WRONG per Section 3a" — don't re-debate the merits of the convention. The convention is the law; if it should change, that's a separate `/lattice:design` workflow.

## Cross-references

- `{{lattice.project.docs.ux_audit_validate}}` — your specification
- `.claude/rules/design-decisions.md` — Step 0 oracle
- `.claude/rules/frontend-ui-gate.md` — Step 0 oracle
- `{{lattice.project.docs.workflow_audits_dir}}/CORRIGENDA.md` — exemplar disposition document from the 2026-04-26 sweep
- `{{lattice.project.docs.workflow_audits_dir}}/THEMES-VS-CODE-AUDIT.md` — exemplar theme suppression document
