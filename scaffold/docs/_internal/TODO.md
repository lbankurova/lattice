# [Project] Technical Debt & Open Issues

> **Source:** Extracted from implementation, audits, and user feedback
> **Purpose:** Single source of truth for all bugs, gaps, missing features, and tech debt
> **Process:** Agents add items here → user prioritizes → agents implement → mark done with ~~strikethrough~~ + commit hash
> **Resolved items:** 0 archived

## Agent Protocol

- **Any agent** may add items (bugs discovered, spec gaps, tech debt noticed)
- **PM / user** prioritizes and assigns owner hints
- **Implementing agent** marks items done with ~~strikethrough~~ ✅ and commit hash
- **Review agent** verifies completions during `/review`

---

## Summary

| Category | Open | Resolved | Description |
|----------|------|----------|-------------|
| Bugs | 0 | 0 | Runtime errors, incorrect behavior |
| Hardcoded | 0 | 0 | Values that should be dynamic/configurable |
| Spec Divergence | 0 | 0 | Implementation differs from spec |
| Gaps | 0 | 0 | Missing functionality identified in audits |
| Tech Debt | 0 | 0 | Code quality, performance, refactoring |

---

## Bugs (0 open)

<!-- ### BUG-01: [Title]
- **Files:** `path/to/file.ts`
- **Issue:** [description]
- **Fix:** Open
- **Priority:** P1/P2/P3
- **Owner hint:** frontend-dev / backend-dev -->

## Hardcoded (0 open)

<!-- ### HC-01: [Title]
- **Files:** `path/to/file.ts`
- **Issue:** [what's hardcoded and what it should be]
- **Fix:** Open
- **Priority:** P2
- **Owner hint:** [role] -->

## Spec Divergence (0 open)

<!-- ### SD-01: [Title]
- **Spec:** `docs/_internal/incoming/spec-name.md` §section
- **Files:** `path/to/file.ts`
- **Issue:** Spec says [X], code does [Y]
- **Priority:** P2
- **Owner hint:** [role] -->

## Gaps (0 open)

<!-- ### GAP-01: [Title]
- **Source:** [audit, spec review, user feedback]
- **Issue:** [what's missing]
- **Priority:** P2/P3
- **Owner hint:** [role] -->

## Tech Debt (0 open)

<!-- ### TD-01: [Title]
- **Files:** `path/to/file.ts`
- **Issue:** [what needs improving]
- **Priority:** P3
- **Owner hint:** [role] -->
