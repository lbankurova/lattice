# Design Decisions — Datagrok Platform (Layer 1)

> These decisions apply to ALL Datagrok plugins. App-specific decisions go in the project's own design-decisions rules file.
> When in doubt, choose the most conservative option (neutral gray, smallest spacing, no color).

---

## 1. Color Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| Categorical identity (domain, sex, severity, status) | `bg-gray-100 text-gray-600 border-gray-200` (neutral) | Per-category colored badges |
| Domain labels | `text-[10px] font-semibold text-muted-foreground` (text only) | Dot badges, outline pills, bordered treatments |
| Evidence values (p-value, effect size) in grids | `text-muted-foreground` at rest; color on hover/selection only | Always-on color in grids |
| Conclusion elements (tier dots, target organs) | Color at rest is correct (Tier 1 emphasis) | Suppressing color on conclusions |
| Decision-level color per row | At most once per row | Multiple colored elements in same row |
| Color discipline | Position > Grouping > Typography > Color. <=10% saturated pixels at rest. | Color as primary differentiator |
| Heatmap matrices (non-severity) | Neutral grayscale 5-step ramp, always-on | Severity palette for non-severity data |
| New color values | Must come from CSS vars, design tokens, or Tailwind palette | Invented `#rrggbb` literals |
| Color application method | Tailwind classes or CSS variables | `style={{ color: "..." }}` (exception: dynamic chart values) |

## 2. Typography Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| View header (tab-bar view) | `text-base font-semibold` | `text-2xl font-bold` |
| Section header (pane) | `text-sm font-semibold` | `text-base`, `font-bold` |
| Section header (uppercase) | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Manual ALL CAPS |
| Table header (compact) | `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground` | `text-xs`, `font-medium` |
| Table cell text | `text-xs` | `text-sm` in grids |
| Rail header | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | `font-medium` |
| `font-bold` usage | Standalone view page titles only | Section headers, badges, buttons |
| `font-mono` usage | Data values: p-values, IDs, domain codes, formatted numbers | Labels, headers, buttons |

## 3. Spacing Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| Filter bar container | `px-4 py-2 gap-2` + `border-b bg-muted/30` | Custom padding |
| Context panel pane content | `px-4 py-2` | `p-4`, `px-6` |
| Compact table cells | `px-2 py-1` | `px-3 py-2` |
| Badge padding | `px-1.5 py-0.5` | `px-2 py-1` |
| Evidence panel background | `bg-muted/5` | `bg-muted/10`, `bg-white` |

## 4. Component Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| Tab bar (any view) | `h-0.5 bg-primary` underline active, `text-xs font-medium`, container `bg-muted/30` | Custom tab styling |
| Evidence/overview tab naming | "Evidence" | "Overview" |
| Context panel back/forward | `< >` icon buttons | Breadcrumb navigation |
| Truncated text (>25 chars) | Add `title` tooltip | No tooltip |
| Icon-only buttons | Add tooltip explaining action | No tooltip |

## 5. Layout Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| Context panel pane ordering | insights -> stats/details -> related -> annotation -> navigation | Random ordering |
| Table column layout | Content-hugging with absorber (`width: 1px; white-space: nowrap`) | Equal-width columns |
| Expandable row content | Aligns under label text, not the chevron | Flush-left alignment |
| Rail auto-select on load | Auto-select first item (once per mount, URL params take priority) | Empty center panel when data exists |
| Chart legends | Interactive filters. Click = solo, Ctrl+click = additive toggle | Non-interactive legends |
| Spatial anchoring (paired displays) | Show identical categories in identical order, even if one panel has no data | Omitting empty categories |
| Inline override fields | `bg-violet-100/50` tint, right-click activation, corner triangle when overridden | Click dropdowns |

## 6. Casing Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| Default for all UI text | Sentence case | Title Case |
| L1 headers, dialog titles | Title Case | Sentence case |
| Section headers within panes | Sentence case | Title Case |
| Uppercase section headers | Source string in sentence case + CSS `uppercase tracking-wider` | Manual ALL CAPS |

## 7. Information Hierarchy

Six categories: Decision, Finding, Qualifier, Caveat, Evidence, Context -- never mix in one visual unit.

Emphasis tiers:
1. Colored at rest = conclusions
2. Visible, muted = labels
3. On interaction = evidence

**Pre-edit hierarchy analysis:** Before changing font size, margin, or padding: (1) map current hierarchy (control > supporting > micro); (2) verify change preserves tier relationships; (3) check spacing is proportional.
