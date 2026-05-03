---
name: check
description: Lightweight "did I break anything?" — build + validation sanity check without full /review ceremony. Use mid-implementation.
---

Quick quality check for mid-implementation use. Not a substitute for `/lattice:review` — use this when you want fast feedback before the full gate.

## What it does

Run these checks in parallel where possible, report results:

### 1. Build check

```bash
cd C:/pg/pcc/frontend && npm run build 2>&1 | tail -20
```

Report: PASS (zero errors) or FAIL (with errors).

### 2. Engine change detection

Check `git diff --name-only` for engine files:
- Backend: `classification.py`, `findings_pipeline.py`, `statistics.py`, `view_dataframes.py`, `domain_stats.py`, `scores_and_rules.py`
- Frontend: `findings-rail-engine.ts`, `derive-summaries.ts`, `cross-domain-syndromes.ts`, `endpoint-confidence.ts`, `finding-nature.ts`, `organ-weight-normalization.ts`, `syndrome-interpretation.ts`, `g-lower.ts`

If any engine files changed, flag: **"Engine files modified — validation run recommended."**

### 3. Python syntax check

```bash
cd C:/pg/pcc/backend && find . -name '*.py' -newer .last-check -exec python -c "import ast; ast.parse(open('{}').read())" \; 2>&1
```

If that's impractical, check only the changed Python files:
```bash
cd C:/pg/pcc/backend && git diff --name-only -- '*.py' | xargs -I{} python -c "import ast; ast.parse(open('{}').read())"
```

### 4. Quick import smoke test

```bash
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe -c "
from routers.temporal import router as temporal_router
from routers.analysis_views import router as analysis_router
from generator.generate import run_pipeline
print('Core imports OK')
"
```

### 5. Visual smoke test (frontend changes only)

If `git diff --name-only` includes frontend files (`.tsx`, `.ts` under `src/`, `.css`), and Playwright MCP is available:

1. **`browser_navigate`** to the app URL (default `http://localhost:5173`)
2. **`browser_console_messages`** — check for JavaScript errors
3. **`browser_snapshot`** — verify the page rendered (not blank, no error boundary)

If the dev server isn't running or Playwright MCP isn't configured, report: `Visual: SKIPPED — dev server not running` and continue. This check is best-effort during mid-implementation — the full visual verification happens in `/lattice:review` Step 3b.

## Output format

```
CHECK RESULTS
=============
Build:    PASS / FAIL
Python:   PASS / FAIL
Imports:  PASS / FAIL
Engine:   No engine files changed / ENGINE FILES MODIFIED — run /regen-validation
Visual:   PASS / FAIL / SKIPPED — [reason]

OPS_CHECK_VERDICT: PASS
```

The final line `OPS_CHECK_VERDICT: <PASS|FAIL>` is the single source of truth for automated callers (mechanical-fix-cycle gate, autopilot circuit breaker, future integrations). Rules:

- Emit `OPS_CHECK_VERDICT: PASS` ONLY when:
  - Build, Python, and Imports all = `PASS`, AND
  - Visual = `PASS` or `SKIPPED` (a skipped visual check does not fail the run)
- Emit `OPS_CHECK_VERDICT: FAIL` when any of the above fails. List the failed rows on subsequent lines under the verdict so the autopilot escalation log captures the diagnostic.
- The Engine row is informational only — engine modification is a flag, not a fail. It does NOT affect the verdict.

This line MUST appear on its own as the final non-empty line of the report. Do not combine it with other text. Automated gates match the literal substring `OPS_CHECK_VERDICT: PASS`; anything else (including "OPS_CHECK_VERDICT: FAIL", the absence of the line entirely, or a misspelling) is treated as a fail. Fail closed.

If everything passes, after the verdict line say: **"All clear. Continue working or run /lattice:review when ready to commit."**

If anything fails, show the error and suggest a fix BEFORE the verdict line.

## When to use

- After a batch of edits, before continuing to the next task
- After resolving merge conflicts
- When you're unsure if a backend change broke imports
- Before starting a `/lattice:review` (avoids wasting time on a full review with a broken build)

## When NOT to use

- As a substitute for `/lattice:review` before committing — this doesn't check docs, MANIFEST, decision quality, or spec compliance
- For validation — use `/regen-validation` for that
