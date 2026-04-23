# Bug Pattern Taxonomy

Append-only log of bug pattern families encountered in this project. When a pattern family accumulates 3+ instances, extract a parameterized test suite.

## Pattern Families

| Family | Description | Test strategy | Instances |
|--------|-------------|--------------|-----------|
| `null-handling` | Field null/undefined when code assumes it exists | Assert non-null at consumption sites; test with missing data | 0 |
| `encoding-variance` | Data standard allows multiple encodings for same concept | Test with all known encoding variants per field | 0 |
| `threshold-boundary` | Off-by-one, wrong operator, boundary not tested | Parameterized test at boundary, boundary-1, boundary+1 | 0 |
| `domain-logic` | Scientific rule incorrectly implemented | Integration test against reference data with known answer | 0 |
| `statistical-edge` | Small N, zero variance, empty groups, NaN propagation | Test with n=0, n=1, n=2, all-same-values, all-missing | 0 |
| `contract-drift` | Field declaration / enforcement / consumption sites diverge silently | Triangle audit on cycle close (CLAUDE.md rule 18); per-field sync grep on commit (COMMIT-CHECKLIST item 12); see `contract-triangles.md` | 1 |
| `species-variance` | Assumption valid for one species but not others | Per-species parameterized test; check species-profiles.md | 0 |
| `temporal-edge` | Time-dependent logic with boundary cases | Test with duration=0, single-timepoint, no-recovery-period | 0 |
| `ui-state-sync` | Selection/filter state not propagated across surfaces | E2E test: select in surface A, verify surface B updates | 0 |
| `cascade-failure` | Override or upstream change propagates incorrectly | Test override at source, verify all downstream consumers | 0 |

## Instance Log

Format: `DATE | FAMILY | SUBSYSTEM | BUG | FIX | TESTS ADDED | SAME-PATTERN COUNT`

<!-- Append entries below this line -->

2026-04-23 | contract-drift | severity-enum-vocabulary | BFIELD-21 (`severity` enum) widened to 4 values during Phase B in implementation, canonical mapping, and 9+ frontend type files; pytest invariant + contract doc were not updated. Drift surfaced when single-arm gene-therapy study tripped the 3-value test. | Widened test enum, updated contract docs, added paired BFIELD-92 invariant (`not_assessed_reason`), formalized triangle-hygiene rule (CLAUDE.md 18). | `BFIELD-21`, `BFIELD-92`, `not_assessed_reason` invariant tests | 1
