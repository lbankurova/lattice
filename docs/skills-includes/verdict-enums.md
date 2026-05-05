# Verdict Enum Registry (canonical enums)

> **Not a skill.** Sited under `docs/skills-includes/` so it is not auto-discovered as a skill. Cited from `commands/lattice/{architect,peer-review,probe,review}.md` and `agents/{architect-reviewer,decision-auditor,peer-review}.md` to consolidate verdict declarations that previously lived in 7 different prose forms.
>
> **Authoritative statement** of every gate-producing skill's verdict set. Workflow YAMLs that test `{{nodes.<id>.output.verdict}} == 'X'` are checked at workflow-load time against the producing node's declared `verdict_enum`. A typo'd verdict (`'PSS'` for `'PASS'`) is rejected by the loader.
>
> **Single source of truth.** The structured data lives in [`workflows/verdict-enums.yaml`](../../workflows/verdict-enums.yaml) and is loaded by `executor/src/loader.ts`. This file is the prose form; the YAML is the data form. The two must agree — if they drift, the audit at the bottom of this file describes how to detect and resolve.

---

## Why a registry

Three failure modes the registry addresses:

1. **Typo'd verdicts in YAML conditions silently fail.** Pre-registry, `{{nodes.peer-review-r2.output.verdict}} == 'SUOND'` parsed as a valid expression that simply matched zero outputs — the workflow then took the `default` route. With the registry, `loader.ts` rejects unknown literals at validate time.
2. **Skill prompts and YAML conditions drift.** Pre-registry, architect.md, autopilot.md, and architect-reviewer.md each declared the architect verdict set in prose form. A change to one didn't propagate.
3. **Mixed `==` vs `.contains()` semantics on the same enum.** Pre-registry, blueprint-cycle.yaml mixed both forms (`{{...verdict}} == 'PASS'` and `{{...output}}.contains('SECOND_GATE_VERDICT=SCIENCE-FLAG')`), with no central place enumerating the legal values per producing node.

---

## Enum sets

Every enum's source is the skill or agent that **produces** the verdict. Skills that consume a verdict (e.g., review.md consuming peer-review's verdict) cite the registry rather than redeclare.

### `architect`

Members: **`PASS` · `SIMPLIFY` · `REJECT` · `SCIENCE-FLAG`**

Produced by: `agents/architect-reviewer.md` (gate / plan mode), invoked from `commands/lattice/architect.md` Step 3.

| Verdict | Meaning |
|---|---|
| `PASS` | Plan is appropriately complex. Proceed to peer review. |
| `SIMPLIFY` | Plan has accidental complexity. Auto-apply Risk: None cuts; re-gate. |
| `REJECT` | Plan is fundamentally overengineered. Escalate with alternative. |
| `SCIENCE-FLAG` | Simplification would change analytical behavior. Resolve via [SCIENCE-FLAG protocol](science-flag-protocol.md). |

The architect agent's *audit-mode* per-hotspot classification (`ACCIDENTAL` / `ESSENTIAL` / `MIXED`) is a finding inside the audit, not a gate verdict, and is not in this enum.

### `peer-review`

Members: **`SOUND` · `CONDITIONAL` · `FLAWED` · `INSUFFICIENT`**

Produced by: `commands/lattice/peer-review.md`, invoked from research-cycle (`peer-review-r1`, `peer-review-r2`), blueprint-cycle (`plan-review-r1`, `plan-review-r2`), and review (Agent D path).

| Verdict | Meaning |
|---|---|
| `SOUND` | Parent gate proceeds. Verdict logged. |
| `CONDITIONAL` | Blocks the parent gate; "what would fix it" must be addressed. |
| `FLAWED` | Blocks unconditionally. Fix the algorithmic defect and re-launch. |
| `INSUFFICIENT` | Blocks. Provide the requested information and re-launch. |

For algorithmic peer-review specifically, all three blocking verdicts (`CONDITIONAL` / `FLAWED` / `INSUFFICIENT`) hard-block; cap at 2 re-launches.

### `peer-review-map`

Members: **`SOUND` · `CONDITIONAL` · `FLAWED`**

Produced by: `commands/lattice/peer-review.md` knowledge-map review mode.

`INSUFFICIENT` is not a valid map verdict — the map is fully present (or expanded) or it isn't. Listed separately so the loader doesn't accept `'INSUFFICIENT'` against a map review.

### `probe`

Members: **`SAFE` · `PROPAGATES` · `BREAKS` · `SCIENCE-FLAG` · `STALE` · `RECONSIDER-SURFACE`**

Produced by: `commands/lattice/probe.md` per-implication classification, with the **highest severity** surfacing as the prose-output verdict.

| Verdict | Meaning |
|---|---|
| `SAFE` | Change doesn't affect the consumer. |
| `PROPAGATES` | Consumer's input changes; consumer handles it. |
| `BREAKS` | Consumer's input changes in an unhandled way. |
| `SCIENCE-FLAG` | Change alters analytical output. Clear via [SCIENCE-FLAG protocol](science-flag-protocol.md). |
| `STALE` | Manifest connection no longer exists in code. |
| `RECONSIDER-SURFACE` | UI surface is orphaned or repurposed by the change. |

