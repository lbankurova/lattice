---
title: "Datagrok platform — visualization & plugin development docs"
authors: Datagrok
year: 2024–2026 (continuously published)
url: https://datagrok.ai/help/develop/
type: framework
read: 2026-04-26
status: evaluating
---

# Datagrok — Platform Docs

## Source thesis

Datagrok is the host platform sendex is migrating to (per `MEMORY.md` `project_datagrok_target.md`). The platform supplies:

1. **A native viewer library.** ~30+ first-class visualisations (scatter plot, line chart, bar chart, histogram, box plot, density, heatmap, network diagram, scatterplot matrix, trellis grid, radar, statistics, etc.), all with consistent interaction model, data binding, theming, filtering, and export. Per `https://datagrok.ai/help/visualize/viewers/`. Viewers are Datagrok-managed components, not user code.
2. **A plugin API.** Plugins are JavaScript / TypeScript packages that register apps, viewers, functions, semantic types, and data connectors. The package layout, build system (webpack), test harness, and dev workflow are documented at `https://datagrok.ai/help/develop/`. The integration surface is the platform's JS API, not React component imports.
3. **A theming and semantic-type system.** Columns carry semantic types (`Molecule`, `chem.smiles`, etc.); viewers and functions dispatch on those types. The platform provides theming primitives that plugins are expected to honour rather than override.
4. **A data-grid as the primary surface.** Most analytical workflows in Datagrok start from a grid view of a table; viewers attach to the grid as panels or side-cars. The grid handles filtering, selection, sorting, and broadcasts those as platform-level events that viewers respond to.
5. **Collaboration / sharing primitives.** Layouts (saved configurations of viewers + filters) are first-class entities; users share layouts, not screenshots. Annotations attach to data, not pages.

The audience is "developers extending Datagrok with custom analytical capabilities." The platform's design priorities are interactive data exploration, scientific workflows, and ease of deploying new analytical surfaces — directly relevant to sendex's product space.

## Translation

Sendex today is a standalone React app with bespoke charts, bespoke tables, a bespoke filter bar, a bespoke rail/center/context-panel layout, and a bespoke selection model. Almost every Datagrok primitive has a sendex equivalent that was built rather than borrowed:

| Datagrok primitive | Sendex equivalent | Migration implication |
|---|---|---|
| Native viewers (scatter / line / bar / heatmap) | ECharts wrappers + raw-SVG components (`DoseResponseChartPanel`, `OrganGroupedHeatmap`, `BivarScatterChart`, `StackedSeverityIncidenceChart`, …) | Most charts will become Datagrok viewer instances (or thin custom viewers) at migration. The bespoke ECharts wrappers become migration debt. |
| Native data grid | `FindingsTable`, `PaneTable`, `HistopathologyView` table | Likely replaced wholesale by Datagrok grid. Custom interactions (right-click override, violet column tint) need plugin-API equivalents or accept reduction. |
| Filter bar | `FilterSelect` / `FilterMultiSelect` / `FilterSearch` + view-level filter state | Replaced by platform filter primitives. Sendex's "all filters live in URL" model maps to Datagrok layouts. |
| Layout (rail / center / context-panel split) | `App.tsx` flex shell + `useResizePanel` hook | Datagrok has docking / layout primitives; the sendex split likely doesn't transfer 1:1, will need re-design at migration. |
| Selection broadcasting | React state + URL sync | Datagrok platform-level selection events; conceptually similar but the API is different. |
| Theming | `frontend/src/index.css` CSS custom properties + Tailwind | Datagrok theming primitives; sendex's tokens become migration inputs, not migration outputs. |
| Plugin packaging | `npm run build` Vite app | Datagrok package format (TypeScript + webpack + manifest); different toolchain. |

The strategic implication, per `project_datagrok_target.md`: every architectural decision must preserve the migration path. In design-system terms, this means **decisions that maximise *replaceability* of UI surfaces are worth more than decisions that maximise *polish* of the current React app.** A bespoke chart that's perfectly tuned for sendex's current viewport but buried in custom interaction logic is harder to migrate than a less-polished chart that uses a clean data interface and minimal custom interactions.

What's already shipped in Datagrok-aware spirit:

- **Token-based theming.** CSS custom properties + design-tokens.ts mean the colour layer is already isolated; migration to Datagrok theme tokens is a remap, not a rewrite.
- **Standard chart types via ECharts.** ECharts is closer to Datagrok viewers (declarative, data-driven, configuration-as-data) than raw SVG with imperative React state. Most migrations will be ECharts config → Datagrok viewer config, not "rewrite from scratch."
- **`/lattice:design` Step 4 (Technology selection) explicitly biases toward ECharts for standard chart types.** "Don't reinvent axes, tooltips, and legends" is the right discipline for migration; raw-SVG is reserved for layouts ECharts can't express.
- **Persona model.** `docs/_internal/design-system/datagrok-app-design-patterns.md` already names the file "datagrok-app design patterns" and frames the work in Datagrok-platform terms (P1–P7 personas). The conceptual alignment was set early.

What's missing or actively migration-debt:

- **Bespoke right-click override interaction.** The violet column tint + corner triangle + `cell-overridable` class is a sendex-specific affordance with no clean Datagrok-platform analog (Datagrok grid context menus exist; the visual "this is overridable" indicator does not). Migration cost: re-design the override surface to use platform primitives, accept it looks different.
- **Custom rail/center/context-panel split layout.** Datagrok has docking; sendex has a custom resizable split. Layout migration likely re-renders the IA rather than 1:1 porting it.
- **No Datagrok `dg-developer` literature note despite a dedicated agent existing.** The `dg-developer` skill (per the skills list) is "Datagrok JS API expert for platform migration, feature mapping, optimal viewer selection, and porting guide production." That skill exists but the platform reference material it operates against is not in the literature corpus. This file fills that gap.

