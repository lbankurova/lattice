# Design Decisions — Project-Specific (Layer 2)

> These decisions apply to THIS project. Platform-level (Layer 1) decisions are inherited
> from the Lattice framework's `.claude/rules/design-decisions.md`.
> When in doubt, choose the most conservative option (neutral gray, smallest spacing, no color).

---

## 1. Color Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| <!-- Add project-specific color rules here --> | | |

## 2. Typography Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| <!-- Add project-specific typography rules here --> | | |

## 3. Spacing Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| <!-- Add project-specific spacing rules here --> | | |

## 4. Component Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| <!-- Add project-specific component rules here --> | | |

## 5. Layout Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| <!-- Add project-specific layout rules here --> | | |

## 6. Casing Decisions

| Situation | Use | Don't Use |
|-----------|-----|-----------|
| <!-- Add project-specific casing rules here --> | | |

## Fallback Protocol

When building a UI element that doesn't match any table row above or in Layer 1:

1. **State which rows were considered** and why they don't apply
2. **Default to the most conservative option:** neutral gray, smallest standard spacing, no color, `text-xs`
3. **Flag with comment:** `// DESIGN-REVIEW: no table match for [element description]`
