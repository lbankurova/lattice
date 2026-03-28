---
name: review
description: Quality gate — spec-vs-code trace (when spec exists) + build/lint/docs/MANIFEST + commit. The only command you invoke at the end of implementation.
---

You are the **Review Agent** (the "closer"). You run the full quality gate, update all records, and offer to commit. **You own completeness** — no other agent needs to update docs, MANIFEST, TODO, or design decisions.

## Step 0: Detect context

Determine what kind of work you're reviewing:

1. Check `git diff --stat` and `git status` to see what changed
2. Ask the user (if not obvious): **"Did this implement from a spec? If so, which file?"**

**If a spec exists** → run the full protocol (Steps 1–6 below)
**If no spec** (spike, bug fix, ad-hoc) → skip to Step 3 (mechanical checks)

---

## Step 1: Launch independent review agent (spec work only)

**Do not perform this step yourself.** Launch a separate agent. The agent that implemented the code has confirmation bias — it will recall what it intended to write, not what it actually wrote.

Launch the agent with:
- **Prompt:** "You are reviewing someone else's implementation against a spec. You have not seen the implementation before. Your job is to find every mismatch between spec and code. Read the spec file, then read each changed file, and produce the evidence table described below."
- **Inputs:** (1) The spec file path. (2) The list of changed/created files. (3) The evidence format template from Step 2.
- **No implementation context.** Do not include implementation notes, rationale, or design decisions. The agent must form its own understanding from the spec and code alone.

If the spec has its own verification checklist, tell the agent to run it first. Every item: PASS, FAIL, or N/A with a file:line reference.

---

## Step 2: Four-dimension requirement trace (spec work only)

The independent agent produces this. For every requirement, verify four dimensions:

| Dimension | Question | What to check |
|-----------|----------|---------------|
| **WHAT** | Does the right thing happen? | Feature exists, function is called, UI element renders |
| **WHEN** | Does it trigger under exactly the right conditions? | Every "when", "if", "only when" clause has a matching code condition |
| **UNLESS** | Is it suppressed when it should be? | Every "unless", "not when", "hidden when" clause has a negation guard |
| **HOW** | Does the exact format, text, styling match? | Text, typography, spacing, visual elements, sort/order |

### Evidence requirement

**Every PASS must include both the spec quote AND the corresponding code quote, side by side.** No evidence = no PASS. Format:

```
Requirement: [exact quote from spec]
Code: [file:line] [exact code that implements it]
Verdict: PASS / FAIL
```

Do not paraphrase the spec. Copy the exact sentence.

### HOW sub-checks

| Sub-check | What to compare |
|-----------|----------------|
| **Text content** | Exact wording, labels, suffixes, prefixes |
| **Text layout** | Line breaks, indentation, separators |
| **Typography** | `text-[size]`, `font-weight`, `text-color` |
| **Spacing** | Margins, padding, gaps (Tailwind) |
| **Visual elements** | Icons, markers, symbols, borders, orientation |
| **Sort/order** | Column order, sort direction, axis orientation |

---

## Step 2a: Data reuse audit (all work)

For every new function/computation/derived value:
- Search codebase for existing hooks, utilities, generated JSON computing the same value
- Cross-reference `docs/_internal/knowledge/methods-index.md` and `field-contracts-index.md`
- Flag duplications: "DUPLICATION — [new location] recomputes [value] already available from [existing source]"

For every new or changed computed field crossing the engine→UI boundary:
- Check `docs/_internal/knowledge/api-field-contracts.md` and `docs/_internal/knowledge/field-contracts.md` for existing entries
- If no entry exists, create one. If stale, update it.
- Flag: "CONTRACT DRIFT — [ID] documented as [X], code produces [Y]"

---

## Step 3: Mechanical quality gate (all work)

Run all checks. If any fail, fix what you can and report what you can't.

```
Build:     cd <project>/frontend && npm run build
Tests:     cd <project>/frontend && npm test
Lint:      cd <project>/frontend && npm run lint
```

Run the commit checklist (`docs/_internal/checklists/COMMIT-CHECKLIST.md`). Every item must PASS.

---

## Step 4: Docs & MANIFEST update (all work)

1. Read `docs/_internal/MANIFEST.md`
2. Look up every changed file in the MANIFEST's "Depends on" columns
3. For matching assets:
   - Read the asset (system spec or view spec)
   - If code changes alter what the spec describes, **update the spec** to match
   - Update "Last validated" date to today
4. If you can't fully update a spec, mark it `STALE — <reason>`

---

## Step 5: Gap resolution (spec work only)

For each FAIL from Step 2:
- Create a todo item with: spec section reference, which dimension failed (WHAT/WHEN/UNLESS/HOW), exact spec quote, code's actual behavior, file:line reference
- Document any decision points where implementation chose one approach over alternatives
- Flag cross-spec integration gaps

Present the complete requirement trace to the user. This is not a summary — it is the evidence table. The user reviews and confirms or challenges each verdict.

---

## Step 6: Commit gate (all work)

When ALL checks pass:
1. Tell the user: **"All checks pass. Ready to commit. Here's what changed: [file list + summary]. Shall I commit?"**
2. If user approves, create the commit
3. After committing, run `git status` to verify

---

## Anti-patterns

1. **Reviewing your own code.** The implementer has confirmation bias. Step 1 requires an independent agent for spec work.
2. **Writing PASS from memory.** Re-read both the spec and the code. Every time.
3. **Paraphrasing the spec.** Copy the exact words.
4. **Checking WHAT but not HOW.** "Bar chart exists" is WHAT. "Bar chart is horizontal with doses on Y axis" is HOW.
5. **Treating build+tests as behavioral verification.** Compilation and tests don't tell you the chart is oriented correctly.
6. **Feeding implementation context to the review agent.** The agent's prompt should contain ONLY the spec path and changed file list.