## Borrowed (implemented)

- **Persona-first design framing.** `docs/_internal/design-system/datagrok-app-design-patterns.md` § "User Personas" defines P1–P7 with mental models, primary views, and goals. Datagrok plugin design is persona-driven (a chemist's workflow vs a biologist's), and sendex inherited that. UX-audit walks operate on persona × workflow, which is the same primitive.
- **Token-isolated theming layer.** `frontend/src/index.css` + `design-tokens.ts` + the `--background` / `--muted` semantic CSS variables. This is Datagrok-migration-ready: themes swap by re-binding tokens, not by rewriting components.
- **ECharts as the default chart toolkit.** `commands/lattice/design.md` Step 4 + `frontend-ui-gate.md` Rule 6 catalogue ECharts as default for standard chart types, with raw-SVG reserved for non-standard layouts. ECharts → Datagrok viewer is a closer migration than React+SVG → Datagrok viewer.
- **Layouts as named, shareable configurations** (partial). Sendex stores filter and selection state in the URL — the conceptual cousin of Datagrok's named layouts. Not the same artefact, but the pattern (state-as-data, shareable by URL) is consistent.

## Proposed (not yet implemented)

- **Datagrok-viewer mapping table for every sendex chart.** A single table in `docs/_internal/design-system/` that maps each sendex chart component to its Datagrok-viewer migration target (or "custom viewer" if no platform equivalent). Cost: a one-day audit; the `dg-developer` skill is purpose-built to produce this. Benefit: migration debt becomes visible before migration starts; design changes can be pre-screened against migration cost.
- **Datagrok-aware migration-cost annotation in the audit-checklist.** Each rule that references a sendex-specific affordance (e.g., violet column tint, `OverridePill`, custom rail split) gets a `migration-cost: low/med/high` tag. Rules with `high` migration cost get extra scrutiny for whether they're worth the platform-divergence price. Cost: a column on the audit-checklist; mostly mechanical.
- **`dg-developer` consults this literature note.** Reference this file from the skill prompt so platform-migration questions land in a documented place rather than being re-derived per session.

## Rejected

- **Pre-emptive migration of any sendex view to Datagrok viewers *now*, before the migration milestone.** CLAUDE.md product thesis prioritises the toxicologist's workflow today; speculative platform-API porting before the platform-migration milestone would slow current work without delivering analytical value (rule 13 on no unprompted deferrals also applies in reverse — *no unprompted forward-port either*).
- **Shipping our own React component library for plugin reuse.** Datagrok plugins are not React component consumers; the integration surface is the platform JS API. Building a sendex-internal React component library aimed at plugin reuse would be designing for a consumer that doesn't exist.
- **Treating Datagrok platform conventions as design-system rules today.** The active design system is sendex's own (audit-checklist + design-decisions). Datagrok conventions become binding *at* migration; importing them now would mean enforcing rules whose semantics aren't yet operational.

## Evaluating

- **Whether to start a `docs/_internal/design-system/datagrok-migration-map.md` now or at migration kickoff.** Producing it now (with `dg-developer`) gives a baseline that drift can be measured against; producing it at migration kickoff is more accurate but later. Lean toward "now, regenerable" — the value is in catching design changes that increase migration cost while they're still cheap to revert.
- **Whether the bespoke right-click override pattern survives migration.** The violet column tint + `cell-overridable` + corner triangle convention has documented evidence of working as an affordance (per `.claude/rules/ux-audit-validate.md` Section 3a). Datagrok grid does not natively render it. The choice at migration: re-implement as a custom column-renderer in the plugin, accept loss of this affordance, or pre-emptively redesign. Today: keep the pattern; document the migration-cost flag.
- **Whether sendex should treat the Datagrok semantic-type system as informative.** Datagrok's column semantic types (`Subject`, `Dose`, `Endpoint`) are platform-level type tags. Sendex has analogous typing (TypeScript types on data shapes), but the platform-aware version (semantic-type tags emitted *from* the backend) might pay off for migration and for cross-plugin reuse. Currently no concrete pain points justifying this; revisit if migration starts.

## Cross-refs

- Pairs with: [`ibm-carbon-design-system.md`](ibm-carbon-design-system.md) — both are "host-platform" design systems; sendex relates to both as a guest. Carbon is conceptual prior art for tokens-and-governance; Datagrok is the actual migration target.
- Lattice skill that operates on this material: `dg-developer` (Datagrok JS API expert; per the skills list). This literature note is the reference material for that skill.
- Implemented borrows: persona model in `docs/_internal/design-system/datagrok-app-design-patterns.md`; token layer in `frontend/src/lib/design-tokens.ts` + `frontend/src/index.css`; ECharts default in `commands/lattice/design.md` Step 4 + `frontend-ui-gate.md` Rule 6.
- Proposed (not yet implemented): viewer-migration map (`docs/_internal/design-system/datagrok-migration-map.md`), `migration-cost` column in audit-checklist, `dg-developer` skill reference to this note.
- Memory: `project_datagrok_target.md` — sendex is a Datagrok plugin; preserve migration path. This note is the platform-side companion to that memory.
- Open question linked from this note: *which sendex affordances survive migration unchanged vs require redesign vs require platform-API extensions on the Datagrok side*. Answering this is `dg-developer`'s standing job.
