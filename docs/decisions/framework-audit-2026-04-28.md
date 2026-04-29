# Lattice Framework Audit — 2026-04-28

**Trigger:** User reported subjective regression — "longer cycles, worse reasoning" — without being able to pinpoint the cause.
**Method:** Three parallel audits — review.md skill bloat, executor TS correctness, workflow DAG complexity.
**Outcome:** 18 findings across 3 dimensions; one CRITICAL bug in `engine.ts` plausibly accounts for the bulk of the felt regression.

---

## Headline finding

**`engine.ts:486-498` `getCompletedCheckpoints` reads only the `current_step` field** — but `writeCheckpoint` (line 528-534) writes a full `data['checkpoints']` map of every completed `state_key`. Effect: **every workflow resume re-executes every completed skill except one.** Research / synthesis / peer-review re-run with no memory of prior conclusions. Single-line fix; explains the user's "longer cycles, worse reasoning" complaint by itself.

Three other bugs likely contribute materially:

- **`shellQuote` uses bash-specific `$'...'` syntax** (`auto-resolve.ts:420`, `nodes.ts:434`) — corrupts skill prompts on Windows when Claude CLI doesn't run through bash. Skill prompts arriving mangled = worse reasoning.
- **WIP commits use `--no-verify`** (`engine.ts:617`) — autopilot bypasses every framework gate (commit-intent Step -0.5, F3/F6 attestations, BUG-SWEEP retro, doc regen) when 15+ files accumulate. Defeats the very gates the framework is supposed to enforce.
- **Coherence regex `/S(\d{2})/g` is unanchored** (`coherence.ts:106`) — matches "S07" inside file paths, prose, IDs. Inflates subsystem-overlap blockers; coherence conflicts fire on benign topic states.

---

## Tier-1 — CRITICAL or HIGH-LEVERAGE bug fixes

| # | File | Bug | Fix |
|---|---|---|---|
| 1 | `executor/src/engine.ts:486-498` | `getCompletedCheckpoints` reads only `current_step`; ignores `data['checkpoints']` map | Iterate `data['checkpoints']` keys |
| 2 | `executor/src/engine.ts:452-460` | `resolveStatePath` returns un-substituted `{{...}}` filename when input keys missing → corrupts portfolio state | Detect unresolved `{{...}}`, return `null`, error |
| 9 | `executor/src/engine.ts:617` | WIP commits use `--no-verify`, bypassing every framework gate | Remove the flag; WIP commits go through hooks like any other |
| 10 | `executor/src/auto-resolve.ts:420-422`, `executor/src/nodes.ts:434-437` | `$'...'` quoting corrupts prompts on Windows | Replace with portable quoting (single-quote escape via doubling, or Node's `util.parseArgs` / `child_process` array-form) |
| 7 | `executor/src/coherence.ts:106, 471-479` | Unanchored regex `/S(\d{2})/g` over-counts subsystems | Anchor with word boundaries `/\bS(\d{2})\b/g` |

---

## Tier-2 — SHOULD-FIX structural improvements

| # | Target | Issue | Action |
|---|---|---|---|
| R-1 | `commands/lattice/review.md` (636 lines) | CLAUDE.md rules 18 + 19 reproduced wholesale (~250 lines of duplicated authority); STOP table 14 rows mostly identical; numbering gaps (no Step 0.5, no Step 6) | Split: keep ~250-line core (mandatory output sections + four-dim trace + commit gate); extract VISUAL/DATA/TRIANGLE/ALGORITHM protocols into a sibling skill; replace rule-18/19 reproductions with pointers |
| R-2 | `commands/lattice/review.md` Step 5d | Auto-invokes `/lattice:extract-learnings` per cycle-close; wrong granularity — should fire per spec-archive | Remove Step 5d; add archive-move trigger (hook on `incoming/*.md → archive/*.md` rename, similar to BUG-SWEEP retro enforcement) |
| W-1 | `workflows/blueprint-cycle.yaml`, `research-cycle.yaml`, `bug-fix-cycle.yaml` | Science-memo protocol (~150 lines) duplicated 3 times | Extract to `workflows/_includes/science-flag-resolution.yaml` |
| W-2 | `workflows/bug-fix-cycle.yaml` | Cosmetic bugs traverse 11+ nodes including 636-line review skill | Severity-aware review skip: `cosmetic` routes directly `update-artifacts → commit`; full review retained for `silent-wrong-answer` / `misleading-display` |

---

## Tier-3 — NICE-TO-HAVE (deferred this pass)

| # | File | Issue |
|---|---|---|
| T-1 | `executor/src/coherence.ts:603-641` | YAML round-trip + regex extraction; should be typed traversal |
| T-2 | `executor/src/autopilot.ts:186, 197, 299` | `loadPortfolioState` runs 3× per loop iteration; cache and invalidate on state mutation |
| T-3 | `executor/src/nodes.ts:404-406` | Silent skill-failure absorption — text fallback hides catastrophic Claude CLI errors |
| T-4 | `executor/src/nodes.ts:308-315` | `evaluateCondition` `&&`/`||` precedence wrong; splits inside string literals |
| T-5 | `executor/src/reconcile.ts:79` | Hard-coded `since 2026-01-01` re-scans all commits per loop |
| T-6 | `executor/src/auto-resolve.ts:265, 74` | Sequential 5-min Claude CLI calls bypass context-rot telemetry |
| T-7 | `executor/src/engine.ts:154-168` | `dryRun` synthetic results pollute coherence with literal "(dry run)" strings |
| T-8 | `executor/src/e2e.ts:134-164` | Dead `matchGlob` branch (delegated to `matchGlobSimple` always) |
| T-9 | `executor/src/cli.ts:75-86` | Custom argument parser; replace with `node:util.parseArgs` |
| T-10 | F8 audit wired-into detection | Says `agents:decision-auditor` and `agents:post-impl-reviewer` are unwired with 0 invocations, but they're invoked from skill prompts; the audit doesn't see Agent-tool invocation. Re-evaluate detection logic. |

---

## Tier-1+2 implementation plan (this session)

Five parallel agents:

- **A** — `engine.ts` (3 fixes: #1 resume, #2 state-path, #9 WIP `--no-verify`)
- **B** — Windows quoting (`auto-resolve.ts` + `nodes.ts`, fix #10)
- **C** — `coherence.ts` regex anchor (fix #7)
- **D** — `review.md` restructure (split + remove Step 5d) + add archive-move trigger for extract-learnings
- **E** — Workflow consolidation: extract `_includes/science-flag-resolution.yaml`, add severity-aware skip in `bug-fix-cycle.yaml`

No file conflicts between agents. Tier 3 deferred to a follow-up session with explicit scope.

---

## Cross-references

- Background: user noted subjective regression in cycle length and reasoning quality during this session (2026-04-28).
- Audits run as parallel `general-purpose` sub-agents; full transcripts in this session.
- Prior decision deferring `review.md` split: `pcc/.lattice/decisions.log` 2026-04-28T19:46:12Z (`arch-decision DEFER review.md-split`). Reversed by this audit on merit grounds — the defer cited "no agent has reported friction navigating the file" but the user is now reporting precisely that.
- Bug retros land per CLAUDE.md rule 20 in BUG-SWEEP.md when fixes ship.
