---
name: ux-audit-walk
description: Stage 1 of the UX audit pipeline. Playwright walk of a persona × workflow that produces a candidate audit README. Output is hypotheses, NOT findings — must be filtered by /lattice:ux-audit-validate before any GAP is filed.
---

You are running **Stage 1** of the 3-stage UX audit pipeline:

```
/lattice:ux-audit-walk       <persona> <workflow>     # this skill — produces candidate README
/lattice:ux-audit-validate   <audit-path>             # applies rule file + 5-step Grep checklist
/lattice:ux-audit-file       <audit-path>             # validated findings → TODO.md
```

**Your output is a hypothesis document.** Do not present GAPs as confirmed. Empirical: the 2026-04-26 sweep had ~21% walk-time GAP refute rate. The validate stage is mandatory before any walk-time GAP becomes a TODO entry. State this in the audit README header.

---

## Inputs

- `persona` — one of `p1` (Study Director), `p2` (Pathologist), `p4` (Data Manager), `p5` (Biostatistician), `p6` (QA Auditor). **Exclude regulatory personas (p3, p7).**
- `workflow` — kebab-case slug. Examples: `noael-determination`, `mortality-disposition`, `pattern-override`, `loo-outlier-audit`. Must match (or extend) the inventory in `{{lattice.project.docs.workflow_audits_dir}}/INDEX.md`.

If either argument is missing, ask the user. Do not guess the workflow.

---

## Step 0: Set up

1. Read the persona definition in `{{lattice.project.docs.design_system_dir}}/datagrok-app-design-patterns.md`.
2. Read the audit inventory: `{{lattice.project.docs.workflow_audits_dir}}/INDEX.md`. Confirm whether this persona × workflow already has an audit. If yes, ask the user whether to re-walk (and what to do with the prior audit) before proceeding.
3. Read `{{lattice.project.docs.workflow_audits_dir}}/THEMES.md` so you know which patterns to look for and which suppression rules apply (Section 7 of `{{lattice.project.docs.ux_audit_validate}}`).

## Step 1: Pick the study fixture

Open `{{lattice.project.docs.workflow_audits_dir}}/STUDY-FIXTURES.md`. Look up the workflow you're auditing in the per-workflow reverse index.

- Use the **primary** fixture.
- If primary is unavailable (data-gen failed, study removed from `backend/generated/`), use the **fallback**.
- If both unavailable, escalate to the user. Do NOT pick a different study yourself — fixture choice determines which edge cases the audit exercises.

State the fixture choice in the audit header before walking.

## Step 2: Start the app

Verify both the backend and frontend dev servers are reachable:

- Backend: `http://localhost:8000/docs` (FastAPI Swagger).
- Frontend: `http://localhost:5173/` (Vite).

If either is down, tell the user how to start it (per `CLAUDE.md` Development Commands) and stop. Do not try to start servers yourself with `--reload` while other work is running — `pip install` and `--reload` interact badly per CLAUDE.md.

## Step 3: Walk the workflow with Playwright

Use `mcp__playwright__browser_*` tools throughout. Cadence:

1. **Navigate to the entry point.** Persona-typical landing — usually App Landing → study tile → first view of the workflow.
2. **For each step (target ~8 steps):**
   - Snapshot or screenshot the current state.
   - State persona action ("click NOAEL/LOAEL tab").
   - State observation (what's actually rendered — use the snapshot, not your memory of how the UI usually looks).
   - Assign **verdict tag** (see verdict tag rubric below).
   - Optional 1-line note on friction or surprise.
3. **Walk to the workflow's natural end** — either the persona's expected outcome is achieved, or the workflow dead-ends (real bug, missing UI, cross-view jump).

**Save screenshots** to `{{lattice.project.docs.workflow_audits_dir}}/{persona}-{workflow}/screens/{NN}-{slug}.png`. Use `mcp__playwright__browser_take_screenshot` with `filename` set to the absolute path.

## Step 4: Verdict tag rubric

| Verdict tag | When to use | Walk evidence sufficient? |
|---|---|---|
| `PASS` | Step works as expected for this persona | Yes |
| `PASS w/ FRICTION` | Works but costs the persona effort that could be removed | Yes (friction is subjective UX judgment) |
| `FRICTION` | Workflow continues but the step is harder than it should be | Yes |
| `GAP` | Information / capability the persona needs is absent here | **No** — must be flagged for validate (could be built-not-mounted, could have hidden affordance) |
| `GAP (architectural)` | Cross-view information scent broken; needs architecture-level fix | **No** — flag for validate |
| `DEAD-END (real bug)` | Workflow cannot continue: 404, blank pane, broken click | **No, and use sparingly** — empirical: high false-positive rate; must produce code-level mount-failure proof at validate stage |

Suppress these candidate citations during the walk (they are pre-approved patterns, per Section 3 of `{{lattice.project.docs.ux_audit_validate}}`):

- Right-click override cells with violet column tint (`bg-violet-100/50`) + corner triangle (`.cell-overridable`) — that IS the affordance.
- `OverridePill` blue/grey dot on overridden cells — that's note-presence on overridden cells, NOT an override-state indicator.
- Tokens `Bio`, `LOO`, `POC`, `S2`-`S4`, `XS01-09` — they have inline tooltips.
- Routes `/noael-determination`, `/target-organs`, `/histopathology`, `/noael-decision` — these are intentional `<Navigate>` redirects in `App.tsx:99-115`, not 404s. (The MANIFEST.md drift is a separate matter.)
- "Wrong dose label format" — first check `.claude/rules/design-decisions.md:17-22` 3-tier convention (`getDoseLabel` / `shortDoseLabel` / `doseAbbrev`). If the cell uses the wrong tier for its context, that IS a real "convention violation" gap (GAP-308 exemplar) — file it, but as convention violation, not "raw number bug."

If you observe one of these as the audit's basis for a `GAP`, drop the citation. If the citation underpins a `FRICTION`, keep it but note the convention.

## Step 5: Write the audit README

Path: `{{lattice.project.docs.workflow_audits_dir}}/{persona}-{workflow}/README.md`.

Format (follow exactly — downstream skills parse this):

```markdown
# Workflow Audit — {Persona name}: {Workflow human-readable name}

> **STATUS: WALK-ONLY (UNVALIDATED).** This document is the output of `/lattice:ux-audit-walk`. GAPs and DEAD-ENDs are *candidates*. Run `/lattice:ux-audit-validate` against this path before any GAP is promoted to TODO.md. Empirical refute rate at validate stage: ~21%.
>
> Walk date: YYYY-MM-DD. Study fixture: {study name} (selected per STUDY-FIXTURES.md row for this workflow). Walker: claude-code via Playwright MCP.

## Workflow header

| Field | Value |
|---|---|
| **Persona** | {Pn} — {short name} "{epithet}" |
| **Mental model** | {1-sentence cognitive frame} |
| **Goal** | {persona's outcome} |
| **Trigger** | {what makes the persona start this workflow} |
| **Expected outcome** | {what success looks like} |
| **Pillars touched** | {comma list of capability pillars from `capabilities.yaml`} |
| **Views touched** | {ordered list of views the workflow traverses} |

---

## Step N — {step name}

![](screens/NN-{slug}.png)

- **Persona action:** {what the persona does at this step}
- **Observed:** {what the UI actually shows — bullets if multi-part}
- **Verdict: {VERDICT}.** {1-2 sentence explanation, with cited file/line if you happened to read the source during the walk}
- **(optional) Friction notes:** {only if non-obvious}

[... repeat for ~8 steps ...]

---

## Walk summary

| Verdict | Count |
|---|---:|
| PASS | N |
| PASS w/ FRICTION | N |
| FRICTION | N |
| GAP | N |
| GAP (architectural) | N |
| DEAD-END (real bug) | N |

**Total steps walked:** N.

## Candidate themes touched

(List which themes from `THEMES.md` the walk-time observations seem to instantiate. These are *candidates* — promotion happens via the THEMES update process after validate, not here.)

## Open questions for validate

(Anything you weren't sure about — "is the violet tint on this cell visible at default monitor brightness?", "is this disabled state contextual or permanent?". The validate stage will resolve via Grep + rule-file lookup.)
```

## Step 6: Update INDEX.md

Add or update the row for this audit in `{{lattice.project.docs.workflow_audits_dir}}/INDEX.md`. Mark column status as `WALKED` (not `VALIDATED` — that comes after Stage 2).

## Step 7: Hand off

End your turn with:

```
WALK COMPLETE — {persona}-{workflow}
Audit at: {{lattice.project.docs.workflow_audits_dir}}/{persona}-{workflow}/README.md
Steps walked: N (V verdicts: P PASS / F FRICTION / G GAP / D DEAD-END)
Candidate themes: {list}

NEXT: run `/lattice:ux-audit-validate {persona}-{workflow}` to filter walk-time hypotheses.
```

Do NOT update TODO.md, do NOT promote themes, do NOT mark anything as confirmed. That's Stage 2 + Stage 3.

---

## Rules

- **Use Playwright snapshots, not assumptions.** If you find yourself describing what "should be" on screen rather than what `browser_snapshot` returned, you are walking from memory and will hallucinate.
- **One workflow per invocation.** Don't bundle p1-noael + p1-target-organ. Run separately so each can be validated independently.
- **Don't fix anything.** Walk, observe, classify. Even if you spot a 1-line fix, do not edit code — that's a separate `/lattice:implement` cycle.
- **Don't open the panes you have to right-click to discover.** That's the point of the audit. If a feature requires arcane knowledge to surface, the audit should reflect that.
- **Honor pre-approved conventions.** The Section 3 list of `{{lattice.project.docs.ux_audit_validate}}` enumerates patterns that are documented and approved. Do not re-flag them.

## Cross-references

- `{{lattice.project.docs.ux_audit_validate}}` — Stage 2 rule file (pre-approved patterns, suppression rules, 5-step Grep checklist)
- `{{lattice.project.docs.workflow_audits_dir}}/INDEX.md` — workflow inventory + audit status
- `{{lattice.project.docs.workflow_audits_dir}}/STUDY-FIXTURES.md` — per-workflow fixture selection
- `{{lattice.project.docs.workflow_audits_dir}}/THEMES.md` — current theme registry
- `{{lattice.project.docs.design_system_dir}}/datagrok-app-design-patterns.md` — persona definitions
