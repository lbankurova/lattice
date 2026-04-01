// Lattice — ESLint complexity rules
// Merge into your project's eslint.config.js
//
// Usage: Add these rules to your existing config's rules object:
//   import { latticeComplexityRules } from './eslint-complexity-rules.js'
//   ...
//   rules: { ...latticeComplexityRules }
//
// Or copy the rules object directly into your config.

export const latticeComplexityRules = {
  // McCabe cyclomatic complexity — max 15 per function
  // Domain-critical functions may override with inline disable + justification comment
  'complexity': ['warn', { max: 15 }],

  // Max lines per function — 200 for TS/TSX
  // Encourages splitting, but warn-only since some view components are legitimately large
  'max-lines-per-function': ['warn', {
    max: 200,
    skipBlankLines: true,
    skipComments: true,
  }],

  // Max nesting depth — 4 levels
  // Deep nesting is a readability problem; extract early returns or helper functions
  'max-depth': ['warn', { max: 4 }],

  // Max parameters per function — 5
  // More than 5 usually means the function needs an options object or decomposition
  'max-params': ['warn', { max: 5 }],
}
