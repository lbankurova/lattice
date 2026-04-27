---
title: "Atomic Design"
authors: Brad Frost
year: 2016
url: https://atomicdesign.bradfrost.com
type: book
read: 2026-04-26
status: partial
---

# Frost — Atomic Design

## Source thesis

Frost argues UI is not a deliverable artefact but a *system of reusable parts*, and the system itself is the product. The chemistry metaphor names five tiers of granularity at which interface elements are designed, named, and tested:

- **Atoms** — the smallest functional UI element (button, input, label, swatch).
- **Molecules** — small assemblies of atoms that do one job (search field = label + input + button).
- **Organisms** — larger, self-contained sections (header, comment thread, dose-response chart with legend).
- **Templates** — page-level skeletons composed of organisms, with placeholder content.
- **Pages** — templates filled with real content, where the system meets reality.

Three load-bearing claims sit underneath the taxonomy:

1. **Front-end style guides are the deliverable, not the page comps.** Every approved component has a canonical reference (the pattern library) and pages are *consequences* of the library. Page-level redesigns mostly turn into library edits, not bespoke pixel work.
2. **Naming is the design system.** A team that names its parts in shared vocabulary (atoms / molecules / organisms or any equivalent) can debate them; a team without names cannot. Frost is agnostic about the specific words — what matters is that *one* shared lexicon exists.
3. **Pages are where systems break.** Real content (long names, missing fields, low N, RTL text) exposes the seams in molecules and organisms. The discipline is to take page-level breakage *back* to the library, not patch the page.

Frost's audience is "designers and developers shipping interfaces"; his stated emphasis is consumer / marketing / publishing UIs. The methodology generalises to analytical UIs, but the friction points differ — atom-level proliferation is much smaller in a data-heavy app than in a marketing site.

## Translation

Sendex already operates a partial atomic-design system without using Frost's vocabulary. The mapping:

| Frost tier | Sendex equivalent | Authoritative location |
|---|---|---|
| Atoms (raw tokens) | Design tokens, severity scales, dose label utilities | `frontend/src/lib/design-tokens.ts`, `frontend/src/lib/severity-colors.ts`, `frontend/src/lib/dose-label-utils.ts` |
| Molecules | Reusable components (`DoseLabel`, `OverridePill`, `PanePillToggle`, `CollapsiblePane`, `FilterMultiSelect`) | `frontend/src/components/ui/`, `frontend/src/components/analysis/panes/` |
| Organisms | Charts + tables (`DoseResponseChartPanel`, `FindingsTable`, `OrganGroupedHeatmap`, `IncidenceRecoveryChart`) | `frontend/src/components/charts/`, `frontend/src/components/analysis/` |
| Templates | View shells (rail + center + context-panel split) | `App.tsx`, view-level files in `frontend/src/views/` |
| Pages | Persona × workflow walks | `docs/_internal/audits/workflow-audits/{persona}-{workflow}/` (where pages-meet-reality is *audited*, not assembled) |

What's already shipped in Frost's spirit, even though "atomic design" isn't named in any sendex doc:

- A canonical-utilities convention that the design-decisions tables enforce ("use `getDoseLabel()`, not manual concatenation"). This is Frost's "library is the deliverable" applied at the function level rather than the component level.
- The "pages break the system" insight is exactly what `/lattice:ux-audit-walk` produces: a Playwright walk of a real persona × real fixture is the pages step, surfacing seams that the audit-checklist couldn't predict.
- The "Reference Component" requirement in `commands/lattice/design.md` Step 1 ("find an existing pattern") and `frontend-ui-gate.md` Rule 0 ("Copy before creating") are the Frost discipline of *no new atoms without justification*.

What's missing:

- **No tier vocabulary.** Sendex never says "this is a molecule" or "this is an organism." That's mostly fine for a single-frontend project — the four explicit names in the table above are enough — but if multi-plugin reuse becomes real (Datagrok plugin migration), having a shared lexicon at the molecule / organism level becomes high-value, because cross-plugin reuse needs a *name*.
- **No public component catalogue.** There is no Storybook, no rendered library, no live preview of every approved component. The audit-checklist enumerates rules but not parts. In Frost's framing this is "we have the rules but not the inventory."
- **No published "page" library.** Pages-meet-reality is audited per-walk, but there's no canonical "this is what the NOAEL workflow page looks like with the canonical fixture" reference. Workflow audits are scoped to defects; they're not full canonical reference renders.

## Borrowed (implemented)

