# Lattice Research Registry

> Tracks research streams and open questions for lattice-side work.
> Created 2026-05-09 from worktree-isolation cycle. Append entries; do not delete completed ones — archive instead.

## Active streams

### WTI-RG-1 — R0 PreToolUse hook false-positive rate

### WTI-RG-2 — Post-commit-intent conflation rate and class characterization

```yaml
WTI-RG-2:
  status: open
  conclusion: "Open: what is the post-commit-intent-protocol conflation rate, and are the May 2026 submodule-conflated events (c9f82aa, 32944cf0) the same failure class as the 4 named file-staging conflations?"
  touches-subsystems: [commit-intent, autopilot, submodule-handling]
  affects: [worktree-isolation justification, counter-argument analysis]
  depends-on: []
  open-questions:
    - "The 4 named conflation incidents (1370c103, 521f1d16, a47ee865, abdb31c9) all predate commit-intent deployment (2026-04-28). Two decisions.log entries from 2026-05-03 mention 'submodule-conflated' incidents post-protocol. Are these the same root cause (shared git index staging) or a distinct submodule-pointer class?"
    - "Has the file-staging conflation class been reduced to zero by commit-intent, or does it still occur but go unlogged?"
    - "If commit-intent achieves near-zero file-staging conflations post-deployment, does the worktree isolation prevention layer still meet the spec-value-audit bar?"
  source: "peer-review/worktree-isolation-synthesis"
  doc: "C:/pg/lattice/research/peer-reviews/worktree-isolation-synthesis-review.md (LBC-1, Finding 4)"
  notes: |
    Answerable from decisions.log grep + commit history. The synthesis undercounts incidents:
    - 2026-04-27 04:10:35Z: 45f29b53 emptied by concurrent interleave (same root cause)
    - 2026-05-03: c9f82aa and 32944cf0 described as 'conflated' in decisions.log
    The post-protocol evidence strengthens the case for worktrees but the class distinction
    matters for whether R0 is addressing a live problem or a solved one.
```

```yaml
WTI-RG-1:
  status: researching
  conclusion: "Open: false-positive rate of R0 worktree-enforcement hook in real session traffic, hypothesized <5%"
  touches-subsystems: [hooks, session-spawn, exemption-envelope, allowlist]
  affects: [worktree-isolation]
  depends-on: [worktree-isolation R0 deployment]
  open-questions:
    - "What % of write attempts at canonical root are legitimate (trust-doc edits via allowlist + exemption envelope)?"
    - "Does the default allowlist (CLAUDE.md, README.md, ROADMAP.md, LICENSE, NOTICE, .gitignore, .gitattributes, docs/) cover the real distribution of canonical-root edits, or does it need expansion?"
    - "Are exemption-envelope rationales meaningful (audit-log readable post-hoc) or do users default to trivial strings?"
  source: "synthesize/worktree-isolation"
  doc: "C:/pg/lattice/incoming/worktree-isolation-synthesis.md (Section 2)"
  notes: |
    Re-evaluate after 30 days of post-R0 traffic. Inputs: .lattice/exemption-audit.log,
    .lattice/allowlist-audit.log, decisions.log entries, user feedback. If real rate
    diverges from hypothesis (>5% false positives), allowlist needs adjustment OR
    exemption rationale rejection-list needs tightening.
```
