---
name: research
description: Deep domain research on a topic — gap analysis, key problems, feature proposals. First-principles, unconstrained by implementation.
---

You are conducting deep domain research. Your job is to understand what's **needed**, not what's easy to build. Work from first principles — never filter ideas by implementation difficulty.

**Input:** A topic or problem area (e.g., "historical control data in preclinical tox", "dose-response pattern detection", "automated pathology review").

**Mode:** `--landscape` (default for new topics) or `--deep {branch}` (targeted deep dive on a specific branch from a prior landscape).

## Tier System

Research operates in two tiers to avoid boiling the ocean:

**Tier 1: Landscape (`--landscape`)** — Broad scan of the topic. Identifies all major branches, assesses each at surface level (1-2 paragraphs), then ranks them by **coverage impact** — how much of real-world practice does this branch affect? The output is a topic tree with a coverage-first recommendation of which branches to deep dive on first.

**Tier 2: Deep dive (`--deep {branch}`)** — Full gap analysis on a user-selected branch from the landscape. This is where Phases 1-3 below run in full. Branches not selected stay as stubs in the landscape doc — visible but not researched.

**When `--landscape` is the default:** If no landscape exists for this topic yet, always run landscape first. If a landscape already exists (`docs/_internal/research/{topic}.md` with a branch table), skip to deep dive on the requested branch.

**The user controls depth.** The landscape recommends, the user decides. Never auto-expand all branches.

## Foundational Framing

**Product thesis:** Every insight that can be auto-generated MUST be auto-generated. The primary audience is always scientists (toxicologists, pharmacologists, biostatisticians) doing daily analytical work — not regulatory writers doing milestone deliverables. When evaluating any gap or proposal, ask: "Does this help a scientist grok their data faster?"

**Paradigm note:** Things that were impractical before LLMs — scraping/synthesizing scientific literature at scale, implementing novel statistical methods from papers, building domain-specific NLP pipelines, integrating heterogeneous data sources — are now feasible. Do not filter them out. The bar for "too hard" has fundamentally moved. Always evaluate from what's needed, not from what was historically possible.

## Landscape Phase (Tier 1 — runs when `--landscape` or first time on topic)

### L1. Branch Identification

Scan the topic broadly. Identify all major branches/subtopics. For each branch, write 1-2 paragraphs covering:
- What it is and why it matters
- Current state (solved, partially solved, open problem)
- Who it affects (which practitioners, which study types, which species)

### L2. Coverage Analysis

For each branch, estimate coverage impact:

| Branch | Affects | Coverage | Current State | Depth |
|--------|---------|----------|---------------|-------|
| [subtopic] | [who/what] | [% of real-world practice] | [solved/partial/open] | [stub] |

Coverage = how much of real-world practice this branch touches. SD rat repeat-dose covers ~60% of tox studies. Minipig HCD covers <2%. This determines research priority.

### L3. Recommendation

Rank branches by coverage impact and present:

```
Based on coverage analysis, I recommend deep diving on:

1. {branch} — covers X% of practice, current state: {state}
2. {branch} — covers Y% of practice, current state: {state}
3. {branch} — covers Z% of practice, current state: {state}

Deferred (low coverage or already solved):
- {branch} — {reason}
- {branch} — {reason}

Which branches should I research in depth?
```

**Wait for user selection before proceeding.** Do not auto-expand.

### L4. Output

Write the landscape to `docs/_internal/research/{topic}.md` with all branches as stubs. Mark the document as `tier: landscape` at the top. Update INDEX.md.

---

## Deep Dive Phases (Tier 2 — runs on user-selected branches)

When running `--deep {branch}`, execute Phases 1-3 below scoped to that branch only. Write results into the existing landscape doc, expanding the stub for that branch into full analysis.

## Phase 1: Source Mapping

Before searching, build the search plan. For the given topic, identify:

1. **Regulatory bodies** — which agencies publish relevant guidance? (FDA, EMA, PMDA, ICH, OECD, etc.)
2. **Scientific societies** — which professional organizations work on this? (STP, SOT, AASLD, ACR, etc.)
3. **Standards organizations** — relevant data standards and working groups? (CDISC, PhUSE, HL7, etc.)
4. **Conferences & workshops** — where are practitioners presenting advances? (DIA, PhUSE annual, SOT annual, etc.)
5. **Commercial tools** — what products exist in this space? What do they offer and what do they miss?
6. **Academic journals** — which journals publish relevant methods? (Toxicologic Pathology, Regulatory Toxicology and Pharmacology, etc.)
7. **Community & forums** — open-source projects, GitHub repos, community discussions?
8. **Key researchers** — who are the domain leaders publishing in this area?

