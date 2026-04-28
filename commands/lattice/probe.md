---
name: probe
description: Cross-impact analysis — detect implications of recent research/decisions across the full system. The meta-orchestrator's reasoning step.
---

You are performing **cross-impact analysis** on a change, decision, or research finding. Your job is to trace how it propagates through the system and surface non-obvious implications before they become bugs or inconsistencies.

**Input:** A description of what changed, a file path, a research finding, or a decision. Examples:
- `probe "effect size threshold changed from 0.3 to 0.5"`
- `probe backend/services/analysis/classification.py`
- `probe docs/_internal/research/organ-weight-normalization.md`
- `probe --integrity` (full system integrity scan)
- `probe --safety` (pre-change safety check on staged/uncommitted changes)

---

## Modes

### Default: Targeted probe

Analyze a specific change or decision. Trace its impact through the system.

### `--integrity`: Full system integrity scan

No specific change — check the entire system for inconsistencies, stale connections, and broken invariants. Heavier, run periodically or after major changes.

### `--safety`: Pre-change safety check

Read staged/uncommitted changes (`git diff`, `git diff --cached`). For each changed file, run a targeted probe. Report all downstream implications before the commit happens.

---

## Step 1: Load system manifest

Read the system manifest (`docs/_internal/knowledge/system-manifest.md`). This gives you:
- All subsystems and their primary files
- Data flow adjacency (source -> consumers)
- Override cascade paths
- Cross-cutting invariants

If no system manifest exists, tell the user: "No system manifest found. Run `/docs-agent` to create one, or point me to the architecture docs."

## Step 2: Identify the blast radius

For a **targeted probe** (specific change/decision/file):

1. **Map to subsystem(s).** Which subsystem(s) does this change touch? Use the manifest's primary files column.
2. **Trace downstream.** Follow the data flow adjacency graph from the affected subsystem(s). List every consumer, recursively, up to 3 hops.
3. **Trace upstream.** What feeds INTO the affected subsystem? A change in how a subsystem processes its inputs may break assumptions its sources rely on.
4. **Check override cascades.** If the change touches anything in the override system or a subsystem that overrides affect, trace the full cascade path.

For `--integrity`:

1. For each adjacency edge in the manifest, verify:
   - The source file still exports what the consumer expects (function signatures, field names, data shapes)
   - The consumer still imports from the source (not a stale reference)
   - Shared constants/thresholds are defined in one place (not duplicated with drift)
2. Check cross-cutting invariants listed in the manifest.

For `--safety`:

1. Read `git diff` and `git diff --cached`.
2. For each changed file, identify its subsystem.
3. Run targeted probe logic (Steps 2-4) on each.
4. Aggregate: if multiple changes touch the same downstream subsystem, flag the interaction.

## Step 3: Classify implications

For each affected subsystem, classify the implication:

| Classification | Meaning | Action |
|---------------|---------|--------|
| **SAFE** | Change doesn't affect this consumer's behavior | Note why (e.g., "consumer only reads field X, change is to field Y") |
| **PROPAGATES** | Change alters this consumer's input, but consumer handles it correctly | Note what propagates and why it's handled |
| **BREAKS** | Change alters this consumer's input in a way it doesn't handle | Flag with specific failure mode |
| **SCIENCE-FLAG** | Change alters analytical output (scores, classifications, verdicts) | Flag per Science preservation gate (CLAUDE.md). **Resolution contract:** decision memo with ≥3 literature citations (species profiles, methods-index, peer-reviewed sources in research/) documenting the chosen behavior and why. The gate's job is to force that decision-with-rationale, not to pause indefinitely for an absent SME. Only escalate to the user if citations cannot be found. |
| **STALE** | Connection in manifest no longer exists in code | Flag for manifest update |
| **RECONSIDER-SURFACE** | Change orphans or alters the role of a UI surface (a region in a specific state — e.g., Findings center pane in unselected state after NOAEL migrates out of it) | Flag with `view.region.state` and trigger; the user (or a follow-on `/lattice:design "audit {view}.{region}.{state} after {trigger}"` invocation) decides keep / redesign / remove / re-purpose |

## Step 4: Check research registry

If a research registry exists (`docs/_internal/research/REGISTRY.md` or `docs/_internal/research/INDEX.md`):

1. Are there active research streams that touch the affected subsystems?
2. Would this change invalidate conclusions from completed research?
3. Are there pending decisions that depend on the current behavior?

