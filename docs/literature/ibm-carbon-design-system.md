---
title: "Carbon Design System"
authors: IBM Design
year: 2014–present (v11 current)
url: https://carbondesignsystem.com
type: framework
read: 2026-04-26
status: partial
---

# IBM — Carbon Design System

## Source thesis

Carbon is IBM's open-source design system: a tokens-first, component-rich, multi-framework system shipped under Apache-2 with explicit governance, accessibility, and contribution processes. Verifiable shape (per `carbondesignsystem.com` and the `carbon-design-system/carbon` repo on GitHub):

1. **Tokens are the contract.** Color, typography, spacing, motion, and elevation are expressed as named tokens (`$layer-01`, `$spacing-05`, `$body-compact-01`). Components consume tokens; tokens are themed, not components. Themes (white / g10 / g90 / g100) swap token values without component churn.
2. **Components are the unit of reuse, with code + design + docs co-located.** Each component ships React / Web Components / Vue / Angular implementations, Figma libraries, usage docs, accessibility notes, and a "do / don't" page. The component is not "code" or "Figma" alone — it's the bundle.
3. **Accessibility is a first-class gate, not a polish step.** Every component publishes WCAG 2.1 conformance level + ARIA pattern + keyboard support up front. Components that can't meet AA in their default state aren't shipped as components.
4. **Governance is documented, public, and enforced via PRs.** The system has named contribution paths (incubator → core), a deprecation policy with explicit migration guides, and version-skew handling. Breaking changes have a publicly-documented cadence.
5. **The design system is itself a product**, with versioning, support windows, telemetry, and a team. Carbon v10 → v11 is a major migration with a published codemod.

The audience is "any team building IBM products, plus the open-source community." Scale: hundreds of internal teams; the discipline is necessary because the alternative (every team reinventing a button) is observably worse at IBM scale. The methodology generalises down to smaller systems but the *governance surface* doesn't — a one-team project doesn't need the migration / deprecation / contribution machinery.

## Translation

Carbon is what sendex's design system would look like if it were a product with hundreds of consumers instead of one. The relevant comparisons:

