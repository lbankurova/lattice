---
name: daily-update
description: Generate a Slack-formatted daily update from recent commits, categorized by work type.
---

Generate a SENDEX Slack update message from commits since the last post.

## Steps

1. Read `C:/pg/pcc/.slack-update.json` for `last_sha`.
2. Run `git log --format="%h %ad %s" --date=short <last_sha>..HEAD` in `C:/pg/pcc`.
3. If no new commits, say "No new commits since last update" and stop.
4. Determine the date range from the oldest and newest commits in the log.
5. Read `C:/pg/pcc/docs/_internal/ROADMAP.md` for progress context (area names, epic completion).
6. Categorize commits into the four sections below and synthesize.

## Synthesis rules

Every bullet must answer "now the app can..." -- no process language ("shipped", "implemented", "refactored"). No fluff. Plain english, technical-documentation tone.

**Sections:**
- **Scientific engine** -- new methods, classification changes, scoring logic
- **Architecture** -- plumbing, config extraction, performance, DSL, registries
- **Views** -- UI capabilities. Name new views explicitly. For existing views, state the new capability, not the component.
- **Data pipeline** -- import, generation, validation, benchmarks

**Footer (one line only, only if applicable):**
- **In-flight:** uncommitted work from `git diff --stat HEAD` -- shows what's being worked on but not yet committed

## Output format

Output the top-level message and thread reply as two separate code blocks the user can copy-paste.

**Top-level message:**
```
SENDEX update -- <start_date>-<end_date>
```

**Thread reply** (Slack mrkdwn):
```
*Scientific engine*
- bullet
- bullet

*Architecture*
- bullet

*Views*
- bullet

*Data pipeline*
- bullet

*In-flight:* ...
```

## Guardrails

- Skip sections with 0 relevant commits.
- Keep total thread reply under 200 words.
- Max 4 bullets per section. If more, group related commits into higher-level outcomes.
- Never mention commit counts, time spent, or speed of delivery.
- Roadmap progress fractions (e.g., "~40% of spec") only for multi-phase epics.
- Use `*bold*` for section headers (Slack mrkdwn), not **markdown bold**.
- Use bullet character that Slack renders correctly.

## After output

Ask the user if they want to update `last_sha` in `.slack-update.json` to the current HEAD. If yes, update it.
