# [Feature Name]

> **Status:** Draft / Ready / In Progress / Implemented / Archived
> **Author:** [name]
> **Date:** [YYYY-MM-DD]
> **View:** [which view this belongs to, if applicable]

## Overview

[1-3 sentences: what this feature does and why it exists. What user problem does it solve?]

## Surface Intent Header (REQUIRED for any UI-surface spec)

> Author voice, written at spec-write time. The CONFORMANCE protocol + the project's design-intent rule verify each surface element binds to the design-intent oracles. Fields 2-4 form the per-element table -- THAT catches grain bugs; the surface-level paragraph does not. Delete this section only for a non-UI spec, and say why.

1. **Surface intent.** 2-3 sentences: what it IS + the analytical job + the decision it serves.
2. **Unit of analysis.** Primary grain + per-element unit where it differs. Wrong unit = wrong, not uncertain. (Declare e.g. "per-(animal, organ), NOT a syndrome rollup" -- the declaration that mandates reading the reused primitive's source to refute a wrong-grain reuse.)
3. **Reader questions.** The reader question each element answers, by ID (project reader-question inventory). Serves none = ROT, cut it.
4. **Atomic facts consumed.** Each engine fact the surface reads, by fact-id, with its declared semantics + GRAIN. "Consumes" = reads the emitted value, does NOT re-derive (doubles as the compute-locus anchor).
5. **Displays-vs-computes.** What the surface DISPLAYS vs what (if anything) it COMPUTES here + why that isn't a fact. **Default: nothing computed -- the UI projects.**

**Per-element bindings** (one row per element; the gate FAILS on an element present in the diff but absent here, or with an unresolved binding):

| Element | Answers (Q-ID) | Consumes (fact-id) | Unit |
|---------|----------------|--------------------|------|
| [element] | [Q-*] | [fact-id @ grain] | [unit] |

## User Story

As a [persona], I want to [action] so that [outcome].

## Behavior

### [Behavior 1: Name]
- **What:** [description of what happens]
- **When:** [trigger conditions — be exhaustive]
- **Unless:** [suppression conditions — when this does NOT happen]
- **How:** [exact UI details — layout, text, styling, animation]

### [Behavior 2: Name]
...

## Data Requirements

[What API fields, generated data, or computed values does this feature need? Reference api-field-contracts.md / field-contracts.md IDs if they exist.]

## Visual Design

[Layout, spacing, typography, colors. Reference design system docs. Include Tailwind classes where applicable.]

## Edge Cases

- [Edge case 1: what happens when...]
- [Edge case 2: what happens when...]

## Out of Scope

- [Explicitly excluded behavior 1]
- [Explicitly excluded behavior 2]

## Verification Checklist

- [ ] [Behavior 1]: [testable assertion with expected result]
- [ ] [Behavior 2]: [testable assertion with expected result]
- [ ] Build passes (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] Visual verification: [what to look for]