| Carbon primitive | Sendex equivalent | Notes |
|---|---|---|
| Token system (`$spacing-05`, `$layer-01`) | `frontend/src/lib/design-tokens.ts` + CSS custom properties in `frontend/src/index.css` | Sendex has tokens; they're not formally versioned, and the names are app-local (`--background`, `--muted`) rather than scale-based (`$layer-01`). |
| Theme swap (white / g10 / g90 / g100) | None (light theme only) | Carbon's theme model is robust because tokens carry semantic names. Sendex has only one theme; whether that ever changes depends on Datagrok plugin integration. |
| Component bundle (code + Figma + docs + a11y) | Code only (`frontend/src/components/`) + design-decisions tables | Sendex has *no* Figma source-of-truth, *no* per-component a11y notes, *partial* per-component docs (audit-checklist rules reference components but don't catalogue them). |
| Accessibility-as-gate | None as a hard gate; spot-checked at most | This is the largest unaddressed Carbon principle in sendex. The design-decisions tables enforce visual hygiene; they don't enforce keyboard / screen-reader support. |
| Governance (RFCs, deprecation, codemods) | CLAUDE.md rule 1 (design system changes require explicit user approval) | Sendex's governance is "ask the user." That's correct for a one-user project; it would not scale to multi-team. |
| Versioning of components | None | Components are edited in place. There's no "DoseResponseChartPanel v2 with migration path." Carbon's discipline becomes mandatory if the components are consumed by code outside this repo (e.g., a Datagrok plugin that imports from sendex). |

The single biggest delta is **accessibility-as-gate**. Sendex's audit-checklist has 79 visual rules and zero a11y rules. That's a real coverage gap, not just an aesthetic one — analytical apps have a small but legitimate user base of toxicologists who use screen-reader assistance for review work.

The second-biggest delta is **token semantic naming**. Carbon's tokens describe role (`$layer-01`, `$body-compact-01`); sendex's tokens describe value (`--muted`, `text-[10px]`). The role-based scheme is what makes Carbon's themes swap without component churn — it's a property worth borrowing if a dark theme or a Datagrok-platform-theme ever becomes a requirement.

## Borrowed (implemented)

- **Tokens-as-contract layer.** `frontend/src/lib/design-tokens.ts` + `frontend/src/index.css` CSS custom properties play this role. The hard rule "no invented hex values" (audit-checklist C-10) is the Carbon-style enforcement: components consume tokens, not raw hex.
- **Documented design decisions with hard tests.** Carbon publishes "do / don't" pages per component; sendex publishes the same pattern in `.claude/rules/design-decisions.md` (path-scoped, table-form, 79 rules with file:line citations). Different rendering, same primitive.
- **Governance gate on design-system changes.** CLAUDE.md rule 1 ("design system changes require explicit user approval") is the small-scale analog of Carbon's RFC process. Mechanism is right-sized for one user.

## Proposed (not yet implemented)

These are aspirational borrows derived from Carbon's principles. They are NOT in sendex today.

- **Accessibility audit checklist as a first-class gate.** Add an `A11Y` section to `docs/_internal/design-system/audit-checklist.md` with WCAG 2.1 AA rules: keyboard navigation completeness, focus-visible on every interactive element, ARIA roles on charts (or text-table fallback), color-contrast ratios on charts (already partially implied by C-29 grayscale rule), screen-reader label coverage on icon buttons (partially covered by K-02 tooltip rule but not for a11y specifically). The current 79 rules are visual; making this 79 + ~15 a11y rules closes a real coverage gap.
- **Semantic token naming alongside the value-based names.** Keep `--muted` for backwards compat but add a parallel role-based layer (`--surface-1` / `--surface-2` / `--text-primary` / `--text-secondary`) so that when a Datagrok plugin theme arrives, swapping the role-based tokens doesn't require touching components.
- **Per-component "page" in the design-system docs.** Today the audit-checklist references components by name but has no canonical reference for each. A one-page-per-component reference (props / dimensions / a11y / "do / don't" examples / linked rule IDs) is the Carbon-style component bundle, scaled down. This overlaps with Frost's "component catalogue" item; treat as a single deliverable.

## Rejected

- **Multi-framework component implementations (React + Web Components + Vue + Angular).** Sendex is React-only; even at Datagrok-plugin migration time, the platform JS API is the integration surface, not multi-framework component code. Carbon's multi-framework story exists because IBM products are heterogeneous; sendex is not.
- **Public governance machinery (RFC process, public roadmap, deprecation calendar, codemods).** All of this is right-sized for hundreds of consumers. For one user there's no "consumer" outside the project; CLAUDE.md rule 1 is sufficient governance. Re-evaluate only if a second project starts importing sendex components.
- **Versioned component API surface.** Same reason — there is no external consumer to break. In-place edits are appropriate and remain the cheaper option.
- **Figma-as-source-of-truth.** Sendex's authoritative design representation is the audit-checklist + design-decisions tables (markdown, grep-able, version-controlled). Adding Figma would create a synchronisation problem (two sources of truth, both editable, drift inevitable). Carbon's Figma libraries solve a problem sendex doesn't have (designers who don't read code).
- **Theme system (light / dark / contrast / branded).** Sendex is single-theme by deliberate choice — analytical viewing environments are well-lit and the saturated-color budget per the audit-checklist (C-29 / C-35) assumes a light substrate. Multi-theme would be reconsidered only at Datagrok plugin migration, when host-platform theming becomes a real constraint.

## Evaluating

- **Which Carbon-style accessibility rules to encode now vs at Datagrok migration.** The minimum set (keyboard navigation completeness, focus-visible, alt text on icon buttons, chart-as-table fallback) is universal — could land any time. The maximum set (full WCAG 2.1 AA gate per component) is more work and less obviously needed for the current single-toxicologist user. Worth a focused decision memo before writing rules.
- **Whether the role-based token layer (`--surface-1` etc.) is worth adding speculatively.** Carbon's decoupling pays off when themes swap; sendex has no theme swap planned. The argument *for* speculative addition: cheap (a few token aliases), no behavioural change, futures-friendly. The argument *against*: a violation of CLAUDE.md rule 13 ("no unprompted deferrals" applies to features, but a parallel argument applies to "no speculative abstractions"). Lean toward "wait until Datagrok migration is real."

## Cross-refs

- Pairs with: [`frost-atomic-design.md`](frost-atomic-design.md) — Frost is the methodology, Carbon is one large-scale shipped instance with governance attached.
- Pairs with: [`datagrok-platform-docs.md`](datagrok-platform-docs.md) — Datagrok is the platform sendex is migrating to; some Carbon principles (theme-via-tokens, host-platform component reuse) become more relevant after that migration.
- Implemented borrows: `frontend/src/lib/design-tokens.ts`, `frontend/src/index.css` (CSS custom properties), `.claude/rules/design-decisions.md` (decisions-tables), `docs/_internal/design-system/audit-checklist.md` (testable rules), `CLAUDE.md` rule 1 (governance gate).
- Proposed (not yet implemented): A11Y rules in audit-checklist; semantic-role token aliases; per-component reference pages.
- Open question linked from this note: accessibility-as-gate is the largest unaddressed Carbon principle in sendex. Either land the minimum rule set or document the explicit rejection.
