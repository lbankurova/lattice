---
name: lit-triage
description: Triage orphan PDFs in research/ — extract content, assess relevance against load-bearing knowledge surfaces, append verdict to PDF-TRIAGE.md. Candidates promote to literature notes only when human-confirmed.
---

You are running PDF triage. Orphan PDFs in `research/` need a relevance assessment against the project's load-bearing knowledge surfaces (`knowledge-graph.md`, `methods-index.md`, `species-profiles.md`, `architecture/`). Your output is a candidate register entry, not a literature note. The human verifies your verdict before any promotion.

This skill exists because the corpus-citation-audit (`{{lattice.project.scripts.audit_corpus_citations}}`) cross-joins orphan PDFs against load-bearing acquisition candidates and surfaces a recurring orphan-PDF list. Triage is the staging step between "PDF on disk" and "literature note in registry".

**Input modes:**

- No args → triage all orphan PDFs in `research/`. On a re-run, also re-assess any existing register entries that are stale (see Staleness below).
- `<path>` → triage one specific PDF (path relative to repo root or absolute).
- `--refresh` → re-assess ALL existing register entries regardless of staleness, plus all new orphans. Use after a major knowledge-surface refactor.

**Output:** entries in `{{lattice.project.research.literature_pdf_triage}}`. Each entry carries a `TRIAGE-LLM-ASSESSED` marker and a quote-grounded justification — you must produce verbatim quotes from the PDF, not paraphrases. Paraphrasing is hallucination surface; the human verifier needs the source's own words to confirm your verdict.

## Step 0 — Read prerequisites

Read these files before triaging anything. They are the assessment frame:

1. `{{lattice.project.research.literature_pdf_triage}}` — the register file. Read the schema header AND existing entries. You will be appending to or replacing entries here.
2. `{{lattice.project.research.literature}}/README.md` — literature-registry conventions. The "What goes here" / "What does NOT go here" sections define SENDEX's literature scope.
3. `{{lattice.project.docs.typed_graph}}` — typed atomic facts. Scan for `derives_from:` entries that already cite literature notes; these are the load-bearing surfaces a relevant paper could anchor.
4. `{{lattice.project.docs.methods_index}}` — method registry. A paper that proposes or validates a statistical method could anchor a method here.
5. `{{lattice.project.docs.species_profiles}}` — species-specific claims. HCD-style papers often anchor here.
6. `.lattice/acquisition-list.md` — current load-bearing acquisition candidates. If your PDF matches a Tier 1 or Tier 2 paper, the verdict is almost always `RELEVANT-NEEDS-NOTE`.
7. `.lattice/corpus-citation-audit.txt` (most recent) — orphan-PDF list (your input set when no args).

## Step 1 — Determine the input set

```
case "$ARGS" in
    "")            # Initial / no-arg run
        # Discover the orphan-PDF set: all PDFs under research/ that are NOT
        # referenced by any literature note's `local_pdf:` field.
        # On a re-run, ALSO include stale existing entries (see Staleness).
        ;;
    "--refresh")   # Force re-assessment of all entries
        # Triage every entry in PDF-TRIAGE.md plus any new orphans.
        ;;
    *)             # Specific path
        # Triage exactly that file. Replace the existing entry if any.
        ;;
esac
```

For the no-arg case, the input set is:

```
[ all PDFs in research/ ]
  MINUS
[ PDFs referenced by `local_pdf:` in {{lattice.project.research.literature}}/*.md frontmatter ]
  MINUS
[ PDFs already triaged AND not stale (see Staleness) ]
  PLUS
[ PDFs already triaged AND stale ]
```

Use `Glob` for the PDF list. Use `Grep` on `{{lattice.project.research.literature}}/*.md` for `local_pdf:` references. Use `Read` on PDF-TRIAGE.md for existing entries.

## Step 2 — Staleness detection (Pick 5 — auto, no flag required)

For each existing entry in PDF-TRIAGE.md, parse its `Triaged:` date. Compare against the most recent commit date on each of the four context surfaces:

```bash
# Run from project root
git log -1 --format=%cs -- {{lattice.project.docs.typed_graph}}
git log -1 --format=%cs -- {{lattice.project.docs.methods_index}}
git log -1 --format=%cs -- {{lattice.project.docs.species_profiles}}
git log -1 --format=%cs -- {{lattice.project.docs.architecture_dir}}/
```

If `max(those four dates) > entry.triaged_date`, the entry is **stale** and must be re-assessed in this run. Why: a paper marked `NOT-RELEVANT` in March may become relevant in May because a new fact entered the knowledge graph. The triage decision is time-bounded.

`--refresh` bypasses the staleness check and re-assesses everything.

## Step 3 — Per-PDF triage loop

For each PDF in the input set, run this loop:

### 3a. Extract text

```bash
python scripts/extract-pdf-text.py <pdf-path> --pages 5 --out /tmp/triage-text.txt
```

