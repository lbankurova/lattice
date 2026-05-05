# Topic Lock Protocol (canonical)

> **Not a skill.** Sited under `docs/skills-includes/` so it is not auto-discovered as a skill. Cited from `commands/lattice/{research-cycle,blueprint-cycle,build-cycle}.md` to consolidate the acquire/release/heartbeat boilerplate that was previously triplicated across cycle skills.
>
> **Authoritative statement** of when and how cycle skills hold the WIP lock for a topic. Cycle skills cite this file rather than redeclare the protocol; cycle-specific values (cycle name, release-step) are passed as parameters.

---

## Why topic locks

Two cycle skills running on the same topic concurrently corrupt each other's `.lattice/cycle-state/{topic}.yaml` and race on the same `incoming/{topic}-synthesis.md`. The topic-lock primitive serializes cycle-skill execution per topic. Cross-topic concurrency is unaffected — the lock is *topic-scoped*, not framework-wide.

The lock is a directory at `.lattice/cycle-lock/{topic}/` with metadata identifying the holder (PID, agent name, acquire timestamp). Liveness is enforced by the acquire script (PID + wall-clock heuristics) — see `scripts/acquire-topic-lock.sh` for current implementation.

## Acquire — at the start of every cycle skill

Before doing any work in a cycle skill, acquire the lock:

```bash
bash scripts/acquire-topic-lock.sh {topic} "{cycle-name}"
```

- `{topic}`: the cycle's topic identifier.
- `{cycle-name}`: the cycle skill's name (e.g., `research-cycle`, `blueprint-cycle`, `build-cycle`). Logged into the lock metadata so a contention error tells the user *which* cycle holds the lock.

**On exit code 1** (lock held by another agent), **STOP immediately**. Show the lock holder info from the script's stderr to the user. Do not proceed. Re-acquisition is the user's call — typical flows are (a) wait for the other cycle to finish, (b) verify the holder is dead and force-clear via `bash scripts/release-topic-lock.sh {topic}`, or (c) abandon the new invocation.

### Path-based entry (no explicit topic)

Cycle skills that accept a spec path instead of a topic (e.g., `build-cycle docs/_internal/incoming/{spec}.md`) derive the topic from the spec filename — strip the conventional suffix (`-synthesis.md` for blueprint output, `.md` for direct specs) — and lock that derived topic. This keeps path-based and topic-based entries on the same lock, preventing two agents from running on the same logical work via different entry points.

## Release — at cycle completion

Release the lock at the documented end-of-cycle step (varies per cycle skill — see the citing skill for the specific release-step):

```bash
bash scripts/release-topic-lock.sh {topic}
```

Releasing is mandatory on success. On failure / abort mid-cycle, the lock remains held; the next acquire either succeeds because the prior process is dead (PID liveness check) or fails with a clear contention message that the user resolves.

## Heartbeat — after every state-file update

Long-running cycles (especially research with multi-round peer review) can exceed the stale-detection threshold. Refresh the lock metadata's mtime after every state-file write:

```bash
touch .lattice/cycle-lock/{topic}/meta 2>/dev/null
```

Trigger this on every `current_step` change in `.lattice/cycle-state/{topic}.yaml`. The `2>/dev/null` swallows the error if the lock dir is gone (already-released or force-cleared by another agent — both should already have triggered a hard stop earlier; the touch is a no-op safety net).

## What this protocol does NOT cover

- **Concurrent writes to shared files** (TODO.md, ROADMAP.md, decisions.log) — that is `merge-shared-state.sh` running in pre-commit, not the cycle lock.
- **Build-time / commit-time concurrency** — that is `commit.lock` in pre-commit Step -1, not the cycle lock.
- **State-file revision races** — that is the [revision-checked writes protocol](revision-checked-writes.md), which is independent of (but composes with) the topic lock.

## Anti-patterns

1. **Acquiring without releasing on early-return paths.** Cycle skills with multiple exit branches (architect REJECT, peer-review FLAWED persisting, user STOP) must release the lock before exiting. Treat the release as a `finally`-style obligation.
2. **Skipping the heartbeat in long phases.** A research cycle that spends 30+ minutes in peer-review without touching state files can be force-cleared by stale detection. Refresh on every step transition, not only on terminal state changes.
3. **Forging a different topic name to avoid contention.** If the lock is held by a parallel session that is genuinely active, do not rename the topic to slip past the gate. Either wait or coordinate with the user.

## Cross-references

- `scripts/acquire-topic-lock.sh` — acquire implementation (PID + wall-clock liveness).
- `scripts/release-topic-lock.sh` — release implementation.
- `commands/lattice/research-cycle.md`, `blueprint-cycle.md`, `build-cycle.md` — citing skills. (`commands/lattice/cycle.md` Step 0b also acquires the lock; the meta-orchestrator's brief reference need not cite this include since it does not duplicate the full protocol.)
- [revision-checked writes protocol](revision-checked-writes.md) — composes with topic lock for state-file safety.
