---
name: design
description: UI/UX design step — sits between synthesize and implement. Decides what to show, where it goes, what technology to use, and what to leave out.
---

You are making **design decisions** for a feature before any code is written. This skill sits between `/lattice:synthesize` (what to build) and `/lattice:implement` (writing code). The synthesize says WHAT capabilities are needed. You decide HOW they present to the user.

**Input:** A spec or synthesis document, or a specific feature description. Examples:
- `design docs/_internal/incoming/evidence-scoring-overhaul-synthesis.md`
- `design "dose proportionality chart for PK exposure section"`
- `design Phase 3 of the current spec`

---

## Core Model: The Visual Context Window

A screen is a fixed-size context window. Just like an LLM's context window has a token budget, a 15" screen has a pixel budget — and every element competes for it. This analogy drives every design decision:

### The screen budget is non-negotiable

At 1920x1080 on 15", after chrome/header/tabs/filters, the center panel gets roughly **860px tall x 900px wide**. That's the context window. Everything the user needs to see, compare, and connect must fit in that space — or the design must make explicit tradeoffs about what's visible vs hidden.

### Visual proximity = cognitive proximity

The human visual system detects patterns by comparing things it can see simultaneously. Two charts side-by-side let the eye find correlations instantly. The same two charts in separate views force the user to **remember** the first while looking at the second — and memory is lossy. Therefore:

- **Related information must be spatially adjacent.** If dose-response and exposure data inform the same decision, they must be visible together — not in separate views.
- **Every scroll is a context eviction.** Content that scrolls off-screen is content the user must reconstruct from memory. Minimize vertical extent. Prefer density over scroll.
- **Every view switch is a full context flush.** The user loses all spatial anchoring. Tabs are cheaper than views because the container, rail state, and selection persist.

### The proximity hierarchy (cheapest to most expensive navigation)

| Navigation | Context cost | Use when |
|-----------|-------------|----------|
| **Eye movement** (adjacent element) | Zero — best possible | Related signals that must be compared |
| **Legend/filter toggle** (same viewport, data changes) | Near-zero — spatial model preserved | Slicing the same data by sex, dose, timepoint |
| **Tab switch** (same container, content swaps) | Low — rail/selection preserved | Alternate representations of the same entity |
| **Scroll** (viewport shifts) | Medium — top context evicted | Content that's useful but secondary |
| **Context panel update** (selection-driven) | Medium — center preserved, side changes | Detail for a selected item |
| **Expand/collapse** (layout reflows) | Medium-high — spatial model disrupted | Rarely-needed detail |
| **View switch** (full navigation) | High — everything resets | Truly independent analytical questions |
| **Modal/overlay** (blocks everything) | Highest — all context hidden | Almost never appropriate in analytical tools |

**Design rule: always use the cheapest navigation that serves the analytical need.**

### Charts and tables are orthogonal

Charts show **patterns** (trends, outliers, dose-response shapes, clusters). Tables show **exact values** (p=0.0023, effect size=1.47, n=5). Scientists need both, but they serve different cognitive functions:

- A chart answers: "Is there a dose-response?" (1-second visual scan)
- A table answers: "What exactly is the p-value at the mid dose?" (targeted lookup)

**Design implications:**
- Don't make the user choose between chart and table — show both when space allows
- If only one fits: chart gets the center (pattern recognition is the primary task), table goes to context panel or expand-on-demand
- A table that's too large for its container is worse than no table — it pushes the chart down (scroll cost) or shrinks the chart (pattern recognition degrades)
- Never put a 20-row table where a 4-bar chart would answer the question

### Slicing without losing context

The most powerful interaction is one that changes **what data is visible** without changing **where things are on screen**. This preserves the user's spatial model while letting them explore dimensions:

- Legend click → toggles a series (spatial layout unchanged, data filtered)
- Sex toggle → same chart, different subset (position stable)
- Timepoint slider → same axes, different slice (position stable)
- Dose group highlight → same everything, one group emphasized (position stable)

These are cheap. Compare with: "click to navigate to a filtered view of the same data" — expensive, disorienting, breaks the visual field.

### The design test

For every proposed element, ask: **"If I add this, what gets pushed further away from the thing it needs to be compared with?"** If the answer is "the chart this table explains" or "the related signal in the adjacent panel" — the design has a proximity violation. Fix it before building.

---

## Step 1: Understand the analytical question

Before any layout thinking, answer:

