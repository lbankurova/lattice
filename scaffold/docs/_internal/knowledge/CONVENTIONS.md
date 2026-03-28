# Knowledge File Conventions

Knowledge files capture **durable analytical and domain knowledge** that the system uses. They are the canonical reference for how computations work, what fields mean, and what domain-specific rules apply.

## Core Rules

1. **Knowledge never references code.** Knowledge docs describe WHAT and WHY — algorithms, thresholds, domain rules. They never import from or reference specific file paths. Code references knowledge; knowledge doesn't reference code.

2. **Index files provide one-line lookups.** Every knowledge file with >10 entries has a companion `-index.md` with one-line summaries for quick scanning. Agents check the index before reading the full document.

3. **Stable IDs.** Every method, field contract, and domain rule has a stable ID (e.g., `METHOD-01`, `FIELD-12`, `BFIELD-05`). IDs are never reused. Deleted items keep their ID (marked deprecated).

4. **Updates are append-first.** When a method changes, update the entry — don't delete and recreate. Add a "Changed: [date] — [what changed]" note. This preserves the audit trail.

5. **Knowledge is generated, not authored.** Where possible, knowledge docs are generated from code (e.g., test suites that produce `scientific-logic.md`). Generated docs note their generation source and date.

## File Types

### methods.md / methods-index.md
Registry of statistical tests, algorithms, classification formulas, and scoring functions. Each entry: ID, name, what it computes, inputs, outputs, thresholds, references.

### field-contracts.md / field-contracts-index.md
Frontend derived field contracts. Each entry: ID, field name, type, where computed, invariants, null semantics, gotchas.

### api-field-contracts.md
Backend API computed fields crossing to the frontend. Each entry: ID, field name, type, endpoint, nullability, enum values, invariants.

### species-profiles.md (if applicable)
Every place where analysis depends on species/strain-specific parameters.

### vehicle-profiles.md (if applicable)
Vehicle and route-of-administration confounds affecting endpoint interpretation.

## When to Update

- **Commit checklist item 6** requires updating knowledge docs when analytical logic changes
- **`/review`** checks for contract drift (documented type ≠ actual code type)
- **New computed fields** crossing engine→UI boundary need a FIELD or BFIELD entry
