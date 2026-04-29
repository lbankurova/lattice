# Review Protocols (partner file to `commands/lattice/review.md`)

> **Not a skill.** Sited outside `commands/` so it is not auto-discovered as a skill. This file is included by reference from `review.md` Step 3b.
>
> Contains the four detailed protocols that `review.md` keeps short:
>
> - `## VISUAL` — Playwright navigation, screenshot, interaction smoke test.
> - `## DATA` — empirical-claim verification against generated JSON.
> - `## TRIANGLE` — contract-triangle synchronization audit (CLAUDE.md rule 18).
> - `## ALGORITHM` — algorithm-output defensibility on representative data (CLAUDE.md rule 19).
>
> `review.md` invokes these by section heading. The MECHANICAL CHECKS section emits one line per protocol with PASS / FAIL / SKIPPED, in the format documented at the bottom of this file.

---

## When to run each protocol

| Protocol | Trigger |
|---|---|
| VISUAL | Diff contains any `.tsx`, `.ts` under `src/`, or `.css` |
| DATA | Spec contains any cardinality / numeric / "shows X" claim, OR diff consumes generated output |
| TRIANGLE | Diff modifies an enum constant, JSON schema, Pydantic model, TS type union, contract-doc table row, or pytest invariant over generated JSON |
| ALGORITHM | Diff modifies OR consumes the output of a path matching `.lattice/algorithm-paths.txt` (default paths below if file is absent) |

Default ALGORITHM paths if `.lattice/algorithm-paths.txt` does not exist:
`**/derive-summaries.ts`, `**/endpoint-confidence.ts`, `**/findings-rail-engine.ts`, `**/cross-domain-syndromes.ts`, `**/syndrome-rules.ts`, `**/services/analysis/**/*.py` (when the file mentions NOAEL/LOAEL/scoring/classification keywords).

---

## VISUAL

**Question answered:** "did the page render without errors?"

### Prerequisites

- Frontend dev server running (default: `http://localhost:5173`)
- Backend running (default: `http://localhost:8000`) if views need data
- Playwright MCP server configured in `.mcp.json`

If prerequisites aren't met, attempt to detect them:
1. `browser_navigate` to the app URL — if it fails on first attempt, retry ONCE. If second attempt fails, state: `VISUAL: SKIPPED — Playwright unreachable after retry` and fall back to DATA. Do NOT mark the review blocked on first failure.
2. If only the backend is down, views may show loading/error states — note this in the output, don't count it as a UI failure.

### Step 1: Map changes to views

Read the changed frontend files and determine which view(s) / route(s) they affect. Examples:

- `FindingsView.tsx` changed → navigate to the Findings view
- `DoseResponseChartPanel.tsx` changed → navigate to a view that renders it
- `severity-colors.ts` changed → check multiple views (shared utility)
- `lib/` utility changed → check the primary consumer

If you can't determine the route, navigate to the app root and verify it loads.

### Step 2: Navigate and screenshot

For each affected view:

1. **`browser_navigate`** to the view URL.
2. **`browser_console_messages`** — check for JavaScript errors. Errors originating from changed files = FAIL.
3. **`browser_take_screenshot`** — save for user review. State the screenshot path in output.
4. **`browser_snapshot`** (accessibility tree) — verify:
   - The view rendered (not blank, not stuck on loading spinner, not showing error boundary).
   - Key data elements are present (tables have rows, charts have content, rails have items).
   - No `undefined`, `NaN`, `[object Object]` visible in data displays.

### Step 3: Interaction smoke test

If the changeset modifies **click handlers, hover behavior, selection logic, or toggle/filter state**:

1. Identify the primary interaction the change affects.
2. Execute it via `browser_click` or `browser_hover`.
3. Take a second screenshot or snapshot — verify the expected response occurred (panel updated, selection changed, tooltip appeared, series toggled).

Skip this step if the change is purely presentational (styling, labels, layout).

### Step 4: Multi-view check (shared code only)

If the changed file is consumed by 3+ views (utilities in `lib/`, shared components):

- Navigate to at least 2 different views that use the changed code.
- Verify both render correctly.

### Anti-patterns