- **Library-as-product discipline at the utility layer.** `dose-label-utils.ts` has three documented tiers (`getDoseLabel` / `shortDoseLabel` / `doseAbbrev`) and the design-decisions table forbids manual concatenation. `severity-colors.ts` exports `formatPValue` / `formatEffectSize` and the table forbids manual `toFixed`. This is Frost's "the library is the source of truth, not the page" applied to functions rather than components.
- **Reference-component pattern.** `commands/lattice/design.md` Step 1 mandates "find an existing pattern first." `.claude/rules/frontend-ui-gate.md` Rule 0 names this "Copy before creating." Both encode Frost's "consult the library before drafting a new atom."
- **Pages-stress-the-system loop.** `/lattice:ux-audit-walk` runs a persona × fixture against the real app via Playwright; the validate stage filters walk-time hypotheses against the rule files. This is Frost's "pages expose seams the library missed," operationalised as a 3-stage audit pipeline.

## Proposed (not yet implemented)

- **Shared tier vocabulary in design-decisions.md.** Add a one-row table at the top of `.claude/rules/design-decisions.md` mapping the four sendex tiers (token, component, view-section, view) to Frost's atom/molecule/organism/template names. Cost: a few lines of doc. Benefit: when multi-plugin migration begins, the shared lexicon is already there.
- **Component catalogue page.** A `docs/_internal/design-system/component-catalogue.md` (or rendered MDX) that lists every reusable component with a one-line role, dimensions, and a reference screenshot. Today `frontend-ui-gate.md` Rule 6 has a partial table ("use this / not this") but it's a *negation* table, not a catalogue. The catalogue would be the positive form.
- **Canonical fixture pages.** A small set of "this is the NOAEL workflow page on PointCross" reference renders, captured by Playwright at known viewport sizes, that serve as the canonical "page meets reality" baseline. Drift between catalogue and these baselines becomes a lint signal.

## Rejected

- **Strict atom/molecule/organism naming for tokens and small UI parts.** Sendex has ~3 tokens-files and ~30 reusable components. The cardinality doesn't justify a 5-tier nomenclature; the existing 4-bucket mapping (token / component / view-section / view) is sufficient and grep-friendlier than the chemistry metaphor.
- **Storybook (or equivalent isolated-component preview).** Frost recommends a live pattern library; sendex has the audit-checklist + design-decisions tables instead. Storybook is high-overhead for a single-frontend project where the components are already exercised by real views every dev session. *Revisit if* multi-plugin reuse becomes real — at that point a Datagrok-plugin-aware preview surface might be warranted (see `datagrok-platform-docs.md`).
- **"The library is the deliverable, the pages are byproducts" stance at the workflow level.** Sendex is an analytical tool, not a publishing CMS. The deliverable IS the analytical workflow — the toxicologist evaluating PointCross at 8am. Library-first is a means; the analytical output is the end. Frost's framing inverts that for marketing/publishing UIs; we keep the analytical-output-first framing per CLAUDE.md product thesis.

## Evaluating

- **Whether to formalise tier vocabulary now or wait for the Datagrok plugin migration.** The cost is low either way (a documentation edit). The trigger for "now" would be a second frontend project (e.g., a Datagrok plugin) needing to share components with sendex; until that exists, "later" is fine.
- **Whether the audit-checklist and design-decisions tables together already constitute a "pattern library" in Frost's sense, or whether a positive-form component catalogue (Proposed item 2 above) is genuinely missing.** The negation framing of frontend-ui-gate Rule 6 may be sufficient — if every "don't use X / use Y" row implicitly catalogues Y, the catalogue is *almost* there in inverted form. Worth a deliberate read of Rule 6 with this question in mind before writing a separate catalogue.

## Cross-refs

- Pairs with: [`appleton-pattern-languages.md`](appleton-pattern-languages.md) — Frost gives the granularity tiers; Appleton (via Christopher Alexander) gives the deeper pattern-language framing. Together they cover "what is a pattern" + "how do patterns relate."
- Pairs with: [`ibm-carbon-design-system.md`](ibm-carbon-design-system.md) — Carbon is the case-study instantiation of Frost's principles at scale (with explicit governance + accessibility); Frost is the methodology, Carbon is one shipped artefact.
- Implemented borrows: `frontend/src/lib/design-tokens.ts`, `frontend/src/lib/dose-label-utils.ts`, `frontend/src/lib/severity-colors.ts`, `commands/lattice/design.md` Step 1, `.claude/rules/frontend-ui-gate.md` Rule 0 + Rule 6, `commands/lattice/ux-audit-walk.md` (pages-stress-the-system loop).
- Proposed (not yet implemented): tier-vocabulary row in `design-decisions.md`, `docs/_internal/design-system/component-catalogue.md`, canonical fixture-page baselines.
- Sendex design-system docs informed: `docs/_internal/design-system/audit-checklist.md` (the rule layer), `docs/_internal/design-system/datagrok-app-design-patterns.md` (the pattern-library layer).
