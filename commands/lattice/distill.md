---
name: distill
description: Corpus-level reasoning across accumulated research — thesis construction, domain adaptation, doc coherence audit, grounded Q&A.
---

You are reasoning across an accumulated research corpus. Your job is to treat the full body of decided research, peer reviews, and synthesis documents as a unified knowledge base and produce insight that no single document contains alone.

This skill is fundamentally different from `/lattice:research` (which investigates NEW topics from external sources) and `/lattice:synthesize` (which maps ONE topic to code). You reason ACROSS what the project already knows.

**Input:** A question or claim, plus an optional mode flag.

**Modes:**
- `<question>` (default) — answer a question grounded in corpus evidence
- `--thesis <claim>` — construct an evidence-based argument from corpus findings
- `--adapt <target-domain>` — domain transfer analysis: what applies, what doesn't, what's missing
- `--audit` — knowledge coherence check: do docs reflect decided research?

---

## Step 0: Corpus Load (all modes)

This step is mandatory before any mode-specific work. Load the research corpus in layers:

### Layer 0: Meta (always read fully)

1. **Research registry** — `docs/_internal/research/REGISTRY.md`. Get decided/active/dormant streams, cross-stream implications, implementation status.
2. **System manifest** — `docs/_internal/knowledge/system-manifest.md`. Get subsystem map, data flow, override cascades, invariants.
3. **Scoring engine model** — `docs/_internal/knowledge/scoring-engine-model.md`. Get the pipeline steps, formulas, design invariants.

### Layer 1: Decided Knowledge (always read fully)

4. **All synthesis documents** — `docs/_internal/incoming/*-synthesis.md`. These are committed positions — research that has been through peer review and architect gate.
5. **Methods index** — `docs/_internal/knowledge/methods-index.md`. Statistical and algorithmic method catalog.
6. **Species profiles** — `docs/_internal/knowledge/species-profiles.md`. Species-specific biology and thresholds.
7. **Vehicle profiles** — `docs/_internal/knowledge/vehicle-profiles.md`. Control group classification.

### Layer 2: Research Index (scan titles + first paragraphs)

8. **Research index** — `docs/_internal/research/INDEX.md` (or list all files in `docs/_internal/research/`). For each research file, note: title, topic, status (from REGISTRY if tracked), approximate scope.
9. **Peer review index** — list all files in `docs/_internal/research/peer-reviews/`. Note which research they challenge and their verdicts.

### Layer 3: Deep Read (purpose-driven selection)

Based on the mode and question, select which Layer 2 files to read fully. Selection criteria:

- **Thesis mode:** Read all files that contribute evidence for or against the claim
- **Adapt mode:** Read all files that describe principles, methods, or assumptions that could transfer (or fail to transfer) to the target domain
- **Audit mode:** Read all decided research (Layer 1) plus any research files whose conclusions should be reflected in documentation
- **Question mode:** Read files whose topic matches the question

**Budget:** Read deeply up to 15 research files per invocation. If more are relevant, prioritize by: (a) decided over researching, (b) peer-reviewed over unreviewed, (c) higher coverage impact over lower.

---

## Default Mode: Corpus-Grounded Answer

When invoked with a plain question (no mode flag):

### Step 1: Parse the Question

Identify the domain(s) the question touches. Map to subsystems (from system manifest) and research streams (from REGISTRY).

### Step 2: Gather Evidence

From the corpus load, collect all relevant findings. For each finding, note:
- **Source:** file path and section
- **Status:** decided / researching / dormant / unreviewed
- **Strength:** peer-reviewed and decided > peer-reviewed > unreviewed

### Step 3: Construct Answer

Write a grounded answer that:
- Leads with the direct answer
- Cites specific research files for each claim (format: `[source: research/{filename}.md]`)
- Distinguishes decided conclusions from active research from unvalidated claims
- Flags contradictions between sources if any exist
- Notes gaps — what the corpus does NOT address about this question

### Output

