---
name: spike
description: Start exploratory implementation without spec ceremony. Enforces pre-write discipline, skips doc lifecycle.
---

You are running an exploratory implementation spike. The user wants to try something without the full spec → implement → review → archive ceremony. This is for "let me see if this works" situations.

## What a spike is

A spike is a time-boxed exploration. You build the thing to learn whether the approach works. If it works, the code stays and a spec is generated afterward (via `/spec-from-code`). If it doesn't, the code is discarded with no doc overhead.

## What still applies during a spike

**All CLAUDE.md hard rules still apply**, especially:

- **Bug fix protocol (CLAUDE.md)** — if you hit bugs during the spike, don't patch blindly
- **Pre-write protocol (CLAUDE.md)** — this is MORE important during spikes, not less. Read existing code, find reusable patterns, state your approach before writing. The whole point of this skill is to prevent the "sometimes great, sometimes awful" variance in exploratory work.
- **Reuse before reinventing (CLAUDE.md)** — search before building
- **Design decisions** — every visual/UI constraint in CLAUDE.md applies. Spikes don't get design exemptions.

## What is suspended during a spike

- Doc lifecycle (CLAUDE.md) — no spec archival, no knowledge extraction
- MANIFEST.md updates — no staleness tracking for exploratory work
- Post-implementation review — skipped. If the spike succeeds, run `/spec-from-code` then `/review` instead.
- Commit checklist items for spec/MANIFEST/incoming/TODO/ROADMAP — only build, tests, UI components, architecture, and null guards still apply

## Protocol

### 1. Understand the goal

Ask the user (if not already stated): **What are you trying to learn?** A spike has a question, not a spec. Examples:
- "Can we render the dose-response as a sparkline in the rail?"
- "Does the cross-study join work with mismatched dose groups?"
- "What does the cohort view feel like with temporal filtering?"

### 2. Pre-write (mandatory — Pre-write protocol, CLAUDE.md)

Before writing any code:

1. Read the files you'll modify (all of them)
2. Search for existing patterns that overlap
3. State your approach in 3–5 bullets:
   - What you'll build
   - What existing code/hooks/components you'll reuse
   - What design constraints apply (from CLAUDE.md)
   - What you're intentionally NOT building (scope boundary)

Present this to the user. Wait for confirmation before writing code.

### 3. Build

Write the code. Keep it minimal — answer the question, don't build the full feature. If you find yourself building something that doesn't directly answer the spike question, stop and ask if the scope is expanding.

### 4. Verify

- `npm run build` must pass
- `npm test` must pass (you may skip writing NEW tests during a spike, but existing tests must not break)
- If the change is visual and Playwright MCP is available, run a visual smoke test (navigate, console errors, not-blank). Otherwise state: "Visual verification required by user."

### 5. Report and persist gaps

Tell the user:
- **What you built** (files changed, approach taken)
- **What you learned** (does the approach work?)
- **What's missing** (what would need to happen to make this production-ready?)
- **Recommendation:** keep and formalize (→ `/spec-from-code`) or discard and try a different approach

**Persist gaps even though doc lifecycle is suspended.** Spikes discover gaps that are invisible elsewhere — the whole point is exploring unknown territory. If the spike is discarded, these gaps are the only artifact that survives.

For each "what's missing" item:
- **Research gap** (needs investigation) → append to `docs/_internal/research/REGISTRY.md` with `source: "spike/{topic}"`
- **Data gap** (missing data/coverage) → append to `docs/_internal/TODO.md` with `[Area: {relevant}]`
- **Implementation gap** (known limitation, deferred wiring) → append to `docs/_internal/TODO.md`

Gap persistence is the ONE doc lifecycle step that is NOT suspended during spikes.
