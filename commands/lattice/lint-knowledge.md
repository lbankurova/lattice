---
name: lint-knowledge
description: Lint the knowledge corpus — runs the generic ID/citation linter plus all typed-schema audits, surfaces defects, and persists findings to TODO.md.
---

You are running a **knowledge-corpus lint pass**. The job is to verify the structural hygiene of the project's knowledge files: stable IDs unique within registries, every code citation resolves to a registry entry, every typed-schema invariant holds, and any drift is surfaced as actionable defects (not silently tolerated).

This skill is structural lint, not science review. It catches ID duplication, unresolved citations, schema violations, and orphaned entries — it does NOT verify whether a fact is scientifically correct. Domain accuracy is the architect-gate's job.

**When to use:**
- Periodically (every few weeks) as a sweep over the knowledge corpus
- Before promoting a new typed registry instance
- After a large knowledge-graph extension (new facts, new contract triangle entries, new FCT bands)
- When `/lattice:autopilot` flags a knowledge-related drift in `ESCALATION.md`

---

## Step 1: Run the generic ID/citation linter

```bash
C:/pg/pcc/backend/venv/Scripts/python.exe scripts/lint-knowledge.py
```

This covers the five stable-ID registries cited from code per `docs/_internal/knowledge/CONVENTIONS.md`:

| Registry | Tag | Lints |
|---|---|---|
| `methods-index.md` | `@method` | STAT/METH/CLASS/ASSAY ID uniqueness, citations, orphans |
| `field-contracts-index.md` | `@field` | FIELD/BFIELD ID uniqueness, citations, orphans |
| `dependencies.md` | `@depends` | External dependency ID uniqueness, citations, orphans |
| `species-profiles.md` | `@species` / `@strain` | SPECIES/STRAIN ID uniqueness, citations, orphans |
| `vehicle-profiles.md` | `@vehicle` / `@route` | VEHICLE/ROUTE ID uniqueness, citations, orphans |

**Exit codes:** 0 = clean (or warnings only); 1 = errors found (duplicate IDs or unresolved citations).

**Flags:**
- `--no-orphans` — skip orphan-detection (when only IDs/citations matter)
- `--show-all-orphans` — dump every orphan instead of the first 10 per registry

## Step 2: Run the typed-schema audits

These are domain-specific structural audits that the generic linter cannot perform (they verify YAML schemas, structural pointers, and bidirectional invariants):

```bash
C:/pg/pcc/backend/venv/Scripts/python.exe scripts/audit-knowledge-graph.py
C:/pg/pcc/backend/venv/Scripts/python.exe scripts/audit-contract-triangles.py
C:/pg/pcc/backend/venv/Scripts/python.exe scripts/audit-fct-coverage.py
C:/pg/pcc/backend/venv/Scripts/python.exe scripts/audit-fct-conflicts.py
```

| Audit | Targets | Enforces |
|---|---|---|
| `audit-knowledge-graph.py` | `knowledge-graph.md` (typed atomic facts) | 6 invariants per `architecture/typed-knowledge-graph-spec.md` (encoding enum, scoring_eligible, contradicts symmetry, sex:both pairing, structural pointer, cited_unverified backlog) |
| `audit-contract-triangles.py` | `contract-triangles.md` | Citation freshness + subset-straggler scan per CLAUDE.md rule 18 |
| `audit-fct-coverage.py` | `field-consensus-thresholds.json` | FCT band coverage per (domain, endpoint, species, sex, direction) |
| `audit-fct-conflicts.py` | Same registry + consumer code | FCT band conflicts between registry and hardcoded thresholds |

Each script exits 0 = clean, 1 = defects.

## Step 3: Classify defects

For each defect produced by any of the above, classify into one of:

| Class | Meaning | Action |
|---|---|---|
| **DUPE-ID** | Same stable ID assigned twice in one registry | Pick the keeper, renumber the other (or merge if they describe the same thing). NEVER reuse the deleted ID; CONVENTIONS.md rule 3: "Once assigned, an ID is never reassigned to a different entry." |
| **UNRESOLVED-CITATION** | Code cites an ID that doesn't exist in its registry | Either (a) add the missing entry to the registry (preferred when the citation reflects real knowledge), or (b) fix the citation to point at the correct existing ID, or (c) remove the citation if the convention was misapplied. |
| **SCHEMA-VIOLATION** | Typed-schema audit reports a structural defect (e.g., asymmetric `contradicts` edge, missing encoding, scoring_eligible inconsistency) | Per the audit's own remediation guidance — usually edit the registry entry to satisfy the invariant. NEVER add a per-line lint exemption without a rationale comment per CLAUDE.md rule 14. |
| **ORPHAN** | Registry entry has no `@tag` citation in code | Two valid handlings: (a) accept the orphan if the entry is documentation-only or stubbed (per CONVENTIONS.md "Stubbed Dependencies" — exempt automatically when body contains `stubbed` / `no API yet` / `hand-seeded` / `always` / `deferred`); (b) add a `// @<tag> <ID>` citation in the code that uses the knowledge — preferred when the entry is genuinely used but the citation was never added. |
| **STALE-CITATION** | Citation resolves to an entry that has been deprecated or marked superseded | Remove or update. |