Present the answer inline (no file output needed for simple questions). If the answer is substantial (>500 words), offer to save to `docs/_internal/research/distillations/{topic}-answer.md`.

---

## Thesis Mode (`--thesis <claim>`)

Construct a structured evidence-based argument from corpus findings. Use this to evaluate whether the system's approach solves a stated problem, or to draft a publication outline.

### Step 1: State the Claim

Restate the claim precisely. Identify:
- **Domain:** what field(s) this claim belongs to
- **Scope:** what the claim covers and what it excludes
- **Novelty hypothesis:** what about this claim would be new to the field (if anything)

### Step 2: Evidence Chain

For each piece of supporting evidence in the corpus:

| # | Evidence | Source | Type | Strength |
|---|----------|--------|------|----------|
| 1 | [specific finding] | [file:section] | decided / researching | peer-reviewed / unreviewed |

**Types of evidence to look for:**
- **Design decisions** — from REGISTRY decided streams and synthesis docs
- **Validation results** — from `docs/validation/` (signal detection scores, design match)
- **Peer review verdicts** — challenges that were SOUND strengthen the claim
- **Method descriptions** — from methods index and scoring engine model
- **Empirical results** — from generated data analysis, if available

### Step 3: Counter-Arguments

Actively construct the strongest case AGAINST the claim:
- What peer reviewers challenged and what was not fully resolved
- Known limitations documented in research files
- Assumptions the system makes that could be wrong (from Phase 2b uniformity checks)
- What competing approaches exist in the literature (from peer-review `--novel` findings)
- Edge cases where the claim may not hold

### Step 4: Novelty Assessment

Compare the system's approach against the state of the art:
- What existing tools/methods address this problem? (from `/lattice:research` source maps)
- What does the system do differently?
- Is the difference a genuine contribution or an implementation detail?
- What validation would strengthen the novelty claim?

### Step 5: Gap Analysis

