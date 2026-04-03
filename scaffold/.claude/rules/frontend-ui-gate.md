# Frontend UI Gate

**This rule applies to ALL frontend work — features, bug fixes, charts, panels, tables. No exceptions.**

## Rule 0: Copy before creating

Before writing ANY new UI element (chart, table, panel, pane, card, badge, legend, filter):

1. **Find the existing working instance.** Search the codebase for the closest equivalent that the user has already approved. Examples:
   - New chart → find an existing chart in the same view or a sibling view
   - New table → find an existing table with similar data shape
   - New context panel pane → find an existing pane in the same panel
   - New legend → find how legends are done in FindingsView charts

2. **Read it fully.** Note:
   - Container: width, height, resize behavior, flex/grid setup
   - Legend: position (above/below/inline), click behavior (filter toggle? highlight?)
   - Labels: what's labeled, what's not, format, casing
   - Interactions: hover, click, selection — what triggers what
   - Overflow: what happens with 2 dose groups vs 8? With short labels vs long?
   - Cross-study: does it work for PointCross AND smaller/larger studies?

3. **Copy the pattern.** Use the same container setup, legend component, interaction handlers, label formatting. Adapt only the data binding.

4. **If you can't find a reference:** State this explicitly: "No existing pattern found for [X]. Proposing new pattern: [description]." Wait for user approval before building from scratch.

## Rule 1: Viewport budget

The app runs on 15" laptops (1920x1080) as the minimum. The usable area for center content:

```
Total height: 1080px
- Browser chrome: ~80px
- App header + nav: ~48px  
- View tab bar: ~36px
- Filter bar: ~40px
- Bottom padding: ~16px
= Available: ~860px

Rail+center split:
- Rail: 260-300px
- Center: remaining (~900-1100px width)
- Context panel: 280-350px (when open)
```

**Before building:** Calculate whether your component fits. A 500px chart + 150px legend + 40px axis labels = 690px. That leaves 170px for everything else in the panel. Is that enough?

**Charts specifically:** Default chart height should be 250-350px unless the chart IS the entire center content. Never 500px+.

## Rule 2: Label audit

After building, run this checklist on every label/text element:

| Question | If yes → remove |
|----------|----------------|
| Is this label already visible in the parent context (rail header, pane title, tab name)? | Remove — it's redundant |
| Is this axis label obvious from the data format (e.g., "Dose (mg/kg)" when dose values already show "mg/kg")? | Remove or shorten |
| Is this legend entry the same as the axis category it represents? | Make the axis the legend (inline) |
| Is this tooltip showing the exact same values already visible in the chart? | Remove or add only non-visible values |
| Does this label repeat on every data point when one header would do? | Use a header |

**Dose group labels specifically:** Use `getDoseLabel()` from `dose-label-utils.ts` or `DoseLabel`/`DoseHeader` components. Never format dose strings manually. Check that labels don't duplicate between axis and legend.

## Rule 3: Interaction consistency

Every interactive element must match the established pattern:

| Element | Established pattern | Where to find it |
|---------|-------------------|------------------|
| Chart legend click | Toggle series visibility (filter) | CLAUDE.md: "Chart legends are interactive filters" |
| Chart legend visual | Faded swatch + muted text when toggled off | Same |
| Panel resize | `useResizePanel` hook with drag handle | FindingsView rail/center split |
| Chart hover | Tooltip with non-visible details only | DoseResponseChartPanel |
| Table row click | Select → context panel updates | FindingsTable, HistopathologyView |
| Empty state | `text-xs text-muted-foreground` centered prompt | Design system |

**Before adding any interaction:** Search for the same interaction in existing code and match it exactly. If your legend click does something different from every other legend click in the app, you have a bug.

## Rule 4: Cross-study stress test

After building, mentally test with:
- **Minimum data:** 2 dose groups, 1 sex, 3 endpoints. Does the chart look empty/broken?
- **Maximum data:** 8 dose groups, 2 sexes, 50 endpoints. Does it overflow? Do labels collide?
- **Missing data:** What if a dose group has no data? Show empty bar/"NE", never omit.
- **Long labels:** What if the endpoint label is "Alanine Aminotransferase (ALT) - Terminal Sacrifice"? Does it truncate gracefully?

## Rule 5: Strip pass (mandatory)

After the component works, do a deliberate removal pass:

1. Remove every label that's redundant (Rule 2)
2. Remove every margin/padding that exceeds the design system tokens
3. Remove every interaction that isn't answering an analytical question
4. Remove every config option that has only one value
5. Remove every wrapper div that isn't structurally necessary

**The goal is not "looks complete." The goal is "nothing left to remove."**

## Rule 6: Existing component reuse

Before creating new components, check these existing utilities:

| Need | Use this | Not this |
|------|----------|----------|
| Dose label | `getDoseLabel()` from `dose-label-utils.ts` | Manual string formatting |
| Dose color | `buildDoseColorMap()` from `dose-label-utils.ts` | `getDoseGroupColor()` with hardcoded level |
| Short dose label | `shortDoseLabel()` from `dose-label-utils.ts` | Manual truncation |
| Dose column header | `<DoseHeader>` from `components/ui/DoseLabel.tsx` | Raw dose strings |
| P-value format | `formatPValue()` from `severity-colors.ts` | `toFixed()` |
| Effect size format | `formatEffectSize()` from `severity-colors.ts` | Manual formatting |
| Signal tier | `getSignalTier()` from `findings-rail-engine.ts` | Threshold checks |
| Title casing | `titleCase()` from `severity-colors.ts` | Manual casing |
| Severity color | `getSeverityColor()` from `severity-colors.ts` | Hardcoded hex |
| Collapsible pane | `<CollapsiblePane>` | Custom accordion |
| Filter controls | `<FilterSearch>`, `<FilterSelect>`, `<FilterMultiSelect>` | Custom inputs |