- **Do not treat "Visual verification required by user" as an acceptable output when Playwright MCP is available.** That phrasing is a legacy escape hatch from before agents had browser access. If the MCP tools are available and the dev server is running, USE THEM. Only fall back to user verification when the tools genuinely cannot be used (server down, MCP not configured). On first failure, retry ONCE before giving up.
- **Do not mark VISUAL: SKIPPED without also running DATA.** Playwright unreachable is not a reason to skip everything. DATA requires only the generated JSON and a Python interpreter, both of which are always available in this environment.

---

## DATA

**Question answered:** "does the data say the page SHOULD have content?"

DATA is INDEPENDENT of VISUAL. Playwright tells you "did it render", DATA tells you "should it have content at all". Run both.

### When to run

- The spec contains any claim of the form "count is X", "≤ N rows", "shows the fragile subjects", "matches the chart", or similar cardinality/content assertion.
- Any time Playwright is unavailable — DATA is the mandatory fallback, not SKIPPED.
- Any review of frontend code that consumes generated output (findings, analytics, scoring).

### How to run

1. Identify every empirical claim in the spec. Copy the exact wording.
2. For each claim, load the relevant `backend/generated/{study}/unified_findings.json` (or other generated file) and compute the actual value.
3. Compare observed vs expected. Cite both.
4. If the observed value doesn't match, flag as `DATA: FAIL — spec says X, observed Y` and block the commit until resolved.

### Forms that satisfy this protocol

- A fixture-based test that loads real generated output (preferred — runs in CI going forward). See `frontend/tests/loo-sensitivity-pane-logic.test.ts` "PointCross BW data fixture" describe block for the pattern.
- A Python one-liner recorded in the review output: `backend/venv/Scripts/python.exe -c "import json; ..."` with the actual printed value shown.
- `/ops:explore-data` with the specific question from the spec.

### Forms that do NOT satisfy

- Mirror-pattern unit tests (they test code-vs-spec, not code-vs-reality).
- "I read the code and it looks right" — the bug that motivated this rule shipped with correct-looking code.
- "The build passes" — build catches type/syntax errors, not empirical mismatches.
- "Playwright rendered the page without console errors" — a blank chart has no console errors.
- **Do not substitute mirror tests for DATA.** Mirror tests pass when code matches spec text; DATA catches the spec-vs-reality gap. They are complementary, not alternatives. The loo-display-scoping cycle (2026-04-07) had 20 passing mirror tests AND shipped an empty chart because nobody ran the spec's count claim against real data.

---

## TRIANGLE

**Question answered:** "is the contract field synchronized at declaration / enforcement / consumption?"

CLAUDE.md rule 18 ("Contract triangle hygiene") is the authority. This protocol is the audit-script invocation that enforces it. Read CLAUDE.md rule 18 verbatim for the rule statement; do not reproduce it here.

### Audit-script invocation

```bash
cd <project-root> && python scripts/audit-contract-triangles.py
```

The script:
1. Parses `docs/_internal/knowledge/contract-triangles.md` for triangles with explicit `Vocabulary: {...}` declarations.
2. Verifies every cited file:line still resolves.
3. Scans the registered scan directories for proper-subset literals (e.g., a 3-value `{adverse, warning, normal}` literal where the canonical vocabulary is 4-value) — the BFIELD-21 straggler shape.
4. Diffs against `scripts/data/triangle-audit-baseline.txt` — only NEW stragglers fail the check; pre-existing ones in the baseline are tracked tech-debt.

Exit code 0 = PASS; 1 = FAIL with new stragglers; 2 = config error (registry missing/unparseable).

### Resolving NEW stragglers

If the script reports NEW stragglers, walk each and either:

