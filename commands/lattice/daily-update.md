---
name: daily-update
description: Generate a Slack-formatted daily update from recent commits, categorized by coverage themes.
---

Generate a Slack update message from commits since the last post.

## Steps

1. Read `.slack-update.json` in the project root for `last_sha` and `project_name`.
2. Run `git log --format="%h %ad %s" --date=short <last_sha>..HEAD`.
3. If no new commits, say "No new commits since last update" and stop.
4. Determine the date range from the oldest and newest commits in the log.
5. Read `docs/_internal/ROADMAP.md` for progress context (area names, epic completion).
6. Read the project's coverage map (path in `.slack-update.json` field `coverage_map`, default: `docs/_internal/help/coverage-map.md`). Extract the coverage tag table.
7. Categorize each commit by its primary coverage tag and group into themes.
8. Scan commits for new UI components, charts, or visualizations -- these go into the "New in UI" thread section.

## Coverage tags

Every project defines its own coverage tags in its coverage map file. The tag table must exist as a markdown table with columns `Tag` and `When to use`. The daily-update skill reads this table and uses it verbatim.

**Framework constraints on tags:**
- 8-12 tags per project (fewer = too vague, more = inconsistent tagging)
- Every item gets exactly one tag. When a commit spans two, pick the primary coverage gain.
- Tag set is fixed between coverage map updates. Don't invent ad-hoc tags.

## Synthesis rules

Every bullet must answer "now the app can..." -- no process language ("shipped", "implemented", "refactored"). No fluff. Plain english, technical-documentation tone.

Group commits into **themes** (named after the initiative/epic from the ROADMAP, not the code layer). Each theme gets a coverage tag.

## .slack-update.json schema

```json
{
  "project_name": "SENDEX",
  "webhook_url": "",
  "last_sha": "<commit hash>",
  "last_post_date": "YYYY-MM-DD",
  "coverage_map": "docs/_internal/help/wiki_sendex_coverage.md",
  "notes": "..."
}
```

- `project_name`: used in the top-level message header.
- `coverage_map`: path (relative to project root) to the file containing the coverage tag table. Default: `docs/_internal/help/coverage-map.md`.

## Output format

Output the top-level message and thread reply as two separate code blocks the user can copy-paste. Both must be valid Slack mrkdwn (not GitHub markdown).

**Slack mrkdwn rules:**
- Bold: `*text*` (single asterisk). Never use `**text**`.
- Italic: `_text_` (single underscore).
- Bullets: use `•` (U+2022). Never use `- `.
- Line breaks: single newline = same paragraph. Blank line = new block.
- No `#` headers, no `---` rules, no `>` blockquotes in top-level messages.
- No backtick-wrapped tags -- Slack renders monospace which looks odd for natural-language labels. Plain text only.

**Top-level message:**

```
<project_name>:
*Done*
• <theme> -- <coverage tag>
• <theme> -- <coverage tag>

*Deferred*
_(none this cycle)_  OR  • <item> -- <reason>

*In-Progress*
• <item> -- <coverage tag>
• <item> -- <coverage tag>
```

- *Done*: themes from committed work. One line per theme, tagged.
- *Deferred*: anything explicitly deferred this cycle with reason. Italic "(none this cycle)" if empty.
- *In-Progress*: uncommitted work from `git diff --stat HEAD`. Tag each item.

**Thread reply:**

```
--in details---

*<Theme name> -- <coverage tag>*
• <detail bullet>
• <detail bullet>

*<Theme name> -- <coverage tag>*
• <detail bullet>

*New in UI:*
• <new chart/visualization name> -- what it shows
• <new chart/visualization name> -- what it shows

*Correctness*
• <fix>
• <fix>
```

### "New in UI" section rules

Lists new visual components a user would actually see -- new chart types, new views, new panels. Identify by scanning commits for new React/framework components, chart implementations, or visualization additions. Each bullet names the component and says what it shows in plain language. Skip this section if no new UI components were added.

New UI items may also appear under their parent theme -- the "New in UI" section is a cross-cutting summary of what's visually new, not a replacement.

## Guardrails

- Keep top-level message scannable -- one line per theme, no detail.
- Thread reply under 200 words.
- Max 4 themes in Done. If more, group related commits into higher-level themes.
- Never mention commit counts, time spent, or speed of delivery.
- Roadmap progress fractions (e.g., "~40% of spec") only for multi-phase epics.
- Use `*bold*` for section headers (Slack mrkdwn), never `**markdown bold**`.
- Use `•` (U+2022) for bullets, never `- `.
- Use `--` (double hyphen) as separator between theme and tag, never em-dash (renders inconsistently across Slack clients).

## After output

Ask the user if they want to update `last_sha` in `.slack-update.json` to the current HEAD. If yes, update it.