Write the source map as the first section of the output document. This becomes the search plan for Phase 2.

## Phase 2: Gap Analysis

Search the sources from Phase 1 systematically. For each source category, document:

- **What exists:** current state of the art, established methods, available tools
- **What practitioners need:** complaints, unmet needs, workflow friction, manual steps that shouldn't be manual
- **What's missing:** gaps between what exists and what's needed
- **What's wrong:** approaches that are accepted but flawed, outdated methods still in use, known limitations nobody has addressed
- **Key open problems:** research questions without good answers, active areas of investigation

Be specific. Quote sources. Name tools and their limitations. Reference papers by first author and year.

### Phase 2b: Uniformity Assumptions Check

After the gap analysis, explicitly ask: **"What varies across instances that this analysis assumes is constant?"**

For any topic that spans multiple study types, designs, species, or contexts, identify dimensions where the research (or the domain in general) assumes uniformity but reality is heterogeneous. Examples:

- Control group designs (vehicle vs positive vs sham vs historical — different studies use different controls, and analysis that assumes "control" is uniform will produce misleading cross-study comparisons)
- Vehicle formulations (saline vs CMC vs PEG — the vehicle itself may have biological effects)
- Dosing regimens (daily gavage vs weekly injection vs continuous infusion — PK profiles differ)
- Species-specific biology (rat liver regeneration vs dog liver sensitivity — same organ, different baseline)
- Study duration (4-week vs 13-week vs 26-week — findings at different durations aren't directly comparable)
- Satellite/sentinel designs (TK animals included or excluded from tox analysis)

For each dimension of variability found, document:
- What's assumed to be constant
- What actually varies and how
- What breaks if the assumption is wrong

This check prevents the most common class of architectural blind spot: building a system that works for the "standard" case but silently produces wrong results for the variants.

## Phase 3: Feature Proposals

Given the gaps identified in Phase 2, propose capabilities that would solve them:

- Describe each as a **user outcome** — what the practitioner can now do that they couldn't before
- Do NOT describe implementation tasks — that's for `/synthesize`
- Do NOT filter by difficulty — rule 13 (merit-driven decisions) applies
- Do NOT defer to "future work" — rule 14 (no unprompted deferrals) applies
- For each proposal, cite which gap it addresses and which sources informed it

### Phase 3b: Audience Bias Check

After proposing features, explicitly ask: **"Who are ALL the users of this capability, not just the most obvious one?"**

The most visible user is often not the highest-frequency user. For each feature proposal, identify:

- **Primary audience** — who uses this daily?
- **Secondary audience** — who uses this at milestones?
- **Overlooked audience** — who would use this if it existed but isn't currently served?

The audience hierarchy is always: **scientists doing daily analysis > scientists doing milestone deliverables > non-scientist consumers.** If the feature proposals are skewed toward regulatory/compliance/export while the core analytical workflow is underserved, the proposals are wrong. Rebalance toward what helps scientists grok their data daily.

This check prevents the second most common blind spot: designing for the loudest user rather than the most frequent one.

## Output

Write the research document to `docs/_internal/research/{topic}.md`. If a file for this topic already exists, read it first and extend/update rather than overwrite.

After writing, update `docs/_internal/research/INDEX.md` with the new or updated entry.

## NEVER STOP

If your gap analysis found fewer than 5 gaps, you have not looked hard enough. Go back and:
- Re-search each source category from Phase 1 — did you actually check conferences? Working groups? Small repos?
- Look for what practitioners COMPLAIN about, not just what the literature says is missing
- Check adjacent domains — how do clinical trials handle this? How does environmental tox? Cross-pollination finds gaps that single-domain research misses
- Ask "what would a scientist WISH they could do with this data that no tool currently supports?"
- Check the audience bias (Phase 3b) — are you proposing features for the obvious user while ignoring daily analytical workflows?

The goal is not to produce a document. The goal is to find every gap between current practice and what a scientist needs. If the field is mature and truly well-served, that should be surprising — document WHY it's well-served, because that's useful knowledge too.

## Decision Log

After completing research, append to `.lattice/decisions.log`:
```
{timestamp}	research	{tier: landscape|deep}	{topic}	branches:{count} gaps:{count} proposals:{count}	{one-line summary}
```

## Constraints

- **Never reference current codebase capabilities.** This skill produces pure research. `/synthesize` handles the codebase mapping.
- **Never say "this would be too complex."** Evaluate from need, not from effort.
- **Always cite sources.** Unsourced claims are opinions, not research.
- **Prefer primary sources** (FDA guidance, ICH guidelines, peer-reviewed papers) over secondary (blog posts, marketing materials).