Read the resulting text. The first 5 pages typically capture title, abstract, methods opener, and journal/affiliation metadata — enough for triage without paying full-text extraction cost.

If the script exits 1 (file missing / corrupt / encrypted) OR exits 2 (no text extractable, likely scanned image): emit verdict `UNCERTAIN` with extraction-failure note in the quote field, then continue to the next PDF. Do NOT speculate about content from filename alone.

### 3b. Identify the citation

Parse from the extracted text:

- Title (usually largest text on page 1, or directly above author block)
- Authors (line below title, or "by <name>" pattern)
- Year (publication date in journal masthead, or copyright line)
- Journal (masthead, or "Published in" line)
- Volume / issue / pages (masthead)
- DOI (look for `doi:` / `https://doi.org/` / `10.NNNN/...`)
- PMID (rarely on first page, but possible)

If the text does NOT contain a verbatim title and author line, set `Identified citation: UNKNOWN` AND attach `risk flag: hallucination-suspect`. Do not infer authorship from filename.

### 3c. Read context surfaces (relevance assessment)

The verdict is content-based. Match the PDF's claimed topic against:

1. **Knowledge graph facts.** Does any `derives_from:` chain in `knowledge-graph.md` already cite a paper that overlaps with this one? Does the PDF's topic name a `fact_kind` (clinical_threshold, regulatory_expectation, gate_criterion, disable_marker)? Use the project's typed knowledge query if available: `python scripts/query-knowledge.py --scope <relevant-scope> --kind <relevant-kind>`.
2. **Methods index.** Does the PDF describe a statistical method, validation approach, or detection algorithm that the project uses or could use?
3. **Species profiles.** Is the PDF a species-specific HCD compilation, baseline reference, or finding-incidence study?
4. **Architecture.** Does the PDF anchor a load-bearing architectural decision (algorithm rationale, scope rule, exclusion class, threshold derivation)?
5. **Acquisition list.** Is the paper named in `.lattice/acquisition-list.md` Tier 1 or Tier 2? A direct match here is strong evidence for `RELEVANT-NEEDS-NOTE`.

### 3d. Choose verdict

| Verdict | Trigger |
|---|---|
| `RELEVANT-NEEDS-NOTE` | Matches a named knowledge gap (acquisition list entry, missing `derives_from:` source, missing methods anchor, missing species profile reference). The paper would close a documented gap if promoted. |
| `RELEVANT-CONTEXTUAL` | On-topic for SENDEX's domain (toxicology, regulatory, statistical methods, HCD, species biology) but no specific load-bearing surface needs it right now. Useful background, not a gap-closer. |
| `NOT-RELEVANT` | Off-topic (wrong scientific field), wrong species (e.g., human clinical paper for a non-clinical project), wrong endpoint (e.g., mechanistic toxicology for a clinical-pathology-only system), superseded (a clearly newer / authoritative replacement exists), or off-scope (e.g., literature-search platform documentation rather than a scientific source). |
| `UNCERTAIN` | Text extraction failed (exit 1 or 2) OR title / authors are unreadable OR the relevance depends on a domain judgment you cannot make confidently from the first 5 pages. |

**Grey-literature is NOT auto-dismissed.** A CRO position paper, conference abstract, vendor white paper, or working-group report can still be `RELEVANT-NEEDS-NOTE` if its content fills a real SENDEX gap. Attach the `grey-literature` risk flag for transparency, then assign verdict on content alone.

### 3e. Produce the verbatim quote

The quote anchors the verdict. Pick a sentence (or two adjacent sentences) from the extracted text that, if read alone, would convince a domain expert of the verdict. Examples:

- For `RELEVANT-NEEDS-NOTE` verdict on a cyno HCD paper: quote the sentence stating the species + N + endpoint coverage.
- For `NOT-RELEVANT` because wrong species: quote the species declaration (e.g., "Twenty-four healthy adult human volunteers...").
- For `UNCERTAIN` due to extraction failure: quote the script's stderr message + extracted-char count.

Quote MUST be verbatim from `/tmp/triage-text.txt`. If the quote contains formatting artifacts from PDF extraction (broken hyphens, line wraps, encoding artifacts), preserve them but add `[sic]` markers if needed for clarity.

**No paraphrases. No reconstructions. No inferred quotes.** If you cannot find a verbatim sentence that anchors the verdict, downgrade to `UNCERTAIN`.

### 3f. Write the entry

Append (or replace, if a stale entry exists for this PDF) under `## Triage entries` in PDF-TRIAGE.md. Use the schema from the header:

```markdown
### <filename> — <VERDICT>

- **Path:** research/<subpath>/<filename>
- **Identified citation:** <Author Year — Title (DOI/PMID if extractable)> | UNKNOWN
- **Triaged:** YYYY-MM-DD
- **Marker:** TRIAGE-LLM-ASSESSED
- **Risk flags:** <subset of: hallucination-suspect, scope-mismatch, superseded, grey-literature> | none
- **Potential citers:** <comma-separated list of `{{lattice.project.docs.internal_root}}/` paths that COULD cite this if promoted, based on topic overlap> | none-identified
- **Promotion target:** literature/<author>-<year>-<short-slug>.md | n/a | TBD

**Quote (verbatim from PDF, page N):**

> <quote>

**Reasoning:**

<one paragraph: how the quote + extracted metadata supports the verdict, against
which load-bearing knowledge surface, with what known gap>
```

## Step 4 — Update audit-summary cross-reference (one-time, idempotent)

If `.lattice/audit-summary.md` does not yet reference `PDF-TRIAGE.md` as the orphan-PDF disposition surface, add a one-line cross-reference under "What's next" pointing to the register. Skip if already present.

## Step 5 — Decision log

Append to `.lattice/decisions.log`:

```
{timestamp}	lit-triage	{N}	pdfs-triaged	new:{count} stale-refreshed:{count} relevant-needs-note:{count} relevant-contextual:{count} not-relevant:{count} uncertain:{count}	{one-line summary}
```

## Step 6 — Inline summary

Print an inline summary so the user can act:

```
Triaged N PDFs (M new + K stale-refreshed):

RELEVANT-NEEDS-NOTE (X):
  - <filename> -> <promotion target>
  - ...

RELEVANT-CONTEXTUAL (Y):
  - <filename> — <one-line topic>

NOT-RELEVANT (Z):
  - <filename> — <one-line reason>

UNCERTAIN (W):
  - <filename> — <reason for uncertainty>

Register: {{lattice.project.research.literature_pdf_triage}}
```

For `RELEVANT-NEEDS-NOTE` entries, suggest the promotion command(s) the user can run next (typically: read the PDF, create `literature/<slug>.md`, set `local_pdf:`, archive the register entry).

## Constraints

- **Quote-grounded or downgrade.** If you cannot produce a verbatim quote that anchors the verdict, the verdict is `UNCERTAIN`. The marker `TRIAGE-LLM-ASSESSED` is your honesty trail; quote-grounding is the user's verification anchor. These two together are what make the register auditable.
- **No promotions.** This skill writes register entries, never literature notes. Promotion is a separate human-confirmed step. Even when a verdict is `RELEVANT-NEEDS-NOTE`, you do NOT create the literature file.
- **No file deletions.** Do NOT delete an orphan PDF on `NOT-RELEVANT`. The file stays in `research/` as durable provenance; the register entry records why we considered it and rejected it.
- **Idempotent re-runs.** A no-arg re-run on a clean tree (no staleness, no new orphans) writes nothing. Surface "no triage needed" in the inline summary and exit cleanly.
- **One section per PDF.** When replacing a stale entry, edit the existing section in place. Do not append a new section if one already exists for the same path.
- **Grey-literature is content-based.** Do not auto-dismiss vendor papers, conference abstracts, or position pieces. Attach the `grey-literature` risk flag, assess content, assign verdict.
- **Hallucination-suspect on inferred metadata.** If you cannot read the title/authors verbatim from the PDF text, set `Identified citation: UNKNOWN` AND attach `hallucination-suspect`. Do not infer authorship from filename or filesystem context.

## Known failure modes

1. **Inferring content from filename.** A PDF named `chamanza2019.pdf` is not necessarily a Chamanza et al. 2019 paper. The `extract-pdf-text.py` output is the only authoritative source for citation metadata. If extraction returns the title in plain text, use it; if it doesn't, the citation is `UNKNOWN`.

2. **Verdict drift on borderline papers.** A paper that is "almost relevant" (right species, wrong endpoint) is `NOT-RELEVANT`, not `RELEVANT-CONTEXTUAL`. `RELEVANT-CONTEXTUAL` is reserved for papers genuinely on-topic for SENDEX's scope but lacking a current named gap. When in doubt, choose `NOT-RELEVANT` and let a future re-triage promote when a real gap emerges.

3. **Quote inflation.** Picking the longest sentence on page 1 instead of the most diagnostic one. The quote should be the single sentence (or two adjacent sentences) that, alone, justifies the verdict to a domain expert. Length is irrelevant; specificity is the test.

4. **Skipping context-surface reads.** Producing a verdict without reading the four knowledge surfaces is failure mode #1 of this skill. The verdict is *relevance to SENDEX*, not *relevance to toxicology*. You cannot assess SENDEX-relevance without reading SENDEX's load-bearing knowledge.

5. **Over-trusting acquisition-list match.** A filename that matches an acquisition-list candidate's AY key (e.g., `chamanza2010.pdf` ↔ Chamanza 2010) is strong evidence but NOT proof. Verify by reading the title in the extracted text. The corpus audit's zero-cost-resolution section flagged 2 such matches; both required user-confirmation before wiring.
