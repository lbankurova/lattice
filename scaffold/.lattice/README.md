# .lattice/ — Framework State Directory

This directory holds persistent state that agents read at session start and append to during work. It is the mechanical memory of the development process — preventing re-tried failures, tracking validation drift, and recording decisions.

## Files

### decisions.log

**The experiment log.** TSV format, append-only. Every skill appends after producing output.

```
TIMESTAMP	SKILL	OUTCOME	CONTEXT	METRICS	NOTES
```

Fields:
- **TIMESTAMP** — ISO 8601
- **SKILL** — which skill produced this entry (research, peer-review, synthesize, implement, review, probe, validation-ratchet)
- **OUTCOME** — skill-specific: VALIDATED/FLAWED/CONDITIONAL/SOUND/IMPROVED/DEGRADED/COMPLETED/BLOCKED
- **CONTEXT** — topic, branch, file, or commit range
- **METRICS** — quantitative data (validation scores, finding counts, signal deltas)
- **NOTES** — free text: what was tried, what was learned, what failed

**Rules:**
- Append-only. Never edit or delete entries.
- Every skill invocation MUST append at least one entry on completion.
- Agents read this log at session start (via `/lattice:resume-work` or first skill invocation).
- When the log exceeds 200 entries, archive older entries to `decisions-archive-{date}.log`.

**What it prevents:**
- Re-trying approaches that already failed (agent reads "tried X, outcome: FLAWED" and skips)
- Losing decisions across sessions (the human said "accept finding 2, reject 3" — it's logged)
- Validation drift going unnoticed (every ratchet comparison is logged)

### validation-baseline.json

**The validation oracle baseline.** JSON snapshot of validation scores at a known-good state. Created by `scripts/validation-ratchet.sh baseline`, updated automatically when scores improve.

### cycle-state/{topic}.yaml (optional)

**Per-topic research cycle state.** Created by `/lattice:research-cycle` to track which steps have completed and what decisions were made. Prevents skipping steps across sessions.

```yaml
topic: organ-weight-normalization
started: 2026-03-15T10:00:00
current_step: 7.8
completed:
  1_research: {file: research/organ-weight-normalization.md, date: 2026-03-15}
  2_peer_review_r1: {file: peer-reviews/organ-weight-normalization-review.md, date: 2026-03-15}
  3_incorporate: {date: 2026-03-15, accepted: [1,2,4], rejected: [3]}
  4_peer_review_r2: {file: peer-reviews/organ-weight-normalization-review-r2.md, date: 2026-03-15}
  5_evaluate: {outcome: SOUND}
  6.5_probe: {outcome: SAFE, blast_radius: [S02, S07, S24]}
  7_synthesize: {file: incoming/organ-weight-normalization-synthesis.md, date: 2026-03-16}
  7.5_architect: {verdict: PASS}
  7.8_probe: {outcome: PROPAGATES, affected: [S10]}
decisions:
  - {step: 3, finding: 3, action: rejected, reason: "counter-evidence from FDA 2024 guidance"}
  - {step: 7.5, flag: SIMPLIFY, action: accepted, items: [1]}
```
