---
name: lattice:extract-learnings
description: Extract durable knowledge from implemented specs into knowledge/ + architecture/ at archive. Enforces CLAUDE.md rule 7. Fires per spec-archive event (project-side hook), not per cycle-close.
---

# /lattice:extract-learnings

Formalizes CLAUDE.md rule 7 ("Doc lifecycle: specs are disposable, system docs are durable") as an enforceable skill rather than a convention.

**Canonical fire-time:** when a spec is moved from `{{lattice.project.specs.incoming}}/X.md` to `{{lattice.project.specs.archive}}/.../X.md`. That rename is the durable signal that the spec's implementation has landed and the spec is being retired. Earlier guidance (now removed) wired this skill into `/lattice:review` Step 5d as a per-cycle-close auto-invoke; that was the wrong granularity — most cycle-closes do not archive a spec, and many spec-archives happen outside a cycle (sweep, batch cleanup, manual archival). Per-archive triggering is the correct surface.

The failure mode this catches: a spec lands with novel domain facts, architectural patterns, or contract additions; the spec gets archived; the durable knowledge it surfaced never makes it into `knowledge/` or `architecture/`; the next spec author re-derives it from scratch (or worse, contradicts it). Conflated commits 1370c103 and 521f1d16 are the canonical cases — the conflated commit message didn't trigger anyone's "extract before archive" discipline, so the durable knowledge was lost in commit-laundry.

## Inputs

- `<spec-path>` — a path under `{{lattice.project.specs.incoming}}/` (the spec being closed out)
- OR `--commit <ref>` — a commit reference; the skill resolves the spec path from the commit's `Topic:` trailer or staged spec file
- OR `--sweep` — scan `{{lattice.project.specs.incoming}}/` for any spec older than 7 days that hasn't been archived; report unprocessed specs

## When invoked

- **Automatic (project-side hook):** a project's pre-commit (or post-commit) hook detects a spec-archive rename in the staged diff and invokes `/lattice:extract-learnings <archived-spec-path> --apply`. See "Wiring this into a project" below for the rename-detection regex and entry-point. This replaces the earlier `/lattice:review` Step 5d auto-invoke, which fired at the wrong granularity.
- **Manual:** after implementing a spec but before committing: `/lattice:extract-learnings {{lattice.project.specs.incoming}}/foo-spec.md`. Reviews and applies.
- **Sweep:** `/lattice:extract-learnings --sweep` scans for unprocessed specs (in `incoming/` >7 days, none with `[archived]` cross-reference). Useful at the end of a cycle to catch missed extractions.

## Step 1: Read the spec (or specs in --sweep mode)

Read the full spec body. Identify the sections that produced durable knowledge — content that **another spec would cite**, not content that's specific to this implementation pass.

## Step 2: Classify candidates by destination

For each durable item, classify by destination:

{{include:optional:project.skills.extract_learnings.routing_table}}

**Non-durable examples — DO NOT extract:**
- "We chose React Query over SWR for caching" (one-time tooling choice; no future spec will cite this)
- "Used `useEffect` cleanup pattern" (not novel; framework convention)
- "Handles the empty-array edge case in the renderer" (defensive code, not domain truth)
- Implementation timing notes ("phase 1 first because...")

## Step 3: For each candidate, locate-or-create destination

For each candidate identified in Step 2:

1. **Search the destination registry** for an existing entry that already covers this. If one exists, the spec must either (a) cite it (no extraction needed; the spec body is restating known truth, which is itself a defect under rule 19 if the spec restates rather than cites), or (b) extend it (provide diff to existing entry).
2. **If no existing entry**, prepare a new entry. Must include source attribution: `<spec-name> (<commit-sha>)`.
3. **For typed facts**, run `{{lattice.runtime.python}} {{lattice.project.scripts.audit_knowledge_graph}} --validate-new` against the proposed entry to verify schema compliance before staging.

## Step 4: Stage the extractions

Two modes:

- **Default (review mode):** Print the proposed extractions as a checklist. The user accepts or modifies before applying.
- **`--apply`:** Apply the extractions directly. Caller takes responsibility for the changes (typically used in `/lattice:review` cycle-close after the user has already approved the cycle).

Each applied extraction:
1. Edit the destination file with the new entry.
2. Append a `decisions.log` row: `<ts>\textract-learnings\tEXTRACTED\t<spec>\t<destination>\t<one-line summary>`.
3. Insert a back-reference into the spec body: `[Extracted to <destination>:<anchor>](relative-path)`.

## Step 4a: Hoist pending TODOs into spec frontmatter

**Purpose:** archive the spec's open work-record together with the spec itself, so the durable spec-archive carries its own pending-item list without depending on TODO.md to stay correctly cross-linked over time.

