---
name: impact
description: Analyze what breaks or changes if a function, file, or module is modified. Use before touching shared code.
---

You are performing impact analysis for a proposed code change. Your job is to trace all downstream consumers and identify what would break, change behavior, or need updating.

**Input:** A target to analyze. Examples:
- `impact backend/services/analysis/classification.py`
- `impact computeEndpointSignal in findings-rail-engine.ts`
- `impact EndpointSummary type`
- `impact SEVERITY_MAP`

## Step 1: Identify the target

Parse the input to determine:
- **File-level:** All exports from the file
- **Function-level:** A specific exported function/class/constant
- **Type-level:** A TypeScript type/interface or Python type

## Step 2: Trace direct consumers

### For Python targets
```bash
cd C:/pg/pcc/backend && grep -rn "from.*{module}.*import\|import.*{module}" --include="*.py" .
```

### For TypeScript targets
```bash
cd C:/pg/pcc/frontend && grep -rn "from.*{file}.*import\|} from.*{file}" --include="*.ts" --include="*.tsx" src/
```

For each consumer, note:
- The importing file
- What it imports (specific names or wildcard)
- How it uses the import (calls it, extends it, re-exports it, passes it as prop)

## Step 3: Trace transitive consumers

For each direct consumer, check if IT is imported by other files. Go 2-3 levels deep — beyond that, the impact is too diffuse to be actionable.

Build an impact tree:
```
target
  -> direct consumer A (calls target.fn())
    -> transitive consumer A1 (renders A's output)
    -> transitive consumer A2 (passes A's result as prop)
  -> direct consumer B (re-exports target)
    -> transitive consumer B1
```

## Step 4: Classify impact

For each consumer, classify the impact of changing the target:

| Consumer | Relationship | Impact | Risk |
|----------|-------------|--------|------|
| [file:function] | [calls/imports/extends/renders] | [breaks/behavior change/type error/none] | [high/medium/low] |

**Impact categories:**
- **Breaks** — will cause a runtime error or type error (removed export, changed signature)
- **Behavior change** — consumer still compiles but produces different output (changed return value, different calculation)
- **Type error** — TypeScript compilation will catch it (changed interface)
- **None** — consumer doesn't use the part being changed

## Step 5: Check generated data pipeline

If the target is in the backend generator or analysis pipeline, also check:
1. Does the change affect generated JSON shape? → Check `{{lattice.project.docs.field_contracts}}`
2. Does the change affect generated JSON values? → Flag as engine change, validation needed
3. Does the frontend consume the affected JSON fields? → Trace through hooks and components

## Step 6: Report

```
IMPACT ANALYSIS: {target}
==========================

Direct consumers: {count}
Transitive consumers: {count}
Risk level: HIGH / MEDIUM / LOW

IMPACT TREE:
[tree from Step 3]

CONSUMER TABLE:
[table from Step 4]

RECOMMENDATIONS:
- [what to update alongside the change]
- [what tests to run]
- [whether validation is needed]
```

## Rules

- **Be exhaustive on direct consumers, selective on transitive.** Missing a direct consumer is a bug. Missing a 4th-level transitive consumer is acceptable.
- **Distinguish compile-time from runtime impact.** TypeScript catches type changes at build time. Behavior changes are invisible until tested.
- **Flag engine changes explicitly.** Any change to classification, scoring, or statistical logic needs `/regen-validation`.
- **Don't just grep — read.** A file that imports a function but never calls it has zero impact. Check actual usage, not just import presence.
