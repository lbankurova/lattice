# Post-Implementation Review Protocol

This protocol is executed automatically by `/review` when it detects that work was implemented from a spec. It is documented here as the reference for the evidence-based review process.

**CRITICAL: This review must be a genuine verification pass, not a recall exercise.** The implementer's memory of what they coded is unreliable. The only valid evidence is the spec text compared side-by-side against the actual code.

**MANDATORY: The spec-vs-code trace must be executed by an independent review agent.** The agent that wrote the code cannot review its own work.

---

## The Four-Dimension Trace

For every requirement in the spec, verify:

| Dimension | Question | What to check |
|-----------|----------|---------------|
| **WHAT** | Does the right thing happen? | Feature exists, function is called, UI element renders |
| **WHEN** | Does it trigger under the right conditions? | Every "when", "if", "only when" clause has a matching condition |
| **UNLESS** | Is it suppressed when it should be? | Every "unless", "not when", "hidden when" has a negation guard |
| **HOW** | Does the exact format, text, styling match? | Text, typography, spacing, visuals, sort order |

**Most common failure mode: WHEN/UNLESS.** A feature that exists but activates unconditionally when the spec says "only when X" is a behavioral gap.

## Evidence Requirement

Every PASS must include both the spec quote AND the corresponding code quote:

```
Requirement: [exact quote from spec]
Code: [file:line] [exact code that implements it]
Verdict: PASS / FAIL
```

No evidence = no PASS. Do not paraphrase the spec — copy the exact sentence.

## HOW Sub-checks

| Sub-check | What to compare |
|-----------|----------------|
| Text content | Exact wording, labels, suffixes, prefixes |
| Text layout | Line breaks, indentation, separators |
| Typography | `text-[size]`, `font-weight`, `text-color` |
| Spacing | Margins, padding, gaps |
| Visual elements | Icons, markers, borders, orientation |
| Sort/order | Column order, sort direction, axis orientation |

## Anti-patterns

1. **Reviewing your own code.** Confirmation bias. Independent agent required.
2. **Writing PASS from memory.** Re-read both spec and code. Every time.
3. **Paraphrasing the spec.** Copy the exact words.
4. **Checking WHAT but not HOW.** Both must pass.
5. **Treating build+tests as behavioral verification.** They verify types and logic, not visual correctness.
6. **Feeding implementation context to the review agent.** Spec path + changed file list only.
