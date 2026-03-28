# UI Casing Conventions

## Default: Sentence case

All UI text uses **sentence case** unless listed as an exception below. Sentence case = capitalize first word only.

**Applies to:**
- Section headers (L2 and below)
- Column headers
- Filter labels
- Form labels
- Tab labels
- Button text
- Descriptions
- Tooltips
- Empty state messages
- Status text

**Examples:** "Active filters", "Sort by severity", "No results found", "Export data"

## Exception: Title Case

Title Case = capitalize every major word (not articles, prepositions, conjunctions under 4 letters).

**Applies to:**
- L1 page/view headers only
- Dialog titles
- Context menu item labels

**Examples:** "Study Summary", "Dose-Response Analysis", "Export Options"

## Exception: ALL CAPS

**Applies to:**
- Rail section headers (combined with `text-xs font-semibold tracking-wider`)
- Abbreviations that are universally uppercase (DNA, API, ID)

## Never

- Never Title Case a column header, filter label, or form label
- Never sentence case an abbreviation (write "ALT", not "Alt" for alanine transaminase)
- Never mix cases within a single UI region (if one tab is sentence case, all tabs are sentence case)

## Data Labels

Two-tier system:
- **Category/system names** (organ systems, top-level groupings): `titleCase()`
- **All other data labels:** raw values as-is (preserves abbreviations like ALT, AST, WBC, RBC)
