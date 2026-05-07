/**
 * Project + platform manifest loader.
 *
 * Reads `lattice-project.toml` and (optionally) `lattice-platform.toml` from
 * a project root and surfaces the values to:
 *   - Skill bodies via `{{lattice.x.y}}` / `{{platform.x.y}}` template
 *     namespaces (resolved in template.ts).
 *   - Multi-paragraph project content via `{{include:project.x.y}}` (the
 *     value at x.y is a path; the file's contents are inlined).
 *   - Shell scripts via env vars (LATTICE_PROJECT_<BUCKET>_<KEY>, ...) when
 *     the caller invokes `surfaceManifestEnv()`.
 *
 * Schema spec: lattice/docs/lattice-project-spec.md.
 *
 * The TOML parser is a documented subset of TOML 1.0 sufficient for the
 * schema in the spec:
 *   - Section headers: [a], [a.b], [a.b.c]
 *   - String values: key = "value" (NO escape sequences, NO multi-line)
 *   - Integer values: key = 123 (signed; no floats, hex, underscores)
 *   - Array of strings/integers: key = ["a", "b"], multi-line allowed
 *   - # comments at line start or end of line
 *
 * Aborts with ManifestError on unsupported syntax. Switch to a full TOML
 * parser when the schema starts requiring float / boolean / inline-table /
 * multiline-string values.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export class ManifestError extends Error {
  constructor(message: string, file?: string, line?: number) {
    const where = file ? (line !== undefined ? `${file}:${line}` : file) : '';
    super(where ? `${where}: ${message}` : message);
    this.name = 'ManifestError';
  }
}

/** Parsed TOML leaf. Sections (objects) are TomlSection; values are these. */
export type TomlValue = string | number | TomlValue[] | TomlSection;
export interface TomlSection {
  [key: string]: TomlValue;
}

export interface Manifest {
  /** Absolute path to the project root. */
  projectRoot: string;
  /** Parsed lattice-project.toml. Empty object when file absent. */
  project: TomlSection;
  /** Parsed lattice-platform.toml. Empty object when file absent. */
  platform: TomlSection;
  /** True when lattice-project.toml was present (greenfield-no-config = false). */
  hasProject: boolean;
  /** True when lattice-platform.toml was present. */
  hasPlatform: boolean;
}

export const UNDEFINED_SENTINEL_PREFIX = '<<UNDEFINED:';
export const UNDEFINED_SENTINEL_SUFFIX = '>>';

/**
 * Load the manifest from a project root. Either TOML may be absent; consumers
 * that require a key call lookupKey() and decide how to handle undefined
 * (abort vs skip vs sentinel) at their own boundary.
 */
export function loadManifest(projectRoot: string): Manifest {
  const root = resolve(projectRoot);
  const projectPath = resolve(root, 'lattice-project.toml');
  const platformPath = resolve(root, 'lattice-platform.toml');

  const hasProject = existsSync(projectPath);
  const hasPlatform = existsSync(platformPath);

  const project = hasProject ? parseToml(readFileSync(projectPath, 'utf-8'), projectPath) : {};
  const platform = hasPlatform ? parseToml(readFileSync(platformPath, 'utf-8'), platformPath) : {};

  return { projectRoot: root, project, platform, hasProject, hasPlatform };
}

/**
 * Look up a dotted key in a section tree.
 *   lookupKey({a:{b:{c:"x"}}}, "a.b.c") -> "x"
 *   lookupKey({a:{b:1}}, "a.x")          -> undefined
 *
 * Returns the raw TomlValue (string / number / array / sub-section). Use
 * formatValue() to convert to a substitution string.
 */
export function lookupKey(section: TomlSection, dottedKey: string): TomlValue | undefined {
  const parts = dottedKey.split('.');
  let cur: TomlValue | undefined = section;
  for (const p of parts) {
    if (cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as TomlSection)[p];
  }
  return cur;
}

/**
 * Render a value as the template substitution string.
 *   undefined         -> "<<UNDEFINED:dottedKey>>"
 *   string            -> as-is (empty string is a valid empty substitution)
 *   number            -> "123"
 *   array             -> join with newlines (suitable for code-fence command lists)
 *   sub-section       -> "<<UNDEFINED:dottedKey:object>>" (objects are not directly templatable)
 */
export function formatValue(v: TomlValue | undefined, dottedKey: string): string {
  if (v === undefined) return `${UNDEFINED_SENTINEL_PREFIX}${dottedKey}${UNDEFINED_SENTINEL_SUFFIX}`;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(item => formatValue(item, dottedKey)).join('\n');
  return `${UNDEFINED_SENTINEL_PREFIX}${dottedKey}:object${UNDEFINED_SENTINEL_SUFFIX}`;
}

/**
 * Surface the project-side TOML as a flat env-var record.
 *   project.[runtime] build_command = "X"  ->  LATTICE_PROJECT_RUNTIME_BUILD_COMMAND=X
 *   project.[project.docs] todo = "Y"     ->  LATTICE_PROJECT_PROJECT_DOCS_TODO=Y
 *
 * Arrays are joined with newlines. Sub-sections recurse. Empty strings are
 * preserved (they're meaningful "intentionally undefined" markers in the
 * scaffold template). Integer values stringify via String().
 */
export function surfaceManifestEnv(manifest: Manifest): Record<string, string> {
  const env: Record<string, string> = {};
  walk(manifest.project, ['LATTICE', 'PROJECT'], env);
  walk(manifest.platform, ['LATTICE', 'PLATFORM'], env);
  return env;
}