### `probe-structured`

Members: **`SAFE` · `PROPAGATES` · `BREAKS` · `SCIENCE_FLAG`**

The YAML-friendly form persisted to `.lattice/cycle-state/<topic>.yaml` under `probe_outcome.verdict`. Note `SCIENCE_FLAG` (underscore) vs `SCIENCE-FLAG` (hyphen, prose form). The two are deliberately distinct — coherence engine reads the structured form, gate conditions in workflow YAMLs read the prose form.

When a workflow gate tests `{{nodes.probe.output.verdict}}`, it is reading the prose form (the `probe` enum). When a hook script greps `probe_outcome.verdict` from cycle-state, it is reading the structured form.

### `decision-auditor`

Members: **`PASS` · `FAIL`**

Produced by: `agents/decision-auditor.md` summary verdict.

The agent emits **per-finding** classifications (MERIT-SOUND / EFFORT-BIASED / VALID-DEFERRAL / UNPROMPTED-DEFERRAL / SILENT-DROP) inside the audit body. These are findings, not gate verdicts; they reach the parent gate via boolean fields (`has_unprompted_deferral`, `has_silent_drop`, `has_effort_biased`), not verdict-string equality. Only the overall PASS/FAIL is in this enum.

### `review`

Members: **`PASS` · `FAIL`**

Produced by: `commands/lattice/review.md` final VERDICT section.

A SCIENCE-FLAG raised inside review escalates via the `has_science_flag` boolean field rather than a string verdict — see `bug-fix-cycle.yaml:478` and `build-cycle.yaml`'s SCIENCE-FLAG resolver wiring (D1).

### `ops-check`

Members: **`PASS` · `FAIL`**

Produced by: `commands/ops/check.md` (in consumer projects). Surfaced in the workflow output as the literal final non-empty line `OPS_CHECK_VERDICT: <value>`. Workflows match the full prefix string to avoid partial-fail reports leaking through (see `workflows/mechanical-fix-cycle.yaml:120-127`).

---

## How `loader.ts` uses the registry

A gate node that depends on another node's verdict declares the producing node's enum:

```yaml
nodes:
  peer-review-r2:
    type: skill
    skill: lattice/peer-review
    verdict_enum: peer-review        # ← declares which enum this node produces
    # ...

  evaluate:
    type: gate
    depends_on: [peer-review-r2]
    evaluate:
      - condition: "{{nodes.peer-review-r2.output.verdict}} == 'SOUND'"
        route: distill
      # ↑ loader checks: 'SOUND' ∈ enums.peer-review.members? Yes → ok
      - condition: "{{nodes.peer-review-r2.output.verdict}} == 'SUOND'"
        route: bikeshed
      # ↑ loader rejects: 'SUOND' ∉ enums.peer-review.members → WorkflowLoadError
```

When the producing node has no `verdict_enum`, the loader skips the check on its references (silent-allow, opt-in semantics — pre-existing workflows with no annotations remain valid). New nodes that produce verdicts SHOULD declare `verdict_enum`.

The check fires for these condition forms:

| Form | Example |
|---|---|
| Equality | `{{nodes.X.output.verdict}} == 'PASS'` |
| Inequality | `{{nodes.X.output.verdict}} != 'FAIL'` |
| Substring (deprecated for verdict — use equality) | `{{nodes.X.output}}.contains('SECOND_GATE_VERDICT=PASS')` |

The substring form is harder to validate (the literal `'SECOND_GATE_VERDICT=PASS'` includes a prefix), so the loader matches it on a best-effort basis: it strips known prefixes (`SECOND_GATE_VERDICT=`, `MEMO_VERDICT=`, `OPS_CHECK_VERDICT: `, `ARBITER_VERDICT=`) and checks the suffix.

---

## Drift detection

The two files (`verdict-enums.yaml` data + this prose) must stay in sync. Run `node executor/dist/cli.js validate workflows/*.yaml` after any change to either; the loader's check will surface mismatches between declared `verdict_enum` and tested literals.

When you add a new enum:

1. Add the enum members to `workflows/verdict-enums.yaml`.
2. Add a section to this file describing the enum and its source skill.
3. Annotate the producing node in its workflow YAML with `verdict_enum: <name>`.
4. `node executor/dist/cli.js validate` passes.

When you remove an enum member (or rename a verdict):

1. Update the producing skill's prose to use the new value.
2. Update `workflows/verdict-enums.yaml`.
3. `grep -rn "'<old-value>'" workflows/` finds every gate condition that needs updating.
4. `node executor/dist/cli.js validate` passes.

---

## Cross-references

- [`workflows/verdict-enums.yaml`](../../workflows/verdict-enums.yaml) — structured data
- [`workflows/schema.md`](../../workflows/schema.md) — workflow schema
- [`science-flag-protocol.md`](science-flag-protocol.md) — companion include for SCIENCE-FLAG resolution
- `executor/src/loader.ts` — the validate-time enforcement