Read `{{lattice.project.backlog.todo}}` and identify entries that cite this spec. Match heuristics (run all three; union the hits):

1. **Filename cite:** grep for `<spec-basename>` (e.g. `radar-forest-cleanup-synthesis.md`) anywhere in TODO.md.
2. **Topic / GAP-ID cite:** read the spec's frontmatter `topic:` or `gap_id:` field (or the `# Title` slug if no frontmatter) and grep TODO.md for it.
3. **Spec-named GAP namespace:** if the spec defines its own GAP namespace (e.g. `GAP-RFC-*` for radar-forest-cleanup), grep for `^### (DATA-GAP-RFC|GAP-RFC)` heading lines.

For each open item discovered, extract:
- `id` — the entry's identifier (e.g. `DATA-GAP-RFC-1`, `GAP-FRS-2`).
- `title` — the entry's heading text after the colon, before the `[Area: ...]` bracket.
- `todo_line` — the line number in TODO.md where the entry's heading lives.
- `area` — the bracketed area tags (`[Area: Engine, Documentation]` → `[Engine, Documentation]`).
- `autopilot` — if the entry has an `autopilot:` field, copy its value (`ready`, `needs-user`, etc.). Omit if absent.

Skip entries that are already marked resolved (strikethrough `~~`, status line "RESOLVED", or have a commit-hash close-out).

**Write the result** as YAML frontmatter at the top of the spec. If the spec already has frontmatter, merge into it; otherwise prepend a new block. Schema:

```yaml
---
status: archived
archived_date: <YYYY-MM-DD>
shipped_commits:
  - <hash>  # optional one-line note
pending_todos:
  - id: <ID>
    title: "<heading text>"
    todo_line: <N>
    area: [<tags>]
    autopilot: <ready|needs-user>  # omit if absent in TODO.md
---
```

**Why this lives at archive-time (not earlier):** while the spec is in `incoming/`, TODO.md is the authoritative cross-link. Once the spec leaves `incoming/`, that cross-link silently rots (next sweeper / archiver loses the connection). The hoist captures the open work-record into the spec body itself, so the archived spec is self-contained: a reader of the archive can see what's still open without re-discovering the TODO.md citations.

**If no pending items are found,** add `pending_todos: []` explicitly (not omit) so the absence is recorded as a deliberate finding rather than missing data.

**Exemplar (from pcc 2026-05-11 mass-cleanup):** the radar-forest-cleanup-synthesis archival hoisted 6 RFC-namespaced TODOs into frontmatter; findings-default-rail-selection hoisted 4 FRS-namespaced TODOs. In both cases, the items had been silently invisible from the archived spec until this step was added.

## Step 5: Archive the spec

Move the spec from `{{lattice.project.specs.incoming}}/` to `{{lattice.project.specs.archive}}/<year>-<month>/<spec-name>.md`. The archived copy:
- Keeps the back-references inserted in Step 4
- Keeps the `pending_todos:` frontmatter from Step 4a
- Adds a header note: `**Archived <date>**. Durable knowledge extracted: <list of destinations>. Implementation commit: <sha>.`

If the spec has no extractable durable knowledge (rare — usually means the spec was implementation-detail-heavy or trivial), record this explicitly: `Archived <date>. No durable knowledge extracted (rationale: <one line>).` and skip Step 4. The rationale is required so future audits can distinguish "no knowledge to extract" from "extraction was forgotten." **Step 4a still runs** — the absence of durable knowledge does not imply absence of pending TODOs.

## Step 6: Update the architecture spec if applicable

Per CLAUDE.md rule 6: "Architecture specs must be updated when their subsystem ships changes — create if missing."

If the spec's implementation modifies a subsystem that has an architecture spec at `{{lattice.project.docs.architecture_dir}}/<subsystem>.md`:
- Update "Last validated" date to today.
- Add a row to the change-log section noting the spec name + commit + summary.
- If the implementation introduced a new sub-component or invariant, update the relevant section.

If the subsystem has NO architecture spec, evaluate whether one is warranted (multi-file subsystem, multiple consumers, complex internal logic). If yes, propose creating one — do not auto-create without user approval (CLAUDE.md rule 8 / no directory sprawl applies).

## Step 7: Persist the findings

After all extractions are applied (or staged for review):

1. **`decisions.log`** — append one summary row: `<ts>\textract-learnings\tCYCLE-CLOSE\t<spec>\t<N-extractions>\t<destinations-joined-with-commas>`.
2. **Commit message footer (if invoked from /lattice:review):** add a `Knowledge:` trailer listing the destinations:
   ```
   Knowledge:
   - knowledge-graph.md: 2 typed facts (HCD-FACT-N, NOAEL-FACT-M)
   - architecture/scoring-engine.md: change-log row + rule-22 fact promotion
   ```