What the corpus does NOT contain that would be needed to fully support the claim:
- Missing validation (studies not yet tested)
- Missing comparisons (no benchmark against existing methods)
- Missing theory (empirical results without formal justification)
- Missing external validation (only tested on project's own data)

### Step 6: Structure

Assemble the thesis document:

```markdown
## Thesis: {claim}

### Abstract
[3-5 sentence summary: problem, approach, evidence, conclusion]

### 1. Problem Statement
[What gap in the field this addresses — cite external sources from research]

### 2. Approach
[How the system addresses it — cite system manifest, scoring model, method descriptions]

### 3. Evidence
[Evidence chain table from Step 2, organized by theme]

### 4. Counter-Arguments and Limitations
[From Step 3 — present honestly, with responses where the corpus provides them]

### 5. Novelty
[From Step 4 — what's genuinely new]

### 6. Gaps and Future Work
[From Step 5 — what would strengthen or complete the argument]

### 7. Conclusion
[Does the evidence support the claim? SUPPORTED / PARTIALLY SUPPORTED / INSUFFICIENT]

### Sources
[All corpus files cited, with brief description of what each contributes]
```

### Output

Write to `docs/_internal/research/distillations/{topic}-thesis.md`.

Present a summary inline, then:

```
---
**Decision: Thesis constructed. What next?**

1. Send to peer review *(recommended — /lattice:peer-review on the thesis doc)*
2. Expand into publication draft (add literature review, methods section, formal structure)
3. Identify and fill gaps first (run /lattice:research on specific gaps)
4. Something else
---
```

---

## Adapt Mode (`--adapt <target-domain>`)

Analyze what from the accumulated research transfers to a new domain, what doesn't, and what new research is needed.

### Step 1: Source Domain Inventory

From the corpus, catalog the system's core principles and methods. For each, extract:

| Principle/Method | What it does | Domain assumptions | Source |
|-----------------|--------------|-------------------|--------|
| [e.g., gLower as effect size] | [universal continuous effect metric] | [assumes group comparison with n>1] | [scoring-engine-model.md] |

**Categories to inventory:**
- Statistical methods (what tests, what assumptions)
- Scoring/ranking logic (what signals, how combined)
- Domain knowledge encoded (species biology, expected findings, syndrome definitions)
- Data model (what structure, what fields, what relationships)
- Visualization/interaction patterns (what analytical questions the UI answers)

### Step 2: Target Domain Characterization

Research the target domain to understand:
- **Data shape:** what does the data look like? (structure, volume, variability)
- **Analytical questions:** what do practitioners need to answer?
- **Existing tools:** what's currently used? What are their limitations?
- **Regulatory context:** what standards/guidelines govern this domain?
- **Key differences:** where does this domain diverge from the source domain?

### Step 3: Transfer Map

For each principle/method from Step 1, classify:

| Principle/Method | Transfers? | Adaptation needed | Risk if transferred naively |
|-----------------|-----------|-------------------|---------------------------|
| [item] | direct / with-modification / does-not-transfer | [what changes] | [what goes wrong] |

**Classification criteria:**
- **Direct transfer:** The principle applies as-is. Statistical assumptions hold, data shape matches, analytical question is analogous.
- **Transfer with modification:** The principle applies but parameters, thresholds, or domain knowledge need updating. The LOGIC transfers, the CONSTANTS don't.
- **Does not transfer:** The principle is specific to the source domain. Using it would produce misleading results.

For each "does not transfer" — explain WHY. This prevents future revisiting.

### Step 4: Gap Analysis

What the target domain needs that the corpus doesn't address:

| Gap | Why it's needed | Blocking? | Suggested research |
|-----|----------------|-----------|-------------------|
| [gap] | [analytical need] | yes/no | [topic for /lattice:research] |

### Step 5: Adaptation Plan

Produce a structured plan:

```markdown
## Domain Adaptation: {source} -> {target}

### What Transfers Directly
[List with citations — these are the system's portable contributions]

### What Transfers with Modification
[List with specific modifications needed and why]

### What Does Not Transfer
[List with explanations — prevent naive reuse]

### New Research Needed
[Gap table from Step 4 — each gap becomes a potential /lattice:research topic]

### Recommended Sequence
[Order the adaptation work by: direct transfers first (validate quickly),
then modifications (test assumptions), then new research (fill gaps)]
```

### Output

Write to `docs/_internal/research/distillations/{target}-adaptation.md`.

Present summary inline, then:

```
---
**Decision: Adaptation analysis complete. What next?**

1. Start research on highest-priority gap *(recommended — /lattice:research {gap})*
2. Validate direct transfers first (prototype with target domain data)
3. Review the "does not transfer" list (challenge assumptions)
4. Something else
---
```

---

## Audit Mode (`--audit`)

Check whether documentation reflects the current state of decided research. Finds stale docs, missing docs, and docs that contradict decided conclusions.

### Step 1: Documentation Inventory

Catalog all documentation that should reflect research conclusions:

| Doc | Type | Last updated | Reflects research up to |
|-----|------|-------------|------------------------|
| `docs/methods.md` | Public methods reference | [date or git blame] | [which research streams] |
| `docs/scientific-logic.md` | Public scientific logic | [date or git blame] | [which research streams] |
| `docs/validation/summary.md` | Validation summary | [date or git blame] | [which validation runs] |
| `docs/_internal/knowledge/*.md` | Internal knowledge | [per file] | [per file] |

Use `git log --format="%ai" -1 -- {file}` to get last-modified dates.

### Step 2: Research Timeline

From REGISTRY, build a timeline of decided research:

| Stream | Decided date | Key conclusions | Implementation commit |
|--------|-------------|-----------------|---------------------|
| [stream] | [date] | [what was decided] | [commit hash or "pending"] |

### Step 3: Coherence Check

For each documentation file, check:

1. **Coverage:** Does the doc mention/reflect each relevant decided stream?
2. **Accuracy:** Does what the doc says match what the research concluded?
3. **Staleness:** Was the doc last updated BEFORE the research was decided?
4. **Contradiction:** Does the doc assert something the research disproved?

Classify each finding:

| Doc | Issue | Severity | Detail |
|-----|-------|----------|--------|
| [file] | stale / missing / contradicts / accurate | high/medium/low | [specific discrepancy] |

**Severity:**
- **High:** Public doc contradicts decided research (users see wrong information)
- **Medium:** Internal doc is stale (developers work from outdated assumptions)
- **Low:** Doc is incomplete but not wrong (missing new capability, not incorrect about existing)

### Step 4: Update Plan

For each issue found, specify the fix:

| Doc | Fix type | What to change | Source of truth |
|-----|---------|---------------|----------------|
| [file] | regenerate / manual edit / extend | [specific change] | [research file that has the correct info] |

**Fix types:**
- **Regenerate:** Doc is auto-generated (e.g., `methods.md` via `regen-science`). Just re-run the generator.
- **Manual edit:** Doc requires human-authored changes. Specify exactly what to change and what the correct content is (cite the research source).
- **Extend:** Doc is accurate but incomplete. Specify what to add.

### Output

Write to `docs/_internal/research/distillations/coherence-audit-{date}.md`.

Present summary inline with counts:

```
## Audit Results

- **X** documents checked
- **Y** issues found (Z high, W medium, V low)
- **N** documents are current and accurate

### High-severity issues (public-facing)
[list]

### Recommended actions
1. [most impactful fix first]
2. ...
```

Then:

```
---
**Decision: Audit complete. What next?**

1. Fix high-severity issues now *(recommended — start with public docs)*
2. Run regen-science for auto-generated docs
3. Create TODO.md entries for all issues
4. Something else
---
```

---

## Output Location

All distill artifacts go to `docs/_internal/research/distillations/`:

| Mode | Filename |
|------|----------|
| `--thesis` | `{topic}-thesis.md` |
| `--adapt` | `{target}-adaptation.md` |
| `--audit` | `coherence-audit-{date}.md` |
| default (if saved) | `{topic}-answer.md` |

## Composition with Other Skills

Distill produces analysis that feeds into existing pipeline skills:

| Distill output | Next skill | Purpose |
|---------------|-----------|---------|
| Thesis | `/lattice:peer-review` | Validate the argument scientifically |
| Thesis (validated) | Manual or `/lattice:research --deep` | Expand into publication, fill evidence gaps |
| Adaptation plan | `/lattice:research` | Investigate gaps identified for target domain |
| Adaptation plan (researched) | `/lattice:synthesize` | Produce implementation spec for the adaptation |
| Audit results | `regen-science` or manual edits | Fix documentation issues |
| Audit results | `/lattice:research` | If audit reveals the research itself has gaps |
| Grounded answer | Any skill or standalone | Inform decisions across the project |

## Constraints

1. **Corpus is the primary source.** Unlike `/lattice:research` (which goes external), distill reasons from internal accumulated knowledge. Reference external sources only when corpus files cite them — don't introduce new external claims.

2. **Distinguish evidence tiers.** Always mark whether a claim comes from: decided research (strongest), peer-reviewed research (strong), unreviewed research (provisional), or inference across documents (your synthesis — flag explicitly).

3. **Cite everything.** Every factual claim must reference a specific file and section. Format: `[source: path/to/file.md, section "X"]`. Uncited claims in a distillation are defects.

4. **Flag contradictions.** If two corpus documents disagree, present both positions with their evidence. Do not silently choose one. The resolution is either already in REGISTRY (check the decided streams) or needs user judgment.

5. **No implementation.** Distill produces analysis, not code and not specs. If the analysis reveals something to build, route to `/lattice:synthesize`. If it reveals something to investigate, route to `/lattice:research`.

6. **Intellectual honesty.** A thesis with INSUFFICIENT evidence is more valuable than one that overstates its case. An adaptation plan that says "this doesn't transfer" saves more time than one that forces a fit. State what the evidence actually supports.

7. **Freshness check.** Before citing a research file's conclusions, check REGISTRY for its current status. A dormant or superseded stream's conclusions may no longer be the project's position. Note the status when citing.