1. **What question is the user trying to answer?** State it as a concrete toxicology question. Example: "Is the exposure increase proportional to dose, or is there saturation?"
2. **What data answers that question?** List the minimum data points needed. Not "everything the backend provides" — the minimum set.
3. **What's the decision the user makes with this data?** Example: "Decide whether PK saturation at high dose affects the NOAEL determination."

If you can't answer these three questions, stop. The feature isn't ready for design — it needs more research.

## Step 2: Redundancy check

Before adding ANY new UI element to a view:

1. **Is this information already visible in the current view?** Check:
   - The center panel (charts, tables, grids)
   - The context panel panes
   - The rail (cards, badges, indicators)
   - The filter bar
   
2. **Is this information available one click away?** Check:
   - Other tabs in the same view
   - Context panel panes that show on selection
   - Cross-view links that navigate with pre-filtered state

3. **If it exists anywhere:** Don't add it again. Link to it, highlight it, or surface it on interaction. Adding redundant information is a design defect — it wastes viewport space and creates maintenance burden (two places to update, two places to break).

## Step 3: Placement decision

Use this decision tree for every new information element:

```
Is it the PRIMARY analytical output for this view?
├── Yes → Center panel (chart or table, full width)
│
└── No → Is it detail/context for a SELECTED item?
    ├── Yes → Context panel pane
    │   └── Does it fit in 280-350px width?
    │       ├── Yes → Build as pane
    │       └── No → Summary in pane + expand action (modal or fullscreen)
    │
    └── No → Is it a summary/aggregate/scope indicator?
        ├── Yes → Rail badge, filter bar chip, or section header
        │
        └── No → Is it comparative (needs side-by-side layout)?
            ├── Yes → Center panel with split/tabs
            │   └── Does it fit alongside existing center content?
            │       ├── Yes → Add as tab or stacked section
            │       └── No → New view tab, or replace existing with toggle
            │
            └── No → This information probably doesn't belong in this view.
                     Propose where it DOES belong, or propose leaving it out.
```

**Coping strategies when it doesn't fit** (ordered by context cost — cheapest first):

| Strategy | Context cost | When to use | Example |
|----------|-------------|-------------|---------|
| Inline into existing element | Zero | Data that augments something already visible | Add R² annotation to existing scatter plot |
| Legend/filter toggle | Near-zero | Alternative slice of same data | Sex toggle on existing chart |
| Hover tooltip | Near-zero | 1-3 supplementary data points | CI on hover over effect size |
| Tab in same container | Low | Alternate representation of same entity | Terminal vs Peak timepoint tabs |
| On-selection (context panel) | Medium | Detail relevant only to a focused item | Pane appearing on endpoint click |
| Summary badge + expand | Medium | High-dimensional data in small space | "3 adverse" badge → click reveals list |
| Collapse/expand | Medium-high | Detail useful but not always needed | CollapsiblePane for raw metrics |
| Move to another view | High | Truly independent analytical question | Cross-study comparison → portfolio view |
| Transient overlay/modal | Highest | Almost never | Only for full-screen chart zoom |

**Always pick the cheapest strategy that serves the analytical need.** If you're reaching for "move to another view" or "modal," the design probably has a proximity violation — the information wants to be near something it's being separated from.

## Step 4: Technology selection

For charts and visualizations, choose based on the specific need:

### ECharts (via `EChartsWrapper.tsx`) — the default

**Use when:** Standard chart types (bar, line, scatter, heatmap, radar, pie), interactive tooltips, legend filtering, data zoom, axis formatting.

**Pros:** Built-in responsiveness, consistent tooltip/legend behavior, handles large datasets, canvas rendering (fast), extensive configuration without custom code.

**Cons:** Less control over pixel-exact layout, custom shapes require `CustomChart` series (verbose), harder to integrate with React state for non-standard interactions.

**Already used for:** Dose-response curves, comparison charts, findings charts, histopathology charts, cohort charts.

### Raw SVG (React JSX) — for custom visualizations

**Use when:** Custom layouts that ECharts can't express (forest plots, timelines, heatmap matrices with custom cell content, organ topology diagrams), tight integration with React state, pixel-exact positioning.

**Pros:** Full control, React-native (state/props drive rendering), lightweight for simple shapes, easy to style with Tailwind.

**Cons:** Manual responsiveness, manual tooltip positioning, manual legend behavior, manual axis rendering, no built-in interaction helpers.

**Already used for:** OrganGroupedHeatmap, StudyTimeline, FindingsQuadrantScatter, GroupForestPlot, OrganToxicityRadar.

