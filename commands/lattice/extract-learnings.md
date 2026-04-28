---
name: lattice:extract-learnings
description: Extract durable knowledge from implemented specs into knowledge/ + architecture/ before archive. Enforces CLAUDE.md rule 7. Auto-invoked at /lattice:review cycle-close.
---

# /lattice:extract-learnings

Formalizes CLAUDE.md rule 7 ("Doc lifecycle: specs are disposable, system docs are durable") as an enforceable skill rather than a convention.

The failure mode this catches: a spec lands with novel domain facts, architectural patterns, or contract additions; the spec gets archived; the durable knowledge it surfaced never makes it into `knowledge/` or `architecture/`; the next spec author re-derives it from scratch (or worse, contradicts it). Conflated commits 1370c103 and 521f1d16 are the canonical cases — the conflated commit message didn't trigger anyone's "extract before archive" discipline, so the durable knowledge was lost in commit-laundry.

## Inputs

- `<spec-path>` — a path under `docs/_internal/incoming/` (the spec being closed out)
- OR `--commit <ref>` — a commit reference; the skill resolves the spec path from the commit's `Topic:` trailer or staged spec file
- OR `--sweep` — scan `docs/_internal/incoming/` for any spec older than 7 days that hasn't been archived; report unprocessed specs

## When invoked

- **Automatic:** `/lattice:review` Step 5d (cycle-close) calls `/lattice:extract-learnings <spec-path>` when the staged set includes an `incoming/*.md` spec being closed (signal: spec referenced in commit message and no longer in `incoming/` after the commit, OR spec referenced in commit but moved to `incoming/archive/` in the same diff).
- **Manual:** after implementing a spec but before committing: `/lattice:extract-learnings docs/_internal/incoming/foo-spec.md`. Reviews and applies.
- **Sweep:** `/lattice:extract-learnings --sweep` scans for unprocessed specs (in `incoming/` >7 days, none with `[archived]` cross-reference). Useful at the end of a cycle to catch missed extractions.

## Step 1: Read the spec (or specs in --sweep mode)

Read the full spec body. Identify the sections that produced durable knowledge — content that **another spec would cite**, not content that's specific to this implementation pass.

## Step 2: Classify candidates by destination

For each durable item, classify by destination:

| Candidate | Destination | Format |
|-----------|------------|--------|
| Numeric threshold (cutoff, magnitude floor, p-value) | `docs/_internal/knowledge/knowledge-graph.md` | Typed YAML fact (CLAUDE.md rule 19) |
| Species-specific baseline / strain-rate | `docs/_internal/knowledge/knowledge-graph.md` (typed) + `species-profiles.md` (cite fact) | Typed fact + narrative cite |
| Route / vehicle / regulatory cutoff | `knowledge-graph.md` (typed) | Typed fact |
| Mechanistic disable-marker (e.g., "no LB → BW concordance is invalid") | `knowledge-graph.md` (typed) | Typed fact with `disable_marker: true` |
| Statistical method (test, threshold, application logic) | `docs/_internal/knowledge/methods-index.md` | Method row + linked detail file |
| Field contract addition (new field, enum widening) | `docs/_internal/knowledge/field-contracts.md` + `field-contracts-index.md` + (if multi-site) `contract-triangles.md` | Per-field row + triangle entry |
| Architectural decision / cross-subsystem pattern | `docs/_internal/architecture/<subsystem>.md` (existing) OR new file with user approval | Decision section + rationale |
| New design pattern / convention | `.claude/rules/design-decisions.md` (with explicit user approval per CLAUDE.md rule 1) | Table row |
| Anti-pattern / failure mode | `.claude/rules/audit-checklist.md` (visual) OR `bug-patterns.md` (analytical) | Negative-form rule |
| Contract triangle drift | `docs/_internal/knowledge/contract-triangles.md` | Triangle entry naming declaration / enforcement / consumption sites |

**Non-durable examples — DO NOT extract:**
- "We chose React Query over SWR for caching" (one-time tooling choice; no future spec will cite this)
- "Used `useEffect` cleanup pattern" (not novel; framework convention)
- "Handles the empty-array edge case in the renderer" (defensive code, not domain truth)
- Implementation timing notes ("phase 1 first because...")

## Step 3: For each candidate, locate-or-create destination

For each candidate identified in Step 2:

1. **Search the destination registry** for an existing entry that already covers this. If one exists, the spec must either (a) cite it (no extraction needed; the spec body is restating known truth, which is itself a defect under rule 19 if the spec restates rather than cites), or (b) extend it (provide diff to existing entry).
2. **If no existing entry**, prepare a new entry. Must include source attribution: `<spec-name> (<commit-sha>)`.
3. **For typed facts**, run `python scripts/audit-knowledge-graph.py --validate-new` against the proposed entry to verify schema compliance before staging.

## Step 4: Stage the extractions

