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

{{include:project.skills.distill.corpus_layers}}

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

Present the answer inline (no file output needed for simple questions). If the answer is substantial (>500 words), offer to save to `{{lattice.project.research.distillations}}/{topic}-answer.md`.

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

Write to `{{lattice.project.research.distillations}}/{topic}-thesis.md`.

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

Write to `{{lattice.project.research.distillations}}/{target}-adaptation.md`.

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

{{include:optional:project.skills.distill.audit_doc_inventory}}

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

Write to `{{lattice.project.research.distillations}}/coherence-audit-{date}.md`.

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

All distill artifacts go to `{{lattice.project.research.distillations}}/`:

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

## Knowledge Promotion (all modes — final step before return)

Distill is corpus-level reasoning. When a session surfaces a *novel cross-subsystem connection* — an insight that wouldn't naturally live in any single existing knowledge file, isn't restated in the corpus you loaded in Step 0, and is factual / load-bearing (not session-specific commentary) — that insight should compound into the durable knowledge layer rather than evaporate with the session. **Run this step at the very end of every mode**, after the mode-specific output and the Persist Gaps step below, and BEFORE returning to the operator.

Anti-pattern to avoid: aggressive auto-extraction that writes every cross-doc reference as a new knowledge entry. The operator stays in the loop. Default behavior is "ask before promoting."

### Step P1: Identify candidate insights

From the analysis you just produced, list each candidate cross-subsystem connection. A candidate qualifies only if **all three** of the following hold:

1. **Novel** — the connection is not already stated, in the same form, in any file you loaded in Step 0 (Layer 0, Layer 1, or the Layer 3 deep-read set). Restating an existing claim does not qualify.
2. **Factual / load-bearing** — the insight is a domain or system fact that future sessions would benefit from re-using (e.g., "subsystem A's invariant X depends on subsystem B's threshold Y"). Session-specific commentary, transient hypotheses, and stylistic observations do not qualify.
3. **Cross-subsystem** — the insight bridges two or more subsystems (per `system-manifest.md`) or two or more knowledge files. An insight that fits cleanly inside one existing knowledge file's scope is normal corpus output, not a promotion candidate.

If no candidates qualify, skip to Step P3 (record nothing) and return.

### Step P2: Prompt for promotion (one candidate at a time)

For each qualifying candidate, present:

```
---
**Candidate insight (cross-subsystem):**
[one-paragraph statement of the insight, with the specific subsystems / files it bridges]

**Suggested destination:** new file `{{lattice.project.docs.internal_root}}/knowledge/{filename}.md`
                          OR extension of `{{lattice.project.docs.internal_root}}/knowledge/{existing-file}.md` (section: "{section}")

Promote to knowledge layer? [yes / no / skip-all]
---
```

