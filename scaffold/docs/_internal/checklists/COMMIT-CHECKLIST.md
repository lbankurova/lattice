# Agent Commit Checklist

Run every item before committing changes that alter system or view behavior. Every item must PASS.

---

- [ ] **1. Tests pass.** Run `npm test`. All assertions must pass. If a test fails, the fix is wrong — do not commit. If the fix intentionally changes behavior, update the test first and explain why.

- [ ] **2. Spec updated.** If you changed how a system or view works, update the corresponding `docs/_internal/architecture/*.md` or `docs/_internal/views/*.md` to match. Specs must reflect code, not the other way around.

- [ ] **3. MANIFEST.md marked.** Set "Last validated" to today for any spec you updated in `docs/_internal/MANIFEST.md`. If you can't update the spec, mark it `STALE — <reason>`.

- [ ] **4. Incoming specs checked.** Check `docs/_internal/incoming/` for feature specs that conflict with your changes. If a conflict exists, ask the user before committing.

- [ ] **5. TODO.md updated.** If your commit resolves an open item in `docs/_internal/TODO.md`, mark it done with strikethrough + commit hash. If you discover a new issue, add it.

- [ ] **5b. ROADMAP.md updated.** If your commit completes a ROADMAP item in `docs/_internal/ROADMAP.md`, mark it done with ~~strikethrough~~. If new strategic work surfaces (not a bug — an epic, feature, or improvement), add it to the appropriate area.

- [ ] **6. Knowledge docs updated (if analytical logic changed).** Skip if commit only touches UI, docs, or tests without changing analytical logic or field contracts.
  - Statistical test / algorithm / scoring formula changed → update `docs/_internal/knowledge/methods.md` (scan `docs/_internal/knowledge/methods-index.md` first)
  - Computed field at engine→UI boundary changed → update `docs/_internal/knowledge/field-contracts.md` (scan `docs/_internal/knowledge/field-contracts-index.md` first)
  - Backend output field changed → update `docs/_internal/knowledge/api-field-contracts.md`

- [ ] **7. UI components verified.** Every UI primitive (selects, dialogs, tooltips, popovers, badges, buttons) uses the project's component library. No raw HTML equivalents where a library component exists.

- [ ] **8. Architecture spec exists.** Does `docs/_internal/architecture/` have a spec for the subsystem you touched? If yes, update it to reflect your changes. If no, create one from the code. Skip if commit only touches UI styling, docs, or tests.

- [ ] **9. Frontend build passes.** Run `npm run build`. TypeScript compilation must succeed with zero errors. Skip if commit only touches backend or docs.

- [ ] **10. Nullable contract fields null-guarded at consumption.** If you added or changed a nullable field, verify every UI consumption site handles `null`/`undefined` — `?? fallback`, optional chaining, or conditional render.

---

**Data pipeline bug fix protocol:** Write the failing test FIRST, then apply the fix, then confirm all tests pass. Non-negotiable for any data transformation, classification, or scoring module.

**Agent verification boundaries:** Agents verify logic (`npm test`, `npm run build`, grep-based static checks). Agents do NOT verify visuals. If a change affects rendering, state: "Visual verification required by user."
