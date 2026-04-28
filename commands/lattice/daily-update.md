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
9. **Name the story** (see Pre-synthesis below) before writing any themes.
10. **Run the adjacent-open check** (see below) for each Done theme before writing it.

## Pre-synthesis: name the story

Before writing any themes, state in 1-2 sentences what story this window of commits tells. Examples:

- "A specific NOAEL failure mode was closed; the larger NOAEL question is still open."
- "Three new views shipped; correctness work was minimal."
- "No headline changes; the window is a long correctness tail from autopilot."

If you can't name a story, the window may not warrant a synthesis post -- ask the user whether to skip it.

The story constrains framing. A "specific failure closed, larger question open" story makes overreach ("end-to-end defensible") visibly false. A "long tail" story tells you to fold autopilot work into one tail theme rather than inflate the theme count.

## Coverage tags

Every project defines its own coverage tags in its coverage map file. The tag table must exist as a markdown table with columns `Tag` and `When to use`. The daily-update skill reads this table and uses it verbatim.

**Framework constraints on tags:**
- 8-12 tags per project (fewer = too vague, more = inconsistent tagging)
- Every item gets exactly one tag. When a commit spans two, pick the primary coverage gain.
- Tag set is fixed between coverage map updates. Don't invent ad-hoc tags.

## Synthesis rules

**Classify each theme as capability or correctness BEFORE writing it.** The two voices are different:

- **Capability change** (a new thing the app can do): "now the app can X" framing. Example: "now produces a kinetics plot for immunogenicity titers."
- **Correctness/maintenance change** (an existing thing now works better, or a known wrong answer is fixed): "X no longer fails on Y" / "X now handles Y correctly" framing. Example: "PointCross BW NOAEL no longer pins to control on the terminal-day path."

Capability voice on correctness work produces handwaving ("PointCross-class NOAEL is defensible end-to-end" instead of "BUG-032 fixed in `_safe_day_start`"). Force the per-line classification first, then write in the matching voice.

No process language ("shipped", "implemented", "refactored"). No fluff. Plain English, technical-documentation tone.

Group commits into **themes** (named after the initiative/epic from the ROADMAP, not the code layer). Each theme gets a coverage tag.

## Adjacent-open check (mandatory)

For each Done theme, scan TODO.md and any open SCIENCE-FLAG / GAP / BUG entries on the SAME surface. If open items exist, they MUST appear in In-Progress or Plan in the same window's message. Example:

- Done line: "PointCross BW NOAEL terminal-day failure fixed (BUG-032)"
- Adjacent open: GAP-361 (relatedness=null misclassified), GAP-362 (override popover HCD context)
- Both must appear in In-Progress or Plan -- otherwise the Done line implies the surface is finished, which is false.

The reader infers scope from what's NOT mentioned. A Done line without its open siblings adjacent reads as "this area is done." Honest scoping requires both halves visible.

## Long-tail handling

When a window contains many small TODO closes (>10) that don't fit the top 3 themes, fold them into one tail theme. Top-level line names CATEGORIES, not IDs:

- Good: "autopilot wave -- HCD arithmetic guards, LOAEL/dose-handling cleanup, knowledge-graph hygiene, citation backlog"
- Bad: "GAP-195/202/203/204/255/256/260/261 closed" (commit laundry)
- Bad: omitting the tail entirely (volume invisible to the reader)

Thread enumerates the tail thematically, not by ID -- list 3-6 category groups with 1-2 representative changes each. IDs only appear in the thread when they anchor a single significant change (e.g., "BUG-032 atomic with BUG-033 per rule 19").

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
- No bullet characters (`•`, `-`). Each item is its own line, no prefix.
- Line breaks: single newline = same paragraph. Blank line = new block.
- No `#` headers, no `---` rules, no `>` blockquotes in top-level messages.
- No backtick-wrapped tags -- Slack renders monospace which looks odd for natural-language labels. Plain text only.

**Top-level item format:**

```
PROJECT/tag: what the app can now do -- why it matters
```

- **Prefix:** `PROJECT/tag:` where tag is the primary coverage axis.
- **Body:** what changed, phrased as capability. Keep it to ~15 words max -- the gist, not the details. Details belong in the thread reply.
- **Suffix:** `-- why` after a double-hyphen separator. One short clause: analytical, regulatory, or strategic value -- not implementation detail.
- Tags can be higher-level groupings when work spans multiple canonical axes (e.g. "scientific engines" for interpretation engine + statistical methods). Use canonical tags when the work fits one axis cleanly.
- In-Progress items may omit the tag when work spans many axes: just `PROJECT: description`.

**Top-level message:**

```
*Done:*
PROJECT/tag: description -- why
PROJECT/tag: description -- why

*In-Progress:*
PROJECT: description -- why
PROJECT/tag: description -- why

*Plan:*
PROJECT/tag: description -- why
PROJECT/tag: description -- why
Deferred: description -- reason

*Misc*
description
```

- *Done*: themes from committed work. One line per theme.
- *In-Progress*: uncommitted work from `git diff --stat HEAD` and conversation context.
- *Plan*: forward-looking -- what's coming next. Deferred items are lines here prefixed with "Deferred:".
- *Misc*: non-product work (framework skills, tooling, workflow changes). Skip if empty.

**Thread reply:**

The thread adds information that is NOT in the top-level message. Never restate the theme description -- the reader already saw it. Thread content is strictly additive: specific commits, metrics, component names, technical decisions.

```
--in details---

*<Theme name>*
• <commit-level detail not in top-level>
• <metric, component name, or technical decision>

*New in UI:*
• <new component name> -- what it shows

*Correctness*
• <specific fix>
```

Before writing each thread bullet, check: does the top-level already say this? If yes, skip it or go deeper. If no, include it.

### "New in UI" section rules

Lists new visual components a user would actually see -- new chart types, new views, new panels. Each bullet names the component and says what it shows in plain language. Skip this section if no new UI were added.

**Redundancy rule:** If every new UI element is already covered by a theme above, skip "New in UI" entirely. Only include this section for orphan UI work that doesn't belong to any theme.

## Guardrails

- Keep top-level message scannable -- one line per theme, no detail.
- Thread reply under 150 words. Zero redundancy with top-level.
- Max 4 themes in Done. If more, group related commits into higher-level themes (or use the long-tail rule above).
- Never mention commit counts, time spent, or speed of delivery.
- Roadmap progress fractions (e.g., "~40% of spec") only for multi-phase epics.
- Use `*bold*` for section headers (Slack mrkdwn), never `**markdown bold**`.
- Use `•` (U+2022) for bullets in thread reply only. No bullets in top-level.
- Use `--` (double hyphen) as separator, never em-dash.
- **Banned overreach words** in Done lines: `defensible`, `end-to-end`, `complete`, `fully`, `production-ready`, `solved`, `ready`, `nailed`. These inflate narrow fixes into sweeping claims. Permitted only when the line cites a corpus pass, test count, or external validator. If the change is narrow ("one failure mode in one path"), the line must say so explicitly ("specific known-bad path closed, not an end-to-end pass").

## After output

Ask the user if they want to update `last_sha` in `.slack-update.json` to the current HEAD. If yes, update it.