Flag any conflicts.

## Step 5: Report

```
PROBE: {what was analyzed}
Mode: {targeted / integrity / safety}

BLAST RADIUS:
  Direct: {subsystem(s) changed}
  1-hop: {immediate consumers}
  2-hop: {consumers of consumers}
  3-hop: {if relevant}

IMPLICATIONS:
| Subsystem | Classification | Detail |
|-----------|---------------|--------|
| {name} | SAFE/PROPAGATES/BREAKS/SCIENCE-FLAG/STALE | {specific explanation} |

{If any BREAKS or SCIENCE-FLAG:}
BLOCKING ISSUES:
1. {subsystem}: {what breaks and why}
   Fix: {what needs to change to accommodate}

{If any research conflicts:}
RESEARCH CONFLICTS:
1. {research stream}: {what's invalidated}

{If --integrity:}
INVARIANT CHECK:
| Invariant | Status | Detail |
|-----------|--------|--------|
| {from manifest} | PASS/FAIL | {evidence} |

STALE CONNECTIONS: {list or "none"}

MANIFEST UPDATES NEEDED: {list or "none"}
```

## Integration points

This skill is called:
- **Ad-hoc** by the user or any skill that needs impact analysis
- **By `/lattice:research-cycle`** at Step 6.5 (after research validation, before synthesis) — "does this validated research imply changes to subsystems beyond what we're about to synthesize?"
- **By `/lattice:research-cycle`** at Step 7.8 (after architect gate, before plan review) — "does the approved build plan have implications the architect didn't catch?"
- **By `/ops:impact`** as the analytical engine (ops:impact is the lightweight entry point, probe is the full analysis)
- **Before commits** via `--safety` mode

## Persist Findings

Probe findings are cross-system implications. If they only exist in the probe report (which is inline output), they vanish after the session. **Persist non-SAFE findings before reporting.**

### BREAKS and SCIENCE-FLAG → REGISTRY.md + TODO.md

For each BREAKS or SCIENCE-FLAG finding:

1. **Read** `docs/_internal/research/REGISTRY.md`
   - If the broken subsystem has an active research stream, append the implication to its `open-questions`
   - If not, create a new stream with `status: researching`, `source: "probe/{input-description}"`
2. **Read** `docs/_internal/TODO.md`
   - Append: `- [ ] **PROBE: {subsystem} {BREAKS|SCIENCE-FLAG}** — {what breaks and why}. Fix: {suggested fix}. Source: probe on {input}. [Area: {relevant}]`

### STALE → TODO.md

For each STALE finding:
- Append to `docs/_internal/TODO.md`: `- [ ] **MANIFEST-STALE: {connection}** — {what's stale}. [Area: Architecture]`

### PROPAGATES → informational only

PROPAGATES findings are handled correctly by the consumer — no persistence needed. They appear in the report for context.

Probe is called from research-cycle (Step 7), blueprint-cycle (Step 3), `/ops:impact`, and ad-hoc. In ALL contexts, findings must be persisted. The caller may be autonomous and may not surface findings to the user.

## Rules

- **Read the manifest, don't guess.** The adjacency graph is the source of truth for what connects to what. Don't infer connections from file names or intuition.
- **3-hop limit.** Beyond 3 hops, the signal-to-noise ratio drops. If a 4th-hop implication is genuinely important, include it with a note that it's at the edge of the blast radius.
- **SCIENCE-FLAG is non-negotiable as a trigger.** Any change that alters analytical output (scores, classifications, verdicts, NOAEL values) for ANY input data gets flagged. No exceptions, no "it's a minor change."
- **SCIENCE-FLAG resolves via decision memo, not indefinite defer.** The probe reports what changes and for what inputs. A downstream cycle (blueprint/build/autopilot) then authors a decision memo with ≥3 literature citations justifying the chosen behavior, logs the decision in `decisions.log`, and proceeds. "Wait for SME review" is not a valid resolution in a Claude-authored codebase — there is no SME in the feedback loop. Escalate to the user ONLY when supporting citations cannot be found after genuine search.
- **Stale connections are defects.** If the manifest says A -> B but the code doesn't reflect that, the manifest needs updating. Flag it.
- **Keep it concrete.** "S10 might be affected" is useless. "S10 Signal Scoring reads gLower from S02; if the threshold changes from 0.3 to 0.5, findings currently scoring 0.35 would drop below the gate and lose their treatment-related flag" is useful.
