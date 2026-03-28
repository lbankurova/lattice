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

### 4. Present for review

Show the user the generated spec. They may adjust it (add requirements, remove accidentals) before `/review` runs.

### 5. Next step

After the spec is finalized:
- Run `/review` — it will detect the spec and run the full evidence trace
- Normal doc lifecycle (rule 7) applies from here forward