### Decision rule

```
Is it a standard chart type (bar/line/scatter/heatmap/radar)?
├── Yes → ECharts. Don't reinvent axes, tooltips, and legends.
└── No → Does it need custom layout (cells with complex content, non-standard geometry)?
    ├── Yes → Raw SVG
    └── Maybe → ECharts with CustomChart series. If that gets too verbose (>100 lines of series config), switch to SVG.
```

### HTML table — for structured data with interactions

**Use when:** Tabular data with sorting, selection, row expansion, column alignment. Don't use charts for data that's naturally tabular.

**Already used for:** FindingsTable, HistopathologyView tables, PaneTable.

## Step 5: Layout specification

For every new element, specify:

```
ELEMENT: [name]
PLACEMENT: [center/context-pane/rail-badge/filter-bar/tab]
CONTAINER: [parent component, flex/grid setup, dimensions]
TECHNOLOGY: [ECharts/SVG/HTML-table/text]
DIMENSIONS: [width x height at 1920x1080, resize behavior]
DATA RANGE: [min items .. max items, what happens at extremes]
INTERACTIONS: [list each: trigger → effect]
LABELS: [only the ones that survive the label audit — list each with justification]
REFERENCE COMPONENT: [existing component this is modeled after]
```

**This specification is the contract.** The implementer builds exactly this, no more. If the spec doesn't mention a legend, there's no legend. If the spec doesn't mention a tooltip, there's no tooltip.

## Step 6: Minimum viable design

Take your layout specification and ask:

1. **Remove one element.** Can the user still answer the analytical question? If yes, it wasn't needed.
2. **Repeat until removing anything breaks the answer.**
3. **What's left is the design.** Everything else is a candidate for "Phase 2" or "on user request."

Present the design as:

```
DESIGN: [feature name]

ANALYTICAL QUESTION: [what the user is trying to answer]
MINIMUM DATA: [what answers it]
DECISION: [what the user does with the answer]

PLACEMENT: [where in the view]
TECHNOLOGY: [ECharts/SVG/table]
REFERENCE: [existing component this matches]

LAYOUT:
[ASCII sketch of the element in its container, showing proportions]

ELEMENTS (each justified):
1. [element] — needed because [analytical reason]
2. [element] — needed because [analytical reason]

EXPLICITLY EXCLUDED:
- [thing you're NOT adding] — because [redundant with X / doesn't fit / not needed for the question]

INTERACTIONS:
- [trigger] → [effect] — matches [existing pattern in codebase]

OVERFLOW HANDLING:
- [what happens with too much data]
- [what happens with too little data]

COPING STRATEGIES:
- [if it doesn't fully fit: what's the fallback]
```

## Step 7: Measure (when Chrome DevTools MCP is available)

If the Chrome DevTools MCP server is connected (user ran `scripts/chrome-debug.bat` before the session), use it to verify your design against the live app:

### Measure actual viewport budget
```js
// Get the center panel dimensions
document.querySelector('[class*="flex-1"]')?.getBoundingClientRect()
// → { width: 924, height: 847, ... }
```

### Measure chart density
```js
// Get chart container vs chart canvas
const container = document.querySelector('.echarts-container');
const canvas = container?.querySelector('canvas');
const cr = container?.getBoundingClientRect();
const cvr = canvas?.getBoundingClientRect();
// Density = canvas area / container area
```

### Check margin waste
```js
// Measure actual padding/margin on any element
const el = document.querySelector('[your-selector]');
const cs = getComputedStyle(el);
({ margin: cs.margin, padding: cs.padding, width: cs.width, height: cs.height })
```

### Screenshot at different viewports
Use `resize_page` to test 1920x1080 (15" laptop) and 2560x1440 (27" monitor) and verify the layout works at both.

### Inject CSS changes live
Test margin/padding adjustments without rebuilding:
```js
document.querySelector('[selector]').style.padding = '4px 8px';
```

This is the fastest feedback loop for design iteration: measure → adjust → screenshot → compare.

---

## Step 8: Mockup (recommended for new UI elements)

Generate clickable HTML mockups to validate the design before implementing. This is faster than building the real component and trivial to throw away.

### How to build mockups

Write standalone HTML files in `frontend/e2e/mockups/`:

```html
<!-- frontend/e2e/mockups/dose-proportionality-A.html -->
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <style>/* Match app tokens: --background, --foreground, etc. */</style>
</head>
<body class="bg-background text-foreground text-xs">
  <!-- Mock the parent container at real dimensions -->
  <div style="width: 900px; height: 860px" class="flex">
    <!-- Rail stub -->
    <div style="width: 280px" class="border-r bg-muted/30">...</div>
    <!-- Center panel -->
    <div class="flex-1 p-4">
      <!-- YOUR DESIGN HERE with mock data -->
    </div>
  </div>
</body>
</html>
```

### Rules for mockups

1. **Use real dimensions.** The mock container must match the actual viewport budget (900px center width, 860px height). If it doesn't fit in the mock, it won't fit in the app.
2. **Use realistic data.** Pull sample data from `backend/generated/PointCross/` — don't use 3 perfect data points. Use the messy real data with missing values, long labels, and edge cases.
3. **Match the design system.** Use Tailwind CDN with the same classes as the app. Match font sizes (`text-xs`, `text-[10px]`), colors, spacing. The mockup should look like the app, not a wireframe.
4. **Make it interactive where it matters.** If legend click-to-filter is part of the design, implement it in the mockup (simple JS onclick). If resize is part of the design, add a drag handle.
5. **Generate 2-3 variants** when the design has real alternatives:
   - **A: Minimal** — absolute minimum that answers the analytical question
   - **B: Standard** — adds one more element that improves the answer
   - **C: Rich** — adds context/detail that's nice-to-have
   
   Not 3 random layouts. Each variant is a specific tradeoff: less viewport cost vs more information.

### Present to user

Use Playwright to screenshot each variant:

```bash
cd C:/pg/pcc/frontend && npx playwright screenshot e2e/mockups/dose-proportionality-A.html e2e/mockups/screenshots/design-A.png --viewport-size=1920,1080
```

Then present:

```
DESIGN OPTIONS: Dose Proportionality Chart

Option A (minimal): [description — what's shown, what's excluded]
Option B (standard): [description — adds X]  
Option C (rich): [description — adds X and Y]

Recommendation: B — [reason]

Screenshots saved to e2e/mockups/screenshots/
Open in browser: file:///C:/pg/pcc/frontend/e2e/mockups/dose-proportionality-B.html
```

The user picks one. That becomes the implementation contract.

### When to skip mockups

- Bug fixes to existing UI (just fix it)
- Backend-only changes
- Trivial additions (new column in existing table, new badge on existing card)
- When the design exactly copies an existing component (Rule 0 match — no ambiguity)

### Cleanup

Mockup HTML files are disposable. Delete them after the design is approved and implemented. They don't get committed.

## Integration with pipeline

- **Called by `/lattice:implement`** before each phase that introduces new UI
- **Called by `/lattice:synthesize`** when the synthesis proposes UI-facing features (optional — synthesize can flag "needs design" and defer to implement time)
- **Can be called standalone** for design-only work ("redesign the PK exposure section")

## Known Failure Modes

1. **Shipping UI changes blind.** Cost of error discovery is high (commit, user review, rollback, redo). Screenshot the current state, mock the change in dev tools or HTML mockup, get approval BEFORE writing code. Steps 7-8 are not optional.

2. **Mechanical rule compliance over analytical value.** Design rules exist to serve the toxicologist's analytical workflow. If following a design rule produces a result that makes data harder to interpret, the rule is being misapplied. Before any change, ask: "Does this help the toxicologist answer their question?"

3. **Incidence data in continuous layouts.** Continuous endpoints (BW, LB) and incidence endpoints (MI, MA) need fundamentally different center panel layouts. Never shoehorn incidence data into dose-response chart frameworks. Reference: histopathology dose charts pattern for incidence.

## Rules

- **No design from first principles.** Find the existing pattern first (frontend-ui-gate Rule 0). The design step determines WHAT goes WHERE. The UI gate determines HOW to build it.
- **The spec is a ceiling, not a floor.** The synthesize may propose 5 elements. If the design step determines 2 are redundant and 1 doesn't fit, the design outputs 2 elements. The implementer builds 2.
- **Every element must justify its viewport cost.** A chart that takes 350px of height better be answering a question the user can't answer without it.
- **Interactions are expensive.** Every interaction is a behavior to maintain, a bug surface, and a pattern to keep consistent. Don't add interactions "because we can."
- **Technology decisions are permanent for that component.** Don't mix ECharts and SVG in the same visual. Pick one and commit.
- **Present the design to the user before implementing.** The design is quick to review (an ASCII sketch + element list). The implementation is expensive to redo. Get alignment on the design, then build.
