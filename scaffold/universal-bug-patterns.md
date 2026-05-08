# Universal Bug Pattern Families

> **Layer 1 baseline.** This file enumerates pattern families that recur across most software domains regardless of stack or business logic. Project-side `bug-pattern-families.md` files (referenced via `lattice-project.toml [skills.bug_stress] pattern_families`) extend this baseline with domain-specific patterns.
>
> **How `commands/ops/bug-stress.md` consumes this file:** the harness composes the pattern-family table for Step 1 by concatenating this baseline with the project's content file (when configured). Project entries appear AFTER baseline entries; they neither override nor remove baseline entries.
>
> **How to add a new universal pattern:** if a pattern recurs across 3+ projects (not just multiple subsystems within one project), add it here. Domain-specific patterns belong in the project file, not here.

| Family | Description | Search heuristic | Example |
|--------|-------------|------------------|---------|
| `null-handling` | Field is null/undefined when code assumes it exists | grep field name without null guard across consumers | a struct field accessed via `.x` without checking it's set |
| `off-by-one` | Boundary condition wrong: index, length, range, count | grep loop bounds, array slice / range arithmetic, comparison operators near indices | `for i in 0..n-1` where the intent is `0..n` |
| `threshold-boundary` | Comparison operator wrong direction or wrong inclusive/exclusive | grep threshold value with different comparison operators | `x > 0.3` where `x >= 0.3` was intended |
| `encoding-mismatch` | Same data accessible under multiple encodings; consumer reads one form, producer emits another | grep field/code without normalization; check encoding-conversion sites | string vs enum vs code; `"ALT"` vs `"Alanine Aminotransferase"` |
| `race` | Two or more concurrent paths interleave on shared state | grep shared mutable state without lock; check async paths reading + writing same path | parallel session writes interleave on git index |
| `lock-acquisition-order` | Two locks acquired in different orders by different paths → deadlock | grep lock-acquire pairs; check ordering | thread A: lock(x) lock(y); thread B: lock(y) lock(x) |
| `null-deref` | Dereferencing a value the type system claims is non-null but runtime can be null | grep `!` (non-null assertion), unchecked cast, optional unwrap | TypeScript `!` non-null assertion on async return |
| `regex-backtracking` | Regex pattern allows catastrophic backtracking on adversarial input | grep nested quantifiers `(.+)+`, `(.*)*`, `(a|a)*` | `^(a+)+$` against `aaaa…X` runs exponentially |
| `encoding-utf8-vs-cp1252` | File I/O without explicit encoding picks platform default; UTF-8 content gets mangled | grep `open(path)` or equivalent without explicit `encoding=` | Python on Windows defaults to cp1252; em-dashes become `â€"` |
| `feature-flag-inversion` | Flag name implies one polarity but code branches on the other | grep flag name; verify default value matches the disabled-shape | `ENABLE_X = False` but the gate is `if not ENABLE_X: do_x()` |
| `cache-invalidation` | Cached value not invalidated when source changes; stale read | grep cache writes; check invalidation sites match write sites | React Query `staleTime: 5min`; mutation doesn't invalidate query |
| `path-injection` | User input flows into a file path without sanitization | grep file-path construction with user-controllable input | `open("data/" + user_input)` allows `../../etc/passwd` |
| `command-injection` | User input flows into a shell command without escaping | grep shell-exec calls with string interpolation of inputs | `exec("git log --grep=" + user_input)` |
| `time-zone-drift` | Timestamps stored in one zone, displayed in another, compared in a third | grep date / time / timestamp construction; check zone metadata | UTC backend, local-zone frontend, naive-datetime comparison |
| `int-overflow` | Arithmetic exceeds the integer type's representable range | grep large-multiply / power / bit-shift on bounded ints | int32 multiplied by int32 silently wraps |
| `subset-parser-divergence` | Parser implementing a documented subset of a spec copies general parsing idioms (escape-handling, comment-stripping, multi-line continuation) without auditing whether they match the subset's stated semantics; silently mis-parses inputs that use excluded features | grep parsers with comments like "subset" or "documented subset"; verify each excluded feature has a reject-test, not just an accept-test | TOML subset parser with naive `text[j-1] !== '\\'` quote-tracking silently mis-parses `"C:\\foo\\"` (BUG-042) |

## Search-strategy guidance

When Step 3 of bug-stress runs the pattern-search across a fix, use these heuristics:

| Family | What to grep for |
|--------|-----------------|
| `null-handling` | Same field name without null guard across consumers |
| `off-by-one` | Same loop / range arithmetic in sibling functions |
| `threshold-boundary` | Same threshold value with different comparison operators |
| `encoding-mismatch` | Same canonical-name field used without normalization |
| `race` | Same shared mutable resource accessed without lock |
| `lock-acquisition-order` | Same lock pair acquired in any function across the codebase |
| `null-deref` | Same `!`/cast/unwrap idiom on the affected type |
| `regex-backtracking` | Same nested-quantifier pattern |
| `encoding-utf8-vs-cp1252` | All `open(`/`read_file`/`write_file` call sites without explicit encoding |
| `feature-flag-inversion` | All gates referencing the same flag |
| `cache-invalidation` | All write sites for the same cached resource |
| `path-injection` | All file-path constructions with user-controllable input |
| `command-injection` | All shell-exec call sites |
| `time-zone-drift` | All datetime construction / parse / compare sites |
| `int-overflow` | All arithmetic on the affected integer type |
| `subset-parser-divergence` | Parser modules with comments like "subset of <spec>" or "this parser does not support X"; check whether reject-tests exist for each excluded feature |

## How project content extends this

Project `skill-content/bug-pattern-families.md` files add domain-specific entries (e.g., for a toxicology project: `species-variance`, `domain-logic`, `cascade-failure`, `temporal-edge`, `contract-drift`). The project file follows the same row format. The harness concatenates baseline + project at substitution time.

If a project finds itself wanting to OVERRIDE or REMOVE a baseline entry, that's a signal the baseline is wrong (either too general or too project-shaped). Open a discussion before forking — the right fix is usually to split the baseline entry into a more-universal core + a project-specific extension.
