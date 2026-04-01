# Code Quality Guardrails

> Maintained by `/lattice:architect audit`. Read by `/lattice:synthesize`, `/lattice:spike`, and `/lattice:review`.

## Domain-Critical Modules

Code that is complex because the domain is complex. Do not simplify without scientist review. Each entry must state what scientific behavior the complexity encodes.

<!-- Populate after first /lattice:architect audit -->
<!-- Format:
| Module | Function/Section | What It Encodes | Simplification Risk |
|--------|-----------------|-----------------|-------------------|
| path/to/file.py | function_name() | [domain logic description] | [what breaks if simplified] |
-->

## Canonical Patterns

Established patterns in this codebase. Reuse these; do not reinvent.

<!-- Populate after first /lattice:architect audit -->
<!-- Format:
| Pattern | Where Implemented | When to Use |
|---------|-------------------|-------------|
| [pattern name] | [file:function] | [use case] |
-->

## Known Hotspots

Files and functions with high complexity that are tracked as tech debt. These are known issues, not new findings.

<!-- Link to TODO.md items -->
<!-- Format:
| File | Issue | TODO Ref | Status |
|------|-------|----------|--------|
-->

## Complexity Budget

Baseline line counts per directory. When a directory grows past its threshold, new code should prefer extending existing files over creating new ones (unless the file itself is over the per-file limit).

<!-- Populate from codebase metrics -->
<!-- Format:
| Directory | Current LOC | File Count | Per-File Threshold |
|-----------|-------------|------------|-------------------|
| backend/services/analysis/ | X | Y | 500 |
| backend/generator/ | X | Y | 500 |
| frontend/src/components/ | X | Y | 800 |
| frontend/src/lib/ | X | Y | 800 |
-->

## Lint Exemptions

Code that carries complexity lint exemptions (`# noqa: C901`, `// eslint-disable complexity`). Each exemption must have a justifying comment. Bare exemptions are findings.

<!-- Format:
| File:Line | Exemption | Justification |
|-----------|-----------|---------------|
-->

## Test Strategy

What needs tests, what kind, and what doesn't.

| Code Type | Test Type | Rationale |
|-----------|-----------|-----------|
| Classification/scoring logic | Integration test with real study data | Domain logic — assert outputs, not internals |
| Statistical methods | Unit test with edge cases | Mathematical correctness — empty data, single row, ties |
| Data transformations | Unit test with boundary conditions | Transform correctness — null handling, type coercion |
| API routes | None (type-safe plumbing) | TypeScript + FastAPI type system covers it |
| UI components (interactive) | Behavioral test or snapshot | Only for non-trivial interaction patterns |
| UI components (display-only) | None | Covered by build + visual review |
| Config/preferences | None | Static data, validated at load time |