## Step 4: Persist findings

Lint findings are structural debt. If they only appear in inline output, they vanish after the session. **Persist non-clean findings to `docs/_internal/TODO.md`** so they survive into the next cycle.

For each defect not addressed in this session:

- **DUPE-ID errors** → `- [ ] **LINT-KNOWLEDGE: duplicate ID {id} in {registry}** — at lines {n1}, {n2}. Fix: pick keeper + renumber other. [Area: Knowledge hygiene]`
- **UNRESOLVED-CITATION errors** → `- [ ] **LINT-KNOWLEDGE: unresolved @{tag} {id}** at {file}:{line}. Fix: add registry entry OR correct citation. [Area: Knowledge hygiene]`
- **SCHEMA-VIOLATION errors** → `- [ ] **LINT-KNOWLEDGE: {check} violation in {registry}** — {message}. [Area: Knowledge hygiene]`
- **ORPHAN warnings** → batch into a single TODO line per registry: `- [ ] **LINT-KNOWLEDGE: {N} orphans in {registry}** — entries lacking @tag citations from code. Decide per-entry: cite from code OR mark as stubbed/documentation-only. [Area: Knowledge hygiene]`

Do NOT batch ORPHAN warnings if there are fewer than 5 in a registry — at small N, list each one explicitly so the work is concrete.

## Step 5: Report

Output format:

```
KNOWLEDGE LINT: {YYYY-MM-DD}

GENERIC LINTER:
  {N} entries across 5 registries; {M} citations
  Per registry: methods/{n}/{cited}, field-contracts/{n}/{cited}, ...

TYPED-SCHEMA AUDITS:
  knowledge-graph: {PASS/FAIL} ({N} facts, {warnings} warnings)
  contract-triangles: {PASS/FAIL}
  fct-coverage: {PASS/FAIL}
  fct-conflicts: {PASS/FAIL}

DEFECTS:
  DUPE-ID:              {count}
  UNRESOLVED-CITATION:  {count}
  SCHEMA-VIOLATION:     {count}
  ORPHAN (warning):     {count} grouped by registry
  STALE-CITATION:       {count}

DETAIL:
  {only show errors and SCHEMA-VIOLATIONs in detail; orphans summarized by count}

PERSISTED:
  TODO.md: {count} new entries appended
  ESCALATION.md: {count} blocking issues escalated (only if any DUPE-ID or SCHEMA-VIOLATION cannot be auto-fixed)

NEXT ACTIONS:
  {1-3 bullets — what the user should do next}
```

## Rules

- **Lint is structural, not scientific.** Do not flag "this fact looks wrong" — that's the architect-gate's job. Only flag defects the audit scripts can actually catch.
- **Orphan warnings are informational, not blocking.** Many entries are intentionally documentation-only. The orphan count is a *hygiene signal*, not a *defect* — surface it, persist it once, but don't fail on it.
- **DUPE-ID is non-negotiable.** Two definitions for the same ID is a contract drift per CLAUDE.md rule 18. Always escalate to errors. Never merge silently.
- **Never auto-renumber IDs.** Per CONVENTIONS.md rule 3, IDs are stable once assigned. If a duplicate is detected, present both definitions to the user and ask which is the keeper. Renumbering the wrong one breaks code citations downstream.
- **Skip-fragments are honored.** Do not lint `_archived/`, `node_modules/`, `dist/`, `build/`, `__pycache__/`, `.venv-core/` — these are vendored, generated, or historical content.
- **Citation regex is the contract.** The linter recognizes `@<tag> <ID>` where tag is one of `method | field | depends | species | strain | vehicle | route`. Other citation conventions (e.g., `// references METH-05`) are NOT picked up. If the user wants to add a new tag, that's a CONVENTIONS.md change requiring approval.

## Integration points

- **Ad-hoc** by the user when picking up knowledge-corpus drift work
- **`/lattice:autopilot`** can call this when `ESCALATION.md` flags a knowledge-related issue
- **Pre-promotion** when a new typed registry is being graduated from `incoming/` or `research/` to `knowledge/`
- **Post-extension** after large knowledge-graph extensions (new facts, new contract triangles, new FCT bands)

## Cross-references

- `scripts/lint-knowledge.py` — generic ID/citation linter (this skill's primary engine)
- `scripts/audit-knowledge-graph.py` — typed-fact schema audit (per `architecture/typed-knowledge-graph-spec.md`)
- `scripts/audit-contract-triangles.py` — contract triangle audit (CLAUDE.md rule 18)
- `scripts/audit-fct-coverage.py`, `scripts/audit-fct-conflicts.py` — FCT registry audits
- `docs/_internal/knowledge/CONVENTIONS.md` — `@<tag> <ID>` citation convention
- `docs/_internal/architecture/typed-knowledge-graph-spec.md` — schema-spec and audit invariants for the typed knowledge graph