Two modes:

- **Default (review mode):** Print the proposed extractions as a checklist. The user accepts or modifies before applying.
- **`--apply`:** Apply the extractions directly. Caller takes responsibility for the changes (typically used in `/lattice:review` cycle-close after the user has already approved the cycle).

Each applied extraction:
1. Edit the destination file with the new entry.
2. Append a `decisions.log` row: `<ts>\textract-learnings\tEXTRACTED\t<spec>\t<destination>\t<one-line summary>`.
3. Insert a back-reference into the spec body: `[Extracted to <destination>:<anchor>](relative-path)`.

## Step 5: Archive the spec

Move the spec from `docs/_internal/incoming/` to `docs/_internal/incoming/archive/<year>-<month>/<spec-name>.md`. The archived copy:
- Keeps the back-references inserted in Step 4
- Adds a header note: `**Archived <date>**. Durable knowledge extracted: <list of destinations>. Implementation commit: <sha>.`

If the spec has no extractable durable knowledge (rare — usually means the spec was implementation-detail-heavy or trivial), record this explicitly: `Archived <date>. No durable knowledge extracted (rationale: <one line>).` and skip Step 4. The rationale is required so future audits can distinguish "no knowledge to extract" from "extraction was forgotten."

## Step 6: Update the architecture spec if applicable

Per CLAUDE.md rule 6: "Architecture specs must be updated when their subsystem ships changes — create if missing."

If the spec's implementation modifies a subsystem that has an architecture spec at `docs/_internal/architecture/<subsystem>.md`:
- Update "Last validated" date to today.
- Add a row to the change-log section noting the spec name + commit + summary.
- If the implementation introduced a new sub-component or invariant, update the relevant section.

If the subsystem has NO architecture spec, evaluate whether one is warranted (multi-file subsystem, multiple consumers, complex internal logic). If yes, propose creating one — do not auto-create without user approval (CLAUDE.md rule 8 / no directory sprawl applies).

## Step 7: Persist the findings

After all extractions are applied (or staged for review):

1. **`decisions.log`** — append one summary row: `<ts>\textract-learnings\tCYCLE-CLOSE\t<spec>\t<N-extractions>\t<destinations-joined-with-commas>`.
2. **Commit message footer (if invoked from /lattice:review):** add a `Knowledge:` trailer listing the destinations:
   ```
   Knowledge:
   - knowledge-graph.md: 2 typed facts (HCD-FACT-N, NOAEL-FACT-M)
   - architecture/scoring-engine.md: change-log row + rule-22 fact promotion
   ```
3. **Output summary** to stdout: `Extracted N items to M destinations. Archived <spec>. See decisions.log for details.`

## What this skill does NOT do

- **Does not invent durable knowledge from thin spec content.** If a spec doesn't surface novel domain truth, the skill records that and archives without extraction. Forcing extraction from spec-implementation-detail content is exactly the failure mode "rule 19 prose in two un-typed registries" guards against.
- **Does not modify code.** Only docs/_internal/ and decisions.log are touched.
- **Does not propose new architecture-spec creation without user approval.** Bound by CLAUDE.md rule 1 (design-system) and rule 8 (no directory sprawl).
- **Does not run during `/lattice:spike`.** Spikes intentionally skip the doc lifecycle (per `commands/lattice/spike.md`); their learnings are extracted via `/lattice:spec-from-code` followed by a normal cycle close, not via this skill.

## Auto-invocation contract (`/lattice:review` Step 5d)

When `/lattice:review` runs at cycle-close and detects a spec being archived in the same commit (or moved out of `incoming/` to `incoming/archive/`), it MUST call this skill before writing the review gate. The skill runs in `--apply` mode by default at cycle-close (the cycle is being closed; the user has already approved the work).

If the skill produces no extractions AND the spec has no `Archived <date>. No durable knowledge extracted` rationale, `/lattice:review` flags this as a defect: the spec author either missed extractable knowledge or didn't author the rationale. The review-gate writer accepts the defect on user override (`/lattice:review --skip-extract-learnings`) but logs the override to decisions.log so periodic sweeps can audit.

## Failure modes prevented

- **The conflation case (1370c103, 521f1d16):** spec extraction was bundled into a conflated commit; the commit message didn't mention the spec, so no agent invoked the extract step. With this skill auto-running at /lattice:review Step 5d, the cycle close cannot proceed without either (a) extractions logged or (b) explicit "no extraction needed" rationale logged.
- **Restated-value drift (rule 19 sibling):** when an implementation introduces a numeric threshold, this skill catches it at extraction time and forces it to land in the typed graph rather than just in the spec body. Architects + peer-review check the placement on incoming specs (rule 19); this skill closes the loop on outgoing specs.
- **Architecture-spec rot:** the explicit Step 6 update prevents the case where a subsystem ships changes but its architecture spec stays at last-quarter's snapshot.
