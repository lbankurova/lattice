# Revision-Checked Writes Protocol (canonical)

> **Not a skill.** Sited under `docs/skills-includes/` so it is not auto-discovered as a skill. Cited from `commands/lattice/{research-cycle,blueprint-cycle,build-cycle}.md` to consolidate the read-modify-write protocol that was previously triplicated across cycle skills.
>
> **Authoritative statement** of how cycle skills mutate `.lattice/cycle-state/{topic}.yaml` (and any other revision-tracked YAML in `.lattice/`). Skills cite this file rather than redeclare; the topic-lock protocol is independent and complementary — see [topic-lock](topic-lock.md).

---

## Why this protocol

The topic lock serializes cycle skills, but a cycle skill can spawn subagents (peer-reviewer, architect, decision-auditor, post-impl-reviewer) that write back to `.lattice/` while the parent is still running. Without an in-file revision check, two writes can interleave:

```
A reads state.yaml @ revision: 3
B reads state.yaml @ revision: 3
A writes revision: 4 (with A's deltas)
B writes revision: 4 (with B's deltas — A's changes lost)
```

Atomic rename (`atomicWriteFileSync`) prevents *partial* writes but does NOT prevent this *interleaved* lost-update. The revision check makes the read-write a compare-and-swap.

## The 5-step protocol

Every state-file mutation follows these steps:

1. **Read** the state file. Note the `revision` value (e.g., `revision: 3`).
2. **Do the work** for the step (this can be arbitrarily long — minutes for peer review, hours for human-in-the-loop pauses).
3. **Re-read** the state file immediately before writing. Compare the just-read `revision` against the value noted in step 1.
4. **If the revision matches**, write the update with `revision: N+1` (increment by exactly 1). The new file is atomically renamed into place (handled by `state-io.ts`).
5. **If the revision does NOT match**, another agent modified the file while we were working. **STOP.** Report the conflict:

   > "State file modified by another agent (expected revision {N}, found {M}). Aborting to prevent data loss."

   Do not retry blindly — the divergence is informative. Surface to the user; the resolution is contextual (re-run the step against the new state, abandon, or merge manually).

## Initialization

On **new state file creation**, set `revision: 1`. Every subsequent write increments unconditionally — there are no skipped revisions, no resets.

## What changes the revision

Any mutation of the state file under `.lattice/cycle-state/{topic}.yaml` — including:

- `current_step` advancement.
- New checkpoint append.
- `science_flags:` list mutation.
- `phase` transition.
- Any other field write.

Read-only operations (re-read for context discipline, decisions-log append) do NOT change the revision — they don't write the state file at all.

## Composes with the topic lock

The topic lock prevents two *cycle skills* from running concurrently on the same topic. Revision-checked writes prevent two *agents within the same cycle* (parent + subagent) from racing on state. Both are required:

- Lock held + no revision check → parent and subagent race within the same cycle.
- Revision check + no lock held → two cycles overlap and corrupt each other's checkpoints.

## What does NOT need revision checking

- **Append-only logs** (`decisions.log`) — appends are idempotent under concurrent writers when each writer flushes a complete record. The newline-delimited format tolerates interleaving.
- **Generated artifacts** (`peer-reviews/{topic}-*.md`, `incoming/{topic}-synthesis.md`) — these are owned by a single step at a time; if two steps are writing the same artifact concurrently, the topic lock or step routing has a bug deeper than what revision checking fixes.

## Anti-patterns

1. **Skipping the re-read in step 3.** Reading once, working, writing without re-reading defeats the purpose. The window between the initial read and the write is exactly when another agent can interleave.
2. **Catching the mismatch and retrying silently.** Auto-retry on revision mismatch is tempting but loses the information that *something else changed*. Surface the conflict; the user (or orchestrator) decides.
3. **Skipping increments on no-op writes.** "I didn't change anything meaningful" is not a reason to keep the same revision — the file timestamp moved, downstream readers will re-read, and revisions must be a strictly-increasing sequence to be useful as a CAS token.
4. **Initializing at `revision: 0`.** The protocol counts from 1; a 0 value means "never written" and the read step in 1 returns it as a fresh state, not a concurrent-write check.

## Cross-references

- `executor/src/state-io.ts` — `atomicWriteFileSync` (the rename-as-CAS implementation).
- `executor/src/engine.ts` — `writeCheckpoint` (consumer of this protocol from the executor side).
- [topic-lock protocol](topic-lock.md) — composes with this one for full state safety.
- `commands/lattice/research-cycle.md`, `blueprint-cycle.md`, `build-cycle.md` — citing skills.
