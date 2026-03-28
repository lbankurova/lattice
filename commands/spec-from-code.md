---
name: spec-from-code
description: Generate a spec from existing implementation. Reverse of the normal spec-first flow — use after a successful spike.
---

You are generating a specification from code that already exists. This is the reverse of the normal flow (spec → implement → review). Use this after a successful `/spike` or when code was written without a spec and needs to be documented for review.

## Why this exists

`/review` requires a spec to run the 4-dimension evidence trace. When code is written exploratory-first, there's no spec. This skill creates one so `/review` can run its full protocol.

## Protocol

### 1. Identify scope

Ask the user (if not already clear): **Which files/feature should I document?**

If this follows a `/spike`, the scope is whatever was built during the spike.

### 2. Read the implementation

Read every file involved in the feature. Do not skim — read fully. Capture:

- What the feature does (behavior)
- When it activates (conditions, triggers)
- When it doesn't activate (suppression, edge cases)
- How it looks (UI: styling, layout, typography, colors)
- What data it consumes (API fields, generated JSON, computed values)
- What existing patterns it reuses (hooks, components, utils)

### 3. Generate the spec

Write the spec to `docs/_internal/incoming/` using this structure:

```markdown
# [Feature Name]

> Generated from implementation — not a design spec. Created for review gate.

## Overview
[1–3 sentences: what this feature does and why it exists]

## Behavior

### [Behavior 1]
- **What:** [description]
- **When:** [trigger conditions]
- **Unless:** [suppression conditions, if any]
- **How:** [exact UI details — classes, text, layout]
- **Code:** [file:line references]

### [Behavior 2]
...

## Data Dependencies
[API fields, generated JSON keys, computed values consumed]

## Reused Patterns
[Existing hooks, components, utils this feature builds on]

## Visual Design
[Layout, spacing, typography, colors — with Tailwind classes where applicable]

## Verification Checklist
- [ ] [Behavior 1]: [testable assertion]
- [ ] [Behavior 2]: [testable assertion]
...
```

### 4. ROADMAP intake (rule 12)

Before presenting the spec, classify and track it:

1. Read `docs/_internal/ROADMAP.md`
2. Classify: is this a **bug fix** (→ TODO.md only), a **feature/improvement** (→ ROADMAP entry under existing area), or an **epic** (→ new ROADMAP section with stages)?
3. If feature or epic:
   - Find or create the appropriate ROADMAP area
   - Add an entry with: source (`Spec: incoming/[name].md`), what, why, depends-on
   - If it fits an existing ROADMAP item, link the spec to it instead of creating a new entry
4. If bug fix: ensure a TODO.md entry exists (if not already)

Present the ROADMAP update alongside the spec for user confirmation.

### 5. Present for review

Show the user the generated spec AND the ROADMAP entry. They may adjust either before `/review` runs.

### 6. Next step

After the spec is finalized:
- Run `/review` — it will detect the spec and run the full evidence trace
- Normal doc lifecycle (rule 7) applies from here forward