function walk(section: TomlSection, prefix: string[], env: Record<string, string>): void {
  for (const [key, value] of Object.entries(section)) {
    const upperKey = toEnvSegment(key);
    const path = [...prefix, upperKey];
    if (value === null) continue;
    if (typeof value === 'string') {
      env[path.join('_')] = value;
    } else if (typeof value === 'number') {
      env[path.join('_')] = String(value);
    } else if (Array.isArray(value)) {
      env[path.join('_')] = value
        .map(item => (typeof item === 'string' ? item : typeof item === 'number' ? String(item) : ''))
        .join('\n');
    } else if (typeof value === 'object') {
      walk(value as TomlSection, path, env);
    }
  }
}

function toEnvSegment(key: string): string {
  return key.toUpperCase().replace(/-/g, '_');
}

// ───── Minimal TOML 1.0 subset parser ─────────────────────────────────

function parseToml(input: string, file: string): TomlSection {
  const root: TomlSection = {};
  let cur: TomlSection = root;

  const rawLines = input.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < rawLines.length) {
    const lineNo = i + 1;
    const line = rawLines[i].trim();
    if (line === '' || line.startsWith('#')) { i++; continue; }

    if (line.startsWith('[')) {
      const m = line.match(/^\[\s*([A-Za-z0-9_\-.]+)\s*\]\s*(?:#.*)?$/);
      if (!m) throw new ManifestError(`Invalid section header: ${line}`, file, lineNo);
      cur = ensureSection(root, m[1].split('.'), file, lineNo);
      i++; continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) throw new ManifestError(`Expected 'key = value', got: ${line}`, file, lineNo);
    const key = line.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_\-]*$/.test(key)) {
      throw new ManifestError(`Invalid key name: ${key}`, file, lineNo);
    }

    let valueText = line.slice(eqIdx + 1).trim();
    // Multi-line array? Accumulate continuation lines until brackets balance.
    if (valueText.startsWith('[') && !arrayClosesOnSameLine(valueText)) {
      i++;
      while (i < rawLines.length) {
        const more = rawLines[i].trim();
        if (more === '' || more.startsWith('#')) { i++; continue; }
        valueText += ' ' + more;
        if (arrayClosesOnSameLine(valueText)) { i++; break; }
        i++;
      }
      if (!arrayClosesOnSameLine(valueText)) {
        throw new ManifestError(`Unterminated array starting on this line`, file, lineNo);
      }
    } else {
      i++;
    }

    cur[key] = parseValue(valueText, file, lineNo);
  }
  return root;
}

function ensureSection(root: TomlSection, parts: string[], file: string, lineNo: number): TomlSection {
  let cur: TomlSection = root;
  for (const p of parts) {
    const next = cur[p];
    if (next === undefined) {
      const created: TomlSection = {};
      cur[p] = created;
      cur = created;
    } else if (typeof next === 'object' && !Array.isArray(next)) {
      cur = next as TomlSection;
    } else {
      throw new ManifestError(`Section path '${parts.join('.')}' conflicts with existing scalar/array key`, file, lineNo);
    }
  }
  return cur;
}

function arrayClosesOnSameLine(text: string): boolean {
  let depth = 0;
  let inString = false;
  for (let j = 0; j < text.length; j++) {
    const c = text[j];
    if (c === '"' && (j === 0 || text[j - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return true;
    }
    else if (c === '#' && depth === 0) return false;
  }
  return false;
}

function parseValue(text: string, file: string, lineNo: number): TomlValue {
  const stripped = stripTrailingComment(text).trim();
  if (stripped === '') {
    throw new ManifestError(`Empty value`, file, lineNo);
  }

  if (stripped.startsWith('"')) {
    if (!stripped.endsWith('"') || stripped.length < 2) {
      throw new ManifestError(`Unterminated string`, file, lineNo);
    }
    return stripped.slice(1, -1);
  }

  if (stripped.startsWith('[')) {
    if (!stripped.endsWith(']')) {
      throw new ManifestError(`Unterminated array`, file, lineNo);
    }
    const inner = stripped.slice(1, -1).trim();
    if (inner === '') return [];
    return splitArrayItems(inner, file, lineNo).map(item => parseValue(item, file, lineNo));
  }

  if (/^-?\d+$/.test(stripped)) {
    return parseInt(stripped, 10);
  }

  throw new ManifestError(`Unsupported value type: ${stripped}`, file, lineNo);
}

function stripTrailingComment(text: string): string {
  let inString = false;
  for (let j = 0; j < text.length; j++) {
    const c = text[j];
    if (c === '"' && (j === 0 || text[j - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (!inString && c === '#') return text.slice(0, j).trimEnd();
  }
  return text;
}

function splitArrayItems(inner: string, _file: string, _lineNo: number): string[] {
  const items: string[] = [];
  let buf = '';
  let inString = false;
  let depth = 0;
  for (let j = 0; j < inner.length; j++) {
    const c = inner[j];
    if (c === '"' && (j === 0 || inner[j - 1] !== '\\')) {
      inString = !inString;
      buf += c;
      continue;
    }
    if (inString) { buf += c; continue; }
    if (c === '[') depth++;
    else if (c === ']') depth--;
    if (c === ',' && depth === 0) {
      const trimmed = buf.trim();
      if (trimmed !== '') items.push(trimmed);
      buf = '';
      continue;
    }
    buf += c;
  }
  const trimmed = buf.trim();
  if (trimmed !== '') items.push(trimmed);
  return items;
}