3. **Output summary** to stdout: `Extracted N items to M destinations. Archived <spec>. See decisions.log for details.`

## What this skill does NOT do

- **Does not invent durable knowledge from thin spec content.** If a spec doesn't surface novel domain truth, the skill records that and archives without extraction. Forcing extraction from spec-implementation-detail content is exactly the failure mode "rule 19 prose in two un-typed registries" guards against.
- **Does not modify code.** Only `{{lattice.project.docs.internal_root}}/` and decisions.log are touched.
- **Does not propose new architecture-spec creation without user approval.** Bound by CLAUDE.md rule 1 (design-system) and rule 8 (no directory sprawl).
- **Does not run during `/lattice:spike`.** Spikes intentionally skip the doc lifecycle (per `commands/lattice/spike.md`); their learnings are extracted via `/lattice:spec-from-code` followed by a normal cycle close, not via this skill.

## Wiring this into a project

This skill fires per spec-archive event. Each project (e.g. `pcc`) wires the trigger into its own pre-commit (or post-commit) hook, since the archive directory layout and hook entry-point are project-specific. The lattice repo itself does not host the hook.

### Rename-detection regex

The trigger is the rename of an `incoming/*.md` spec into `incoming/archive/`. Detect it in a hook by inspecting the staged diff for `R`-status (rename) entries:

```bash
git diff --cached --name-status | awk '
  $1 ~ /^R/ \
  && $2 ~ /(^|\/)docs\/_internal\/incoming\/[^/]+\.md$/ \
  && $3 ~ /(^|\/)docs\/_internal\/incoming\/archive\//   {print $3}'
```

The output is a list of archived-spec paths (the destinations). For each one, the hook invokes:

```
/lattice:extract-learnings <archived-spec-path> --apply
```

Notes on the regex:

- Source must match `{{lattice.project.specs.incoming}}/<basename>.md` (one path segment after `incoming/`, no further nesting). This avoids re-firing on already-archived specs that are reorganized within `incoming/archive/`.
- Destination must contain `{{lattice.project.specs.archive}}/` (further nesting under `archive/<year>-<month>/` is allowed and expected).
- Both anchors use `(^|\/)` to handle relative-path emissions from `git diff` (some hook environments run from a sub-directory).

### Recommended hook placement

The project's **pre-commit** hook is the natural invocation point — it runs while the working tree still contains the unstaged side of any in-flight edits, and the rename is already in the staged set by the time the hook fires. If the project prefers post-commit (e.g., to avoid blocking the commit on extraction failures), the same regex applies; the trade-off is that a failed extraction won't block the commit, only flag it for follow-up.

Either way, the hook should:

1. Run the regex above against the staged (or just-committed) diff.
2. For each archived-spec path, invoke `/lattice:extract-learnings <path> --apply`.
3. If the skill exits non-zero, surface the failure but do not retry — re-running the skill on an already-extracted spec is idempotent only after the spec body has been edited to carry the back-references, so a second auto-invoke can corrupt state.

### Defect / override behavior

If the skill produces no extractions AND the spec has no `Archived <date>. No durable knowledge extracted` rationale, this is a defect: the spec author either missed extractable knowledge or didn't author the rationale. The hook should surface this loudly so the user can either (a) re-run with the spec author identifying extractable items, (b) author the explicit "no durable knowledge extracted because <reason>" rationale in the spec head, or (c) accept the defect with `--skip-extract-learnings` (logged to `decisions.log` so periodic sweeps can audit).

## Failure modes prevented

- **The conflation case (1370c103, 521f1d16):** spec extraction was bundled into a conflated commit; the commit message didn't mention the spec, so no agent invoked the extract step. With this skill auto-running at /lattice:review Step 5d, the cycle close cannot proceed without either (a) extractions logged or (b) explicit "no extraction needed" rationale logged.
- **Restated-value drift (rule 19 sibling):** when an implementation introduces a numeric threshold, this skill catches it at extraction time and forces it to land in the typed graph rather than just in the spec body. Architects + peer-review check the placement on incoming specs (rule 19); this skill closes the loop on outgoing specs.
- **Architecture-spec rot:** the explicit Step 6 update prevents the case where a subsystem ships changes but its architecture spec stays at last-quarter's snapshot.
- **Pending-TODO cross-link rot (Step 4a addition, pcc 2026-05-11):** before this step existed, archived specs lost their connection to TODO.md silently — open items remained in TODO.md, but readers of the archived spec had no way to discover them without re-grepping. The hoist makes the archived spec self-contained: a reader can see what's still open from the spec body alone. Caught during the pcc mass-cleanup of 75 incoming specs (commit pending) where 6 RFC-namespaced + 4 FRS-namespaced TODOs would have become orphaned cross-references on archive.