- Fix it (widen the subset to match the canonical vocabulary), OR
- Add `triangle-audit:exempt -- <rationale>` on the line if the subset is intentionally narrower (e.g., a sub-enum like BFIELD-27's `SEVERITY_NO_NORMAL`), OR
- Run `python scripts/audit-contract-triangles.py --write-baseline` to accept the new state — but only after explicit triage and with the triage rationale in the commit body.

### Registry maintenance

If the diff introduced a new contract field (new enum value, new BFIELD), require a new row in `contract-triangles.md` with declaration / enforcement / consumption sites. If site count grew on an existing triangle, update the row.

The TRIANGLE protocol supersedes Step 2a's reuse audit for contract fields specifically — the reuse audit asks "is this duplicated"; the triangle check asks "is this synchronized."

A TRIANGLE FAIL is a hard block — silent declaration / enforcement / consumption divergence is exactly the bug class CLAUDE.md rule 18 exists to prevent.

---

## ALGORITHM

**Question answered:** "would a regulatory toxicologist agree the algorithm's output represents the data?"

CLAUDE.md rule 19 ("Algorithm defensibility on real data") is the authority. Read it verbatim for the rule statement and the SCIENCE-FLAG-clearing protocol; do not reproduce it here.

ALGORITHM is distinct from DATA. DATA asks "does the spec's claim match what the code produces"; ALGORITHM asks "does what the code produces match what the *data* warrants from a tox-reviewer's perspective". A spec can be wrong; a code can match the spec; an algorithm can still produce an indefensible answer.

### How to run

For each algorithm touched by the diff (or consumed by the diff's UI changes):

1. Identify the algorithm's input data shape and where representative data exists (`backend/generated/{study}/unified_findings.json`).
2. Run the algorithm against PointCross + at least one other representative study (Nimble, PDS, or another with the relevant domain populated).
3. Record the actual output: NOAEL value + tier, LOAEL dose level, score value + classification, syndrome detection result, severity assignment.
4. Answer in writing: **"Would a regulatory toxicologist agree this output represents the data?"** with a one-paragraph interpretation citing the actual pairwise/group values that drove the result.

### Forms that satisfy

- Python one-liner recorded in the review output, replicating the algorithm's logic against the JSON, with the printed output cited verbatim. See BUG-031 retrospective for a worked example.
- A new fixture-based test that runs the algorithm against real generated output and asserts the defensible result. Strongly preferred — it carries the check forward in CI.
- `/ops:explore-data` with the specific algorithm question.

### Forms that do NOT satisfy

- "The function passes its unit tests" — unit tests verify the function does what its mock inputs say it should do.
- "The build passes" / "lint passes" / "all 2051 tests pass" — none verify algorithmic defensibility.
- "The spec says this is the expected output" — the spec itself may be wrong (BUG-031: spec author treated the indefensible output as the desired outcome).
- "The change is downstream of the algorithm" — if the diff CONSUMES the algorithm's output, you still need to verify that the output is defensible. Shipping a UI that displays an indefensible NOAEL more consistently is worse than shipping inconsistent UIs that hide it.

### FAIL handling

ALGORITHM: FAIL is a hard block. The fix is to escalate (ESCALATION.md) and revert the consumer change — do NOT ship a UI that locks in the indefensible output. See BUG-031 for the canonical example.

A SCIENCE-FLAG raised by any review agent on algorithmic grounds clears only via the three paths in CLAUDE.md rule 19: (i) fix, (ii) data-grounded counter-evidence in the rule-19 format, (iii) explicit user defer with named dependency. Plumbing-only rebuttals do NOT clear it.

---

## Output format (used by `review.md` MECHANICAL CHECKS)

`review.md` appends one block per protocol to the MECHANICAL CHECKS section:

```
VISUAL: PASS — [view name(s)] render correctly, no console errors, [N] interactions verified
VISUAL: FAIL — [specific issue: console error in X / blank render / broken interaction]
VISUAL: SKIPPED — [reason: no frontend changes / Playwright unreachable after retry]

DATA: PASS — [N] empirical claims verified against generated JSON
  - "{exact spec quote}" -> observed {value}, cited {file:line or command}
  - ...
DATA: FAIL — [spec claim X] says {expected}, observed {actual} in {file}
DATA: SKIPPED — [reason: no empirical claims in spec / no generated JSON for verification]

TRIANGLE: PASS — [N] contract triangles touched, all three sites updated in this commit
  - {field}: declaration={file:line}, enforcement={file:line}, consumption={file:line list}
  - ...
TRIANGLE: FAIL — [field] modified at {site} but {other site(s)} still reference old vocabulary
TRIANGLE: SKIPPED — no contract surface modified

ALGORITHM: PASS — [N] algorithms verified defensible on representative data
  - {algorithm} on {study}: observed {output}, tox interpretation: "{one-paragraph rationale}"
  - ...
ALGORITHM: FAIL — {algorithm} on {study} produces {output}; tox-indefensible because {reason}. Escalating.
ALGORITHM: SKIPPED — no algorithmic code touched (no path match against .lattice/algorithm-paths.txt)
```

Include screenshot path(s) so the user can inspect the visual. Include the cited JSON path and observed values for DATA. **VISUAL FAIL does not auto-block. DATA FAIL, TRIANGLE FAIL, and ALGORITHM FAIL all auto-block.**