Choose ONE suggested destination per candidate by applying the domain-knowledge-map (see `{{lattice.project.docs.domain_knowledge_map}}` if the project ships one, or the project's `CLAUDE.md` "Where Rules Live" table). Prefer extension of an existing file when the insight fits an existing topic; propose a new file only when no existing file's scope covers the bridge.

If the operator answers **yes**: draft the new knowledge entry (or the patch to the existing file) and present it inline for review BEFORE writing. Do not write the file until the operator confirms the draft.

If the operator answers **no** or **skip-all**: do not write. Proceed to Step P3 regardless — the audit trail is preserved either way.

### Step P3: Record candidates in decisions.log (always)

Whether or not promotion happens, append one row per candidate to `.lattice/decisions.log` so future corpus-load passes (and `--audit` mode runs) can reference the insight. Use the existing tab-separated format with a `Distill-Insight:` trailer in the detail column:

```
<ISO-timestamp>	distill	{PROMOTED|DECLINED|SKIPPED}	{mode}/{topic-slug}	candidate-insight	Distill-Insight: {one-sentence summary}. Subsystems: {A}, {B}. Suggested destination: {path}. Disposition: {promoted to <path> | declined by operator | skipped (no destination match)}.
```

`{mode}` is `default`, `thesis`, `adapt`, or `audit`. `{topic-slug}` is a short kebab-case label of the session's question or claim. The verdict column distinguishes promoted insights (durable file written) from declined / skipped ones (audit-trail only).

This step is mandatory. Even when the operator declines every candidate, the row still lands — the goal is to prevent the same connection being re-derived from scratch next session.

---

## Persist Gaps (all modes)

Every distill mode can identify gaps — unanswered questions (default mode Step 3), missing validation (thesis Step 5), transfer gaps (adapt Step 4), stale/contradicting docs (audit Step 3). **Persist them before presenting results.**

### Research gaps → REGISTRY.md

For each gap that requires further investigation:
1. **Read** `{{lattice.project.research.registry}}`
2. If the gap relates to an existing stream, append to that stream's `open-questions`
3. If it's a new topic, add a new stream with `source: "distill/{mode}/{topic}"`

### Data/doc gaps → TODO.md

For each gap that is a missing data problem or a documentation staleness issue:
1. **Read** `{{lattice.project.backlog.todo}}`
2. Append with appropriate tag: `[Area: {relevant}]`

**Mode-specific guidance:**
- **Default:** "Notes gaps" (Step 3) — persist each noted gap
- **Thesis:** "Gap Analysis" (Step 5) — persist each missing validation/comparison/theory item
- **Adapt:** "Gap Analysis" (Step 4) — persist each gap with `source: "distill/adapt/{target}"`
- **Audit:** All high/medium-severity issues → TODO.md entries (not optional — mandatory)

Distill reasons across the corpus. Its gap discoveries are often the highest-quality signals because they come from cross-document analysis, not single-document review. Losing them is especially costly.

## Constraints

1. **Corpus is the primary source.** Unlike `/lattice:research` (which goes external), distill reasons from internal accumulated knowledge. Reference external sources only when corpus files cite them — don't introduce new external claims. When you do follow an external citation from the corpus, follow the **Web Source Access Protocol** in CLAUDE.md (log 403s, retry via browser).

2. **Distinguish evidence tiers.** Always mark whether a claim comes from: decided research (strongest), peer-reviewed research (strong), unreviewed research (provisional), or inference across documents (your synthesis — flag explicitly).

3. **Cite everything.** Every factual claim must reference a specific file and section. Format: `[source: path/to/file.md, section "X"]`. Uncited claims in a distillation are defects.

4. **Flag contradictions.** If two corpus documents disagree, present both positions with their evidence. Do not silently choose one. The resolution is either already in REGISTRY (check the decided streams) or needs user judgment.

5. **No implementation.** Distill produces analysis, not code and not specs. If the analysis reveals something to build, route to `/lattice:synthesize`. If it reveals something to investigate, route to `/lattice:research`.

6. **Intellectual honesty.** A thesis with INSUFFICIENT evidence is more valuable than one that overstates its case. An adaptation plan that says "this doesn't transfer" saves more time than one that forces a fit. State what the evidence actually supports.

7. **Freshness check.** Before citing a research file's conclusions, check REGISTRY for its current status. A dormant or superseded stream's conclusions may no longer be the project's position. Note the status when citing.

8. **Code claims require code evidence.** When distill asserts "the code does X" or "the code doesn't do Y" — in any mode — the claim MUST include a `file:line` reference from actually reading the code. Do not infer code behavior from documentation, type signatures, or reasoning about what code "should" do. Read the function. Cite the line. This is non-negotiable: a prior distill thesis fabricated a gap claiming enforcement was missing when the code clearly implemented it (GAP-208). Peer review caught the fabrication, but the correct fix is to prevent it. If you cannot verify a code claim by reading the file, state: "UNVERIFIED — inferred from [source], not confirmed in code."
