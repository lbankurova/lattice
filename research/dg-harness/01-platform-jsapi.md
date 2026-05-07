# 01 — Platform: Datagrok JS API Surface and `grok check` Build Validator

> **Scope:** evidence base for the *platform pillar* of the harness. Catalogues the JS API surface that any plugin agent must reason against, the `grok check` validator that defends the API contract today, and what shape the help docs would need to be agent-fuel rather than agent-toil.
>
> **Sibling:** `02-plugin-scaffolds.md` (plugin scaffold + agent-callable helpers).
>
> **Source repo:** `C:/datagrok/public/` (the public Datagrok monorepo). Every concrete claim cites `path:line`.

---

## 1. Already known (cite-and-build)

These rows in the prior corpus are the points of departure. This document deepens, doesn't restate.

- **README.md:283-297, "Worked translation: Datagrok plugin development"** lists the three import namespaces (`grok`, `ui`, `dg`), 76+ reference packages, function metadata as a contract triangle, `grok check`, `grok api`, webpack externals, `package-test.ts`. *Builds on:* this doc verifies each claim against source and adds the `file:line` anchors the README does not carry.
- **README.md:286 hooks row** asserts `grok check` validates "package signatures, imports, package.json, changelog." *Builds on:* §3 below confirms all four and adds the next-tier checks (heavy-import linter, sourcemap presence, `.npmignore` hygiene, npm-name regex, `datagrok-api` deep-import block) the prior corpus does not name.
- **README.md:288, "Verdict-enum registry equivalent — None"** notes typed registries of viewer-property types and `DG.SEMTYPE.*` are aspirational. *Builds on:* §2.6 below enumerates the 28 ship-installed semantic types and the `SemTypeInfo` shape used to register new ones.
- **README.md:289, knowledge-artifacts row** points at `help/develop/`, `CONTRIB.md`, per-package `README.md`. *Builds on:* §5 inventories `help/` (569 markdown files; 98 in `help/develop/`) and verdicts each cluster's agent-readability.
- **harness-for-datagrok.md:163-220** disambiguates skill / role / agent / team. *Out of scope here* — that's framework taxonomy, not platform evidence.
- **datagrok-harness-workplan.md:77 (W1.A1)** — the component map is to be authored. This document supplies the file:line anchors a future component map would link to.

---

## 2. JS API surface

### 2.1 Three namespaces

| Namespace | Source export | Purpose | What it re-exports |
|---|---|---|---|
| `grok` | `js-api/grok.ts:11-38` | High-level singleton APIs | `functions`, `events`, `dapi`, `shell`, `settings`, `data`, `userSettings`, `ai`, `log`; plus barrel-exports of `chem`, `ml`, `decorators/functions` |
| `ui` | `js-api/ui.ts:1-100` (2799 lines total) | UI element constructors and Widget factories | `element()`, `appendAll()`, `empty()`, `setClass()`, `render()`, plus dialog/menu/input helpers — entirely composed of free functions over `Widget` and HTML |
| `dg` | `js-api/dg.ts:8-43` | Type/class/constant re-export surface | Re-exports `interfaces/d4`, `const`, `events`, `dapi`, `dataframe`, `entities`, `api/ddt.api.g`, `api/grok_shared.api.g`, `api/d4.api.g`, `shell`, `functions`, `grid`, `color`, `widgets`, `views/view`, `views/card_view`, `views/files_view`, `views/multi_view`, `viewer`, `docking`, `wrappers_impl`, `ui/wizard`, `utils`, `sticky_meta`, `data`, `helpers`, `logger`, `chem`, `ml`, `proxies`, `utils_convert`, `ui/tree-view` |

The three-namespace pattern is enforced at build time — see §3.2 (`checkDatagrokApiImports`) which blocks any deep import like `datagrok-api/foo` other than `dg`, `grok`, `ui`, or the legacy `datagrok` alias (`tools/bin/commands/check.ts:218`).

`dg.ts` also installs four window globals at module load (`js-api/dg.ts:47-69`): `window.$`, `window.dayjs`, `window.wu`, `window.grok`, `window.ui`, plus a global error / unhandled-rejection forwarder that calls into `window.grok_Unhandled_Error`. **Implication for agent harnessing:** plugin code can assume `grok`, `ui`, `DG` are global at runtime — the `globals.d.ts` at repo root (`C:/datagrok/public/globals.d.ts:1-9`) declares them as ambient typings. Agents writing snippets need not import the namespaces, but webpack externals (`datagrok-api/dg`, `datagrok-api/grok`, `datagrok-api/ui`) remain mandatory at build time.

### 2.2 Class hierarchy (mounted-UI side)

Inheritance traced from source. All paths under `js-api/src/`.

```
Widget                          (widgets/base.ts:195)
├── DartWidget                  (widgets/base.ts:348)
│   └── BrowsePanel             (views/view.ts:698)
├── ViewBase                    (views/view.ts:46)
│   └── View                    (views/view.ts:212)
│       ├── TableView           (views/view.ts:382)
│       ├── ScriptView          (views/view.ts:655)
│       ├── DataQueryView       (views/view.ts:673)
│       └── DockView            (views/view.ts:683)
└── Viewer<TSettings>           (viewer.ts:77)
    ├── JsViewer                (viewer.ts:374)
    ├── FilterGroup             (viewer.ts:505)
    ├── LineChartViewer         (viewer.ts:572)
    ├── ScatterPlotViewer       (viewer.ts:606)
    ├── HistogramViewer         (viewer.ts:666)
    ├── BarChartViewer          (viewer.ts:677)
    ├── PieChartViewer          (viewer.ts:691)
    ├── PcPlot                  (viewer.ts:699)
    ├── BoxPlot                 (viewer.ts:708)
    ├── CorrelationPlot         (viewer.ts:727)
    ├── ConfusionMatrix         (viewer.ts:735)
    ├── RocCurve                (viewer.ts:741)
    ├── CalendarViewer          (viewer.ts:748)
    ├── PivotViewer             (viewer.ts:756)
    └── TrellisPlotViewer       (viewer.ts:777)
```

**Key navigation rules a component map must encode:**

- *"Custom JS viewer"* → extend `JsViewer` (`viewer.ts:374`); the entity template at `tools/entity-template/viewer-class.ts:9` confirms this. **Not** `Viewer` directly — `JsViewer`'s constructor allocates a Dart-side `grok_Viewer_FromJsViewer` host (`viewer.ts:388`), without which the platform cannot dispatch property/event traffic.
- *"Custom view"* → extend `ViewBase` (`views/view.ts:46`) when the view is fully custom; extend `View` (`views/view.ts:212`) only when a Dart-side host already exists (it doesn't, for plugin code). The constructor comment at `views/view.ts:43-46` documents this: "Subclass ViewBase to implement a Datagrok view in JavaScript."
- *"DataFrame-bound view"* → use `TableView` (`views/view.ts:382`) — created via `TableView.create(table, addToWorkspace)` (`views/view.ts:389`), not subclassed.

### 2.3 DataFrame core

`Column` is generic over value type (`dataframe/column.ts:24`): `Column<T = any, TInit = T>`. Specialized subclasses (`dataframe/column.ts:484-575`):

- `FloatColumn extends Column<number>`
- `BigIntColumn extends Column<BigInt>`
- `DateTimeColumn extends Column<dayjs.Dayjs, DateTimeInit>`
- `ObjectColumn extends Column<any>`
- `DataFrameColumn extends Column<DataFrame>`

`DataFrame` (`dataframe/data-frame.ts:47`) is the central data structure. Helper classes attached to a `DataFrame` instance are class-level: `DataFrameMetaHelper` (line 517), `DataFramePlotHelper` (line 540), `DataFrameDialogHelper` (line 563). Sub-modules under `js-api/src/dataframe/`:

| File | Contents |
|---|---|
| `types.ts` | Type aliases: `RowPredicate`, `Comparer`, `ColumnId` |
| `qnum.ts` | `Qnum` — qualified number with comparison operators |
| `bit-set.ts` | `BitSet` — efficient boolean array |
| `stats.ts` | `Stats`, `GroupByBuilder` |
| `column.ts` | `Column` and typed variants |
| `column-list.ts` | `ColumnList` |
| `column-helpers.ts` | `ColumnMetaHelper`, `ColumnColorHelper`, `ColumnMarkerHelper` |
| `row.ts` | `Row`, `Cell`, `RowList`, `RowGroup`, `RowMatcher`, `ValueMatcher` |
| `formula-helpers.ts` | `DataFrameFormulaLinesHelper`, `DataFrameAnnotationRegionsHelper` |

The `js-api/CLAUDE.md:50-63` file documents the split. **Agent implication:** auto-completion must respect that `dataframe.ts` is a barrel — direct imports from sub-files (`dataframe/column-helpers`) work but bypass the public surface; the platform's own contract narrows imports to `datagrok-api/dg`, so `Column` is reached via `DG.Column`, not `DG.Column from dataframe/column`.

### 2.4 Event model

The `grok.events` singleton (`grok.ts:14`, instance of `Events` class at `js-api/src/events.ts:91`) exposes typed RxJS Observables. Subscriptions are RxJS `Observable`s wrapping a Dart event stream via `__obs` (`events.ts:45-71`).

**Observable inventory** (from `events.ts:123-225`, sampled the load-bearing entries):

| Event | Type / Args | Source |
|---|---|---|
| `onContextMenu` | any | `events.ts:123` |
| `onCurrentViewChanged` | any | `events.ts:131` |
| `onCurrentViewChanging` | `EventData<ViewArgs>` | `events.ts:133` |
| `onCurrentObjectChanged` | `EventData<EventArgs>` | `events.ts:135` |
| `onCurrentCellChanged` | any | `events.ts:137` |
| `onInputCreated` | `InputBase` | `events.ts:139` |
| `onDialogShown` | `Dialog` | `events.ts:141` |
| `onTableAdded` | `EventData<DataFrameArgs>` | `events.ts:144` |
| `onTableRemoved` | `EventData<DataFrameArgs>` | `events.ts:146` |
| `onQueryStarted` / `onQueryFinished` | any | `events.ts:148-150` |
| `onViewChanged` / `onViewChanging` | any | `events.ts:152-154` |
| `onViewAdded` / `onViewAdding` / `onViewRemoved` / `onViewRemoving` / `onViewRenamed` | `View` (or `EventData<ViewArgs>`) | `events.ts:156-164` |
| `onResetFilterRequest` | any | `events.ts:166` |
| `onViewLayoutGenerated` / `onViewLayoutApplying` / `onViewLayoutApplied` | `ViewInfo` | `events.ts:169-175` |
| `onFileEdited` | `FileInfo` | `events.ts:178` |
| `onCurrentProjectChanged` / `onProjectSaved` / `onProjectSaving` / `onProjectOpened` / `onProjectClosing` / `onProjectClosed` / `onProjectModified` | any | `events.ts:180-194` |
| `onTooltipRequest` / `onTooltipShown` / `onTooltipClosed` | any | `events.ts:196-200` |
| `onViewerAdded` / `onViewerClosed` | `EventData<ViewerArgs>` | `events.ts:202-204` |
| `onFormCreating` | `EventData<ColumnsArgs>` | `events.ts:206` |
| `onAccordionConstructed` | `Accordion` (used to inject context-panel panes) | `events.ts:209` |
| `onPackageLoaded` | `Package` | `events.ts:212` |
| `onFileImportRequest` | `EventData<FileImportArgs>` | `events.ts:215` |
| `onGridCellLinkClicked` | `EventData<GridCellArgs>` | `events.ts:217` |
| `onBrowseNodeCreated` | `TreeViewNode` (filtered to `Browse` root) | `events.ts:219-221` |
| `onLog` | `LogMessage` | `events.ts:223` |
| `onServerMessage` | `IServerMessageEventArgs` | `events.ts:225` |

**Untyped escape hatch:** `grok.events.onEvent(eventId)` (`events.ts:100`) accepts any string from the `EVENT_TYPE` enum (`const.ts:864-945`). The event-type enum has 41 entries; the typed getters above cover the load-bearing 33. The remaining 8 (`AI_GENERATION_ABORT`, `AI_PANEL_TOGGLE`, `CONTEXT_MENU_CLOSED`, `TREE_VIEW_NODE_ADDED`, `SERVER_MESSAGE`) are reachable via typed getters but with `any` payload.

**How an agent identifies the right event:** the comment at `events.ts:110-117` says: "use the Inspector tool. Open it (Alt+I), go to the 'Client Log' tab, and perform the action that you want to intercept." That's a *manual* discoverability path. An agent harness needs a programmatic mapping — see §5 (a `dg-api-index.json` generated from this inventory).

**Subscription lifecycle:** `JsViewer` and `ViewBase` both expose a `subs: Subscription[]` array (`viewer.ts:393`, `views/view.ts:48`) that is auto-cancelled on detach. The convention is documented in the entity template (`tools/entity-template/viewer-class.ts:30-33`): `this.subs.push(this.dataFrame!.selection.onChanged.subscribe(...))`. Subscriptions added outside `subs` leak.

### 2.5 Property descriptors and the `@grok` decorator pattern

Decorators live at `js-api/src/decorators/functions.ts` (405 lines). They are *registered* into `grok.decorators` via `grok.ts:36` (`export * from './src/decorators/functions';`). The actual decorator bodies are no-ops at runtime (`functions.ts:44`: `return function (constructor: Function) { };`) — they exist only to (a) carry typed config for IDE autocompletion and (b) act as build-time markers for the `FuncGeneratorPlugin` webpack plugin (`tools/plugins/func-gen-plugin.js:30-60`).

**Decorator inventory** (`decorators/functions.ts`):

| Decorator | Targets | Purpose | Line |
|---|---|---|---|
| `@viewer` | class extending `JsViewer` | Registers the viewer; carries `name`, `description`, `icon`, `toolbox`, `trellisable`, `viewerPath` | 36 |
| `@filter` | class extending `Filter` | Custom filter | 54 |
| `@cellRenderer` | class extending `GridCellRenderer` | Per-semType cell renderer | 72 |
| `@func` | static method | Generic function registration | 238 |
| `@app` | static method | App entry point (`name`, `top-menu`, `icon`, `url`, `browsePath`) | 246 |
| `@autostart` | static method | Runs at platform startup | 254 |
| `@init` | static method | Runs at first package use | 262 |
| `@editor` | static method | Function-call editor | 270 |
| `@panel` | static method | Context-panel panel (semType-bound) | 278 |
| `@dashboard` | static method | Welcome-screen widget | 286 |
| `@folderViewer` | static method | Folder-level viewer | 294 |
| `@semTypeDetector` | static method | Detector for semantic type | 302 |
| `@packageSettingsEditor` | static method | Settings editor widget | 310 |
| `@functionAnalysis` | static method | Sensitivity / parameter editor | 326 |
| `@converter` | static method | Value converter | 334 |
| `@fileViewer` | static method | File-extension viewer | 342 |
| `@fileExporter` | static method | Export menu entry | 350 |
| `@fileHandler` | static method | File-format importer | 358 |
| `@demo` | static method | Demo registration | 366 |
| `@treeBrowser` | static method | Tree browser | 374 |
| `@model` | static method | ML model | 382 |
| `@appTreeBrowser` | static method | App tree browser | 390 |
| `@param` | parameter | Parameter metadata for `@func` | 398 |

**Build-time pipeline:**

1. Author writes `@grok.decorators.viewer({...})` on a class or `@grok.decorators.func({...})` on a static method (typically inside a `class PackageFunctions`, see `packages/Charts/src/package.ts:20`).
2. Webpack runs `FuncGeneratorPlugin` (configured in the package template at `tools/package-template/webpack.config.js:32-34`).
3. The plugin parses TS files via `@typescript-eslint/typescript-estree` (`tools/plugins/func-gen-plugin.js:52-59`), reads decorator config, and emits a `package.g.ts` file with the legacy comment-annotated JSDoc form (e.g., `packages/Charts/src/package.g.ts:14-22`):

```typescript
//name: Timelines
//description: Creates a timelines viewer
//output: viewer result
//meta.showInGallery: false
//meta.icon: icons/timelines-viewer.svg
//meta.role: viewer
export function timelinesViewer() : any {
  return PackageFunctions.timelinesViewer();
}
```

The decorator is sugar; the `package.g.ts` JSDoc-comment form is the canonical contract that the platform consumes. **The triangle:** decorator (declaration) → `FuncGeneratorPlugin` (enforcement: emits `.g.ts`) → platform runtime + `grok check` (consumption). All three sites must stay in sync; the README's "function metadata as contract triangle" claim (`README.md:287`) is verified.

### 2.6 Function metadata directives — the canonical grammar

The metadata grammar is parsed by two cooperating regexes:

- `tools/bin/utils/utils.ts:201-206` — the per-language line regex:

```javascript
export const fileParamRegex = {
  py:  new RegExp(`^#\\s*(?!\\s*#)([^:]+):\\s+([^\\s\\[\\{]+) ?([^\\s\\[\\{]+)?`),
  ts:  new RegExp(`^//\\s*(?!\\s*//)([^:]+):\\s+([^\\s\\[\\{]+) ?([^\\s\\[\\{]+)?`),
  js:  new RegExp(`^//\\s*(?!\\s*//)([^:]+):\\s+([^\\s\\[\\{]+) ?([^\\s\\[\\{]+)?`),
  sql: new RegExp(`^--\\s*([^:]+):\\s+([^\\s\\[\\{]+) ?([^\\s\\[\\{]+)?`),
};
```

- `tools/bin/utils/utils.ts:194-199` — the recognised tag set:

```javascript
export const headerTags = [
  'name', 'description', 'help-url', 'input', 'output', 'tags',
  'sample', 'language', 'returns', 'test', 'sidebar', 'condition',
  'top-menu', 'environment', 'require', 'editor-for', 'schedule',
  'reference', 'editor', 'meta', 'connection', 'friendlyName',
];
```

Plus any `meta.*` directive (handled at `tools/bin/commands/check.ts:719`: `param.startsWith('meta.')`).

**Full directive grammar (verified against `check.ts:723-764`):**

| Directive | Form | Example | Where consumed |
|---|---|---|---|
| `name` | `//name: <ident>` | `//name: Timelines` | Function-registry key (`func-params-annotation.md`) |
| `friendlyName` | `//friendlyName: <text>` | `//friendlyName: Browse \| Bioactivity` | UI label |
| `description` | `//description: <text>` | `//description: Creates a timelines viewer` | UI tooltip |
| `help-url` | `//help-url: <url>` | | Help link |
| `input` | `//input: <type> <name> {options}` | `//input: dataframe df {caption: Input}` | Parameter declaration |
| `output` | `//output: <type> <name>` | `//output: viewer result` | Return-value declaration |
| `tags` | `//tags: <csv>` | `//tags: app, demo` | Function-role tag (legacy form of `meta.role`) |
| `sample` | `//sample: <path>` | | Sample-data attachment |
| `language` | `//language: <lang>` | `//language: python` | Script language |
| `returns` | `//returns: <text>` | | Return description |
| `test` | `//test: <expr>` | | Inline test |
| `sidebar` | `//sidebar: <name>` | | Sidebar placement |
| `condition` | `//condition: <expr>` | `//condition: true` | Display predicate |
| `top-menu` | `//top-menu: <path>` | `//top-menu: Help \| Tutorials` | Menu mount point |
| `environment` | `//environment: <name>` | | Script env (Python/R/etc.) |
| `require` | `//require: <module>` | | Script dependency |
| `editor-for` | `//editor-for: <funcname>` | | Custom editor binding |
| `schedule` | `//schedule: <cron>` | | Cron schedule |
| `reference` | `//reference: <ref>` | | Documentation reference |
| `editor` | `//editor: <name>` | | Custom editor |
| `meta.<key>` | `//meta.<key>: <value>` | `//meta.role: panel`, `//meta.cache: client`, `//meta.invalidateOn: 0 */5 * * * *`, `//meta.icon: images/icon.png`, `//meta.demoPath: Vis \| General \| Chord` | Open-ended metadata bag |
| `connection` | `//connection: <name>` | `--connection: Chembl` (in SQL) | DB connection binding for queries |

**Validation tightnesses worth flagging:**

- `meta.cache` values are validated against the closed list `['all', 'server', 'client', 'true']` (`tools/bin/utils/utils.ts:168`; `check.ts:448-449`).
- `meta.invalidateOn` must parse as a 6-field cron (`tools/bin/utils/utils.ts:171`; `check.ts:450-451`).
- `meta.invalidateOn` without `meta.cache` set is rejected (`check.ts:446-447`: "Can't use invalidateOn without cache").
- Forbidden parameter names: `function`, `class`, `export` (`check.ts:14`).
- Parameter names cannot be empty; the input/output regex group 3 captures them (`check.ts:401-403`).

`func-params-annotation.md` (in `help/datagrok/concepts/functions/`) carries the *user-facing* documentation for input/output options — `validators`, `caption`, `postfix`, `units`, `nullable`, `columns: numerical|categorical`, `type: numerical,categorical,dateTime`, `format`, `allowNulls`, `action: join("name") | replace("name")`, `choices`, `suggestions`, `min`/`max`, `separators`. The 30+ inline-options grammar lives there, but is *not* mechanically validated by `check.ts` today (verified by absence — `check.ts` validates type tokens, not option keys).

### 2.7 Semantic types

`DG.SEMTYPE.*` is a frozen object literal at `js-api/src/const.ts:206-246`. **All 28 ship-installed semantic types:**

```javascript
export const SEMTYPE = {
  EMAIL: 'Email Address',           URL: 'URL',                       PHONE_NUMBER: 'Phone Number',
  CITY: 'City',                     COUNTRY: 'Country',               GENDER: 'Gender',
  STATE: 'State',                   COUNTY: 'County',                 PLACE_NAME: 'Place Name',
  ZIP_CODE: 'Zip Code',             AREA_CODE: 'Area Code',           STREET_ADDRESS: 'Street Address',
  TEXT: 'Text',                     DURATION: 'Duration',
  LATITUDE: 'Latitude',             LONGITUDE: 'Longitude',
  IP_ADDRESS: 'IP Address',
  MOLECULE: 'Molecule',             MACROMOLECULE: 'Macromolecule',   MOLECULE3D: 'Molecule3D',
  CONCENTRATION: 'Concentration',   VOLUME: 'Volume',
  PDB_ID: 'PDB_ID',                 NEWICK: 'Newick',                 HELM: 'HELM',
  SUBSTRUCTURE: 'Substructure',     MONEY: 'Money',                   IMAGE: 'Image',
  FILE: 'File',                     CHEMICAL_REACTION: 'ChemicalReaction',
  IC50: 'IC50',                     EC50: 'EC50',                     Ki: 'Ki',
};
```

(Three pharmacology types — `IC50`, `EC50`, `Ki` — are documented inline at `const.ts:243-245` with units; the others are bare strings.)

**Registering a new semantic type from a plugin:** the `SemTypeInfo` interface (`const.ts:1011-1032`) defines the registration shape:

```typescript
export interface SemTypeInfo {
  name: string;             // semantic type id
  description: string;      // shown in tooltips
  itemType?: ColumnType;    // value data type (e.g., String for Molecule)
  columnNameRegexp?: string;
  valueRegexp?: string;
}
```

Two-stage detection model:

1. **Plugin-side detector function** — a static method in `<package>PackageDetectors extends DG.Package` tagged `meta.role: semTypeDetector`, takes a `column`, returns the type string or `null`. Lives in `detectors.js` (separate from the main bundle so it loads cheaply at table-import time). Canonical example: `packages/Chem/detectors.js:48-60`.
2. **Optional regex registration** via the `SemTypeInfo` shape — declarative pattern matching against column name / value pattern, evaluated by the platform without running plugin code.

**Failure mode the platform does not address:** if multiple detectors match the same column, *the detector that fired first wins* (`help/develop/how-to/functions/define-semantic-type-detectors.md:46-47`: "its semantic type depends on the order in which the detectors were triggered. Standard platform detectors do not necessarily get a preference"). There is no priority registry. **Implication for harnessing:** an agent registering a new sem-type cannot guarantee precedence; this is an authored knowledge fact not enforced anywhere.

### 2.8 Column tags (the open-ended metadata bag)

`TAGS` (`const.ts:282-342`) is a string-key registry the platform reads off `Column.tags` (a tagged map). Selected entries:

| Tag | Purpose |
|---|---|
| `LAYOUT_ID = 'layout-id'` | Layout-time column matching |
| `DESCRIPTION = 'description'` | Column doc |
| `TOOLTIP = '.tooltip'` | Tooltip override |
| `CHOICES = '.choices'` | JSON-encoded combo-box list |
| `AUTO_CHOICES = '.auto-choices'` | "Choose from existing values" |
| `COLOR_CODING_TYPE`, `COLOR_CODING_CONDITIONAL`, `COLOR_CODING_CATEGORICAL`, `COLOR_CODING_LINEAR`, `COLOR_CODING_LINEAR_BELOW_MIN_COLOR`, `COLOR_CODING_LINEAR_ABOVE_MAX_COLOR`, `COLOR_CODING_LINEAR_ABSOLUTE`, `COLOR_CODING_LINEAR_IS_ABSOLUTE`, `COLOR_CODING_SCHEME_MAX`, `COLOR_CODING_SCHEME_MIN`, `COLOR_CODING_MATCH_TYPE`, `COLOR_CODING_FALLBACK_COLOR` | Conditional / linear color coding |
| `MARKER_CODING = '.marker-coding'` | Per-row marker shape |
| `FORMULA_LINES = '.formula-lines'`, `ANNOTATION_REGIONS = '.annotation-regions'` | Chart overlays |
| `SOURCE_PRECISION = '.source-precision'` | CSV-derived precision |
| `FORMAT = 'format'` | Per-column format string |
| `FORMULA = 'formula'` | Computed-column formula |
| `SEMTYPE = 'quality'` | **Note:** the *tag key* is `quality`, not `semType`. Plugins that read `col.tags['semType']` will silently miss the value. |
| `MULTI_VALUE_SEPARATOR = '.multi-value-separator'` | Multi-value parsing |
| `IGNORE_CUSTOM_FILTER = '.ignore-custom-filter'` |
| `STRUCTURE_FILTER_TYPE = '.structure-filter-type'` | Sketch / Categorical |
| `CUSTOM_FILTER_TYPE = '.custom-filter-type'` | `<PackageName>:<FilterType>` |
| `CELL_RENDERER = 'cell.renderer'` | Per-column cell renderer |
| `UNITS = 'units'` | Unit string |
| `FRIENDLY_NAME = 'friendlyName'` | UI display name |
| `ALLOW_RENAME = '.allow-rename'` |
| `LINK_CLICK_BEHAVIOR = '.linkClickBehavior'` | Open-in-new-tab / context-panel / custom |
| `GROUP = 'group'` | Column group (for visual grouping) |

The leading-dot convention (`.choices`, `.tooltip`) appears to mark "platform-internal" tags but is not enforced; both forms appear (`format`, `units` carry no dot). **Implication:** a plugin with typoed tag-name (`color-coding-typex`) will silently fail to color-code.

### 2.9 Other enums worth knowing

`TYPE` (`const.ts:78-129`) — the master type enum: `int`, `float`, `num`, `bool`, `string`, `datetime`, `qnum`, `dataframe`, `column`, `column_list`, `barcode`, `bigint`, `byte_array`, `object`, `file`, `blob`, `tablerowfiltercall`, `colfiltercall`, `bitset`, `map`, `dynamic`, `viewer`, `list`, `semantic_value`, `func`, `funccall`, `property`, `categorical`, `numerical`, `GridCellRenderArgs`, `element`, `view`, `TableView`, `User`, `Menu`, `Project`, `event_data`, `progressindicator`, `Credentials`, `ScriptEnvironment`, `Notebook`. **Used by:** parameter-type validation in `check.ts:283-298` (with case-insensitive normalisation and a small alias table — `file`↔`fileinfo`, `dynamic`↔`searchprovider`).

`COLUMN_TYPE` — narrower set used at the DataFrame layer (referenced from `js-api/CLAUDE.md:44`).

`VIEWER` — the registered viewer-type names enum (`const.ts`, accessed as `DG.VIEWER.SCATTER_PLOT` etc.).

`VIEWER_PROPERTY_TYPE` (`const.ts:158-169`) — viewer-property type enum: `string`, `int`, `double`, `bool`, `datetime`, `bigint`, `column`, `column_list`, `dataframe`. Used by `ObjectPropertyBag` / `JsViewer` property registration.

`FILTER_TYPE` (`const.ts:145-153`) — `histogram`, `categorical`, `multi-value`, `bool-columns`, `free-text`, `column-free-text`, `Chem:substructureFilter`. The chem one is namespaced — implies cross-package filter registration is by string pattern, not central registry.

`VIEW_TYPE` (`const.ts:171-202`) — 27 standard view types (`TABLE_VIEW`, `APPS`, `SETTINGS`, `WELCOME`, `SCRIPT`, `SKETCH`, `FORUM`, `PROJECTS`, `NOTEBOOKS`, `HELP`, `OPEN_TEXT`, `DATABASES`, `WEB_SERVICES`, `VIEW_LAYOUTS`, `FUNCTIONS`, `DATA_CONNECTIONS`, `DATA_JOB_RUNS`, `FILES`, `DATA_QUERY_RUNS`, `EMAILS`, `GROUPS`, `MODELS`, `QUERIES`, `SCRIPTS`, `USERS`, `PACKAGES`, `PACKAGE_REPOSITORIES`, `JS_EDITOR`, `BROWSE`, `HOME`).

`FUNC_TYPES` (`const.ts:350-434`) and `functionRoles` (`const.ts:445`+) — the canonical function-role registry. Each role has a description, header (`tags` or `role`), and a TypeScript signature. Selected entries enforced by `check.ts:328-405` (matches the function's declared inputs/outputs against the role's signature):

| Role | Header | Signature |
|---|---|---|
| `app` | tags | `app(): void \| View` |
| `panel` | tags | `panel(...args): Widget \| Viewer \| graphics \| void` |
| `init` | tags | `init(): void` |
| `autostart` | tags | `autostart(): void` |
| `semTypeDetector` | tags | `semTypeDetector(col: Column): string` |
| `fileViewer` | tags | `fileViewer(file: FileInfo): View` |
| `fileExporter` | tags | `fileExporter(): void` |
| `fileImporter` (`'file-handler'`) | tags | `fileImporter(x: string \| TypedArray): DataFrame[]` |
| `cellRenderer` | tags | `cellRenderer(): GridCellRenderer` |
| `packageSettingsEditor` | tags | `packageSettingsEditor(): Widget` |
| `dashboard` | tags | `dashboard(): Widget` |
| `functionAnalysis` | tags | `functionAnalysis(x: Function): View` |
| `converter` | role | `converter(x: any): any` |
| `widget` / `widgets` | tags | `widget(...args): Widget` / `widgets(...args): Widget` |
| `editor` | tags | `editor(call: FuncCall): Widget \| View \| void` |
| `Transform` | tags | `transform(table: DataFrame, ...args): any` |
| `filter` | tags | `filter(): Filter` |
| `viewer` | tags | `viewer(): Viewer` |
| `valueEditor` | tags | `valueEditor(...args): any` |
| `cellEditor` | tags | `cellEditor(cell: GridCell): void` |
| `unitConverter` | tags | `unitConverter(value: string, source: string, target: string): string` |
| `moleculeSketcher` | tags | (signature in source) |
| `tooltip` | tags | (signature in source) |
| `folderViewer` | tags | (signature in source) |
| `scriptHandler` | tags | (signature in source) |
| `searchProvider` | tags | (signature in source) |
| `notationRefiner` | tags | (signature in source) |
| Plus 6 domain-specific: `HitTriageFunction`, `HitTriageDataSource`, `HitTriageSubmitFunction`, `HitDesignerFunction`, `dim-red-preprocessing-function`, `dim-red-postprocessing-function`, `monomer-lib-provider` |

**Implication for harnessing:** the role registry is a closed list of ~33 named function shapes. An agent harness can author "for each role, here's the canonical scaffold" once and have it cover the entire surface — there is no open extension point for new roles short of editing `js-api/src/const.ts`.

### 2.10 What the API surface does *not* expose declaratively

Worth flagging so a component map doesn't claim coverage where there isn't any:

- **No declarative viewer-property registry** — `ObjectPropertyBag` and `Property` (`entities/property.ts`) are runtime objects; viewer authors register properties imperatively in the constructor (`viewer.ts:399-405`). A plugin's "what props does this viewer accept" is not introspectable without instantiating it.
- **No central event-args type registry** — the per-event payload types (`ViewArgs`, `DataFrameArgs`, `ViewerArgs`, `ColumnsArgs`, `FileImportArgs`, `GridCellArgs`) are interface declarations scattered through `events.ts`, not enumerated in one place.
- **No declarative menu-mount registry** — `meta.top-menu` is a free-text string with `|` as separator. A new mount-point doesn't have to register; it appears wherever the string says it does. **Implication:** menu-collision detection is a candidate harness audit (no platform check today).

---

## 3. The `grok check` build validator

### 3.1 Source location and entry path

- CLI source: `tools/bin/commands/check.ts` (815 lines).
- Routed via `tools/bin/grok.js` (CLI router; transpiled `.js` coexists with `.ts` per `tools/CLAUDE.md:12-17`).
- Recursive mode: `runChecksRec` (line 134) walks subdirectories; standard mode `runChecks` (line 67) operates on a single package.
- Packages run `grok check --soft` as part of `npm run build` (template at `tools/package-template/package.json:21`: `"build": "grok api && grok check --soft && webpack"`).

### 3.2 What `grok check` validates

| # | Check | Function | What it does | Severity |
|---|---|---|---|---|
| 1 | Webpack-externals import match | `checkImportStatements` (`check.ts:176`) | For each external in webpack config, asserts that imports of that module use the *exact* externals key (e.g., `from 'datagrok-api/dg'`, not `from 'datagrok-api'`) | warning |
| 2 | `datagrok-api` deep-import block | `checkDatagrokApiImports` (`check.ts:211`) | Blocks any `from 'datagrok-api/<x>'` other than `dg`, `grok`, `ui`, `datagrok` | error |
| 3 | Heavy-import linter | `checkHeavyImports` (`check.ts:249`) | Warns on static imports of `@datagrok-libraries/test`, `codemirror`, `konva`, `exceljs` (each with bundle-size rationale and a suggested fix); skipped in test files / test packages / `/workers/` / `/libs/` paths | warning |
| 4 | Sourcemap presence | `checkSourceMap` (`check.ts:608`) | Asserts `tsconfig.json` has `"sourceMap": true` and webpack has `devtool: source-map`; verifies `dist/package.js` and `dist/package-test.js` exist | error (skipped in `--soft`) |
| 5 | `.npmignore` hygiene | `checkNpmIgnore` (`check.ts:635`) | Asserts `.npmignore` exists and does not exclude `dist/` | warning |
| 6 | Script-name regex | `checkScriptNames` (`check.ts:651`) | Asserts source files match `^[A-Za-z0-9._-]*$` (no spaces, no special chars); excluded directories: `node_modules`, `dist`, `files`, `fixtures`, `data`, `templates`, `test-data`, `scenarios`, `samples`, `demo`, `docs`, `documentation` | warning |
| 7 | Function-signature validation | `checkFuncSignatures` (`check.ts:408`) + `validateFunctionSignature` (`check.ts:326`) | For every function with a recognised role, parses the role's canonical signature (`functionRoles[].signature`) and compares parsed input/output types against the function's declared `//input:`/`//output:`. Validates: `app` name doesn't have prefix/postfix `App`; `fileExporter` must have a `description`; `fileViewer` must carry only the `fileViewer` tag; param names not in `forbiddenNames` (`function`, `class`, `export`); `meta.invalidateOn` requires `meta.cache`; `meta.cache` value in `['all', 'server', 'client', 'true']`; `meta.invalidateOn` parses as cron | warning (signature) / error (forbidden names, cache) |
| 8 | `package.json` shape | `checkPackageFile` (`check.ts:475`) | Validates: `description` non-empty; `properties` array entries have `name` + valid `propertyType`; `repository` and `author` fields present (for public packages); not a `beta` version; `datagrok-api` dependency uses semver constraint; `sources[]` are valid (file exists OR URL OR `common/*` shared lib in `sharedLibExternals`); release-candidate versions have at least one RC dependency | warning |
| 9 | CHANGELOG validation | `checkChangelog` (`check.ts:579`) | Asserts file exists; every `## ` heading matches `## <X.Y.Z> (<yyyy-mm-dd> | WIP)`; latest CHANGELOG version matches `package.json` version (or 2nd-latest, to allow WIP entries); skipped for `servicePackage: true` and pre-1.0 versions | warning |

**Coverage gaps the README's translation table assumed but the source doesn't deliver:**

- *"Reuse-anchor enforcement into `@datagrok-libraries/*`"* — not implemented. `check.ts` flags heavy-imports of `@datagrok-libraries/test` (bundle hygiene) but does not enforce "use this library function instead of rolling your own."
- *"`.g.ts` edit detection"* — not implemented. The `package.g.ts` file is regenerated by `FuncGeneratorPlugin` on every webpack build, so manual edits get overwritten silently. There is no check that complains about a hand-edit.
- *"Contract-triangle drift across releases"* — not implemented. `grok check` is single-snapshot — no notion of a previous release to diff against.

These three are flagged in the workplan as W1.A3 (`datagrok-harness-workplan.md:79`) — confirmed as not-yet-shipped.

### 3.3 Output format

- **Console output, line-by-line.** `color.error`, `color.warn`, `color.success` (`tools/bin/utils/color-utils.ts`) write coloured ANSI to stdout.
- **Exit code:** `runChecks` exits with code 1 via `testUtils.exitWithCode(1)` (`check.ts:127`) on errors unless: `--soft` flag is passed, package version starts with `0`, or every error is in the `warns` allowlist (`['Latest package version', 'Datagrok API version should contain']`, `check.ts:13`). Otherwise exits 0 ("OK") with the success line `Checking package <name>...    ✓ OK` (`check.ts:129`).
- **Recursive mode** (`runChecksRec`, `check.ts:134`): aggregates `allPassed` boolean across packages; returns at the end.
- **No structured output.** No JSON, no `--format` flag, no machine-parseable error stream. Every consumer must scrape stdout.

**Implication for harnessing:** wrapping `grok check` in a pre-commit hook (the README's prescription, `README.md:286`) requires either accepting "exit code 0 = pass" as the only signal, or grepping stdout for `error`/`warning` strings. The validator was designed for human use at dev-time; rewiring it to drive a workflow gate needs either (a) a `--json` output flag added, or (b) a wrapping script that re-runs the underlying functions directly (they are exported — see `check.ts:51` `export function check`, `:157` `extractExternals`, `:176` `checkImportStatements`, `:211` `checkDatagrokApiImports`, `:249` `checkHeavyImports`, `:408` `checkFuncSignatures`, `:475` `checkPackageFile`, `:579` `checkChangelog`, `:608` `checkSourceMap`, `:635` `checkNpmIgnore`).

### 3.4 Extension points

**There are none today.** No plugin author can author a custom check that `grok check` will run. The check list is hardcoded into `runChecks` (`check.ts:67-131`). To add a check, you edit `tools/bin/commands/check.ts` and republish `datagrok-tools`.

**What an extension contract would look like:** a check is a pure function `(packagePath: string, files: string[]) => string[]` that returns warnings. Every existing check matches this shape (e.g., `checkPackageFile`, `checkChangelog`). A custom-check registry could be a `package.json` field:

```json
"grokChecks": [
  "./checks/no-raw-fetch.js",
  "./checks/all-functions-have-tests.js"
]
```

With `runChecks` reading and dispatching them at line 109. Trivial to add; just no-one has authored it.

### 3.5 Proposed contract for "agent-extensible check"

For agents to add platform-conformance audits without forking `datagrok-tools`:

```typescript
// types
type CheckResult = {
  pass: boolean;
  message: string;       // human-readable
  evidence?: string[];   // file:line locations of offending code
  severity: 'error' | 'warning';
};
type Check = (ctx: {
  packagePath: string;
  packageJson: PackageFile;
  files: string[];          // walked once, shared across checks
  externals: Record<string, string> | null;
  isWebpack: boolean;
}) => CheckResult[];
```

**State this proposal explicitly:** a check is a function that takes the package context and returns a list of `{pass, message, evidence, severity}` records. Custom checks register via `package.json#grokChecks` (paths) or via `~/.grok/checks/` (user-global) or via env var `GROK_CHECKS_PATH` (CI override). The harness layer can then ship project-specific audits (e.g., "no inline `getDoseLabel()` reimplementation") without touching `datagrok-tools` — closing the gap the README's "wire `grok check` into pre-commit" prescription would otherwise leave open.

---

## 4. Publish flow

### 4.1 `grok publish` semantics

Source: `tools/bin/commands/publish.ts` (329 lines).

**Pipeline (verified against `publish.ts:32-187`):**

1. **Pre-check.** Unless `--skip-check`, `--all`, or `--refresh`, `check({_: ['check']})` runs (`publish.ts:191-192`) — the same `runChecks` from §3.
2. **Server timestamp fetch (debug only).** GETs `${host}/packages/dev/${devKey}/${packageName}/timestamps` (`publish.ts:36-50`). Server returns a JSON map of `path → mtime`. Used to skip unchanged files in incremental publishes.
3. **File walk.** `walk` from `ignore-walk` (`publish.ts:58-63`) respecting `.npmignore`, `.gitignore`, `.grokignore`. `dist/` is added separately if webpack has produced it (`publish.ts:67-74`); if not, the server is asked to rebuild server-side (`publish.ts:78-82`, `--rebuild` flag).
4. **Skip rules** (`publish.ts:104-119`):
   - Skip dotfiles (any path containing `/.`)
   - Skip files starting with `.`
   - Skip `node_modules/`
   - Skip `dist/` if `--rebuild`
   - Skip everything in `src/` except `src/package.*` if not `--rebuild` and webpack is present
   - Skip `upload.keys.json`, `zip`
5. **Connection-file env-var substitution.** For files matching `connections/*.json`, substitute `${VAR_NAME}` placeholders with `process.env[VAR_NAME]` (`publish.ts:127-141`). Missing env var → error pushed to `errs[]`. (This is the documented "publish-time secret injection" mechanism.)
6. **ZIP archive build.** Streams files into archiver-promise; appends `timestamps.json` (`publish.ts:150`).
7. **POST upload.** `POST ${host}/packages/dev/${devKey}/${packageName}?debug=...&rebuild=...&dropDb=...&suffix=...` with the ZIP buffer as body (`publish.ts:159-178`).
8. **Response handling.** Server returns JSON; if `#type === 'ApiError'`, emit error and exit 1; else success.

### 4.2 What the server validates at upload

The server-side validation logic is *not* in the public repo (the upload handler is in the closed Dart backend). Observable from the public side:

- The server returns `#type: 'ApiError'` with `message` and `innerMessage` fields (`publish.ts:168-170`).
- Server-side rebuild triggers when `dist/package.js` is absent and `--rebuild` is set (`publish.ts:78-82`) — the server has its own webpack capability.
- The `--release` flag is forwarded as an upload parameter (`publish.ts:153`: `?debug=${debug.toString()}`); release vs debug visibility is server-enforced.

**Gap to flag for the harness work:** publish-time validation is a *partial* black box. The W1.A4 deliverable in the workplan ("Publish-time CI hooks") would only address the parts the public repo exposes (ZIP shape, env-var substitution); deeper server-side checks (semver conformance, viewer-event compatibility) require server-side cooperation that is outside what plugin authors can drive.

### 4.3 Version conflict semantics

- `--debug` (default): package "visible only to developer" (`tools/CLAUDE.md:194`). Multiple developers can hold their own debug versions of the same package name simultaneously, scoped by `devKey`.
- `--release`: public visibility. Replaces the previous release on success.
- No client-side semver-conflict check — relies on server response.
- CHANGELOG version matching is enforced *client-side* by `grok check` (`check.ts:599-600`: warning if latest CHANGELOG version != `package.json#version`), but is downgraded to a warning rather than blocking publish.

---

## 5. Help docs as agent fuel

### 5.1 Inventory

- **Total markdown files under `help/`:** 569 (verified: `find C:/datagrok/public/help -name "*.md" | wc -l`).
- **Under `help/develop/`:** 98.
- **Subtree shape (`help/develop/`):**

| Subdir | Contents | Approx files |
|---|---|---|
| `advanced/` | `data-frame.md`, `debugging.md`, `decorators.md`, `package-api.md`, `ui.md` | 5 |
| `dev-process/` | Versioning policy, libraries, tools | ~10 |
| `domains/` | Per-domain (chem, bio, etc.) developer guides | ~15 |
| `function-roles.md` | Top-level role inventory (`function-roles.md`) | 1 |
| `how-to/` | apps, data, db, files, functions, grid, misc, packages, scripts, tests, ui, viewers, views — categorised tutorials | ~50 |
| `packages/` | `_overview.md`, `_publishing.md`, `_packages.md`, `_debugging.md`, `_package-function-types.md`, `_datagrok-configuration.md`, `js-api.md`, `rest-api.md`, `extensions.md` | 9 |
| `under-the-hood/` | Internals | ~5 |

- **Outside `help/develop/`:** ~470 files covering platform usage (visualize, transform, govern, deploy, datagrok concepts).

### 5.2 Sample inspection (5 representative pages)

| Page | Shape | Agent-readability |
|---|---|---|
| `help/develop/function-roles.md` | Prose with inline code blocks; cross-links to `how-to/` per role | Good for human, **agent-readable with light parsing** — tag list at top is structured (`#app`, `#dashboard`, `#panel`, etc.); per-role sections are prose |
| `help/develop/advanced/decorators.md` | Prose + `<details>` collapsible code blocks per class decorator | Agent-readable but hidden code in `<details>` requires HTML-aware parsing |
| `help/develop/how-to/viewers/develop-custom-viewer.md` | Long-form tutorial (extending `JsViewer`, properties, rendering, events) with code blocks. ~250 lines | Agent-readable with light parsing — code blocks are tagged ` ```javascript ` / ` ```typescript `; inline links target `js-api/dg/classes/JsViewer` (an *external* TypeDoc URL, not file:line) |
| `help/develop/how-to/functions/define-semantic-type-detectors.md` | Tutorial with code examples for `detectMagnitude`, `detectNucleotides`, plus advanced patterns (`DG.Detector.sampleCategories`) | Agent-readable; example code is canonical |
| `help/datagrok/concepts/functions/func-params-annotation.md` | The *only* doc that has the input/output options grammar in tabular form (lines 135-176: `validators`, `caption`, `postfix`, `units`, `nullable`, `columns: numerical\|categorical`, `format`, `allowNulls`, `action`, `choices`, `suggestions`, `min`, `max`, `separators`) | Agent-readable as-is; the tables ARE the contract |

### 5.3 Verdict

**Agent-readable as-is:** the option-grammar tables in `func-params-annotation.md`, the role enumeration in `function-roles.md`, and the inventory tables in package-overview-style docs. ~10% of the corpus.

**Agent-readable with light parsing:** the ~50 "how-to" tutorials, where code blocks are reliably fenced and the prose is task-oriented. An agent can extract ` ```typescript ... ``` ` blocks and treat them as canonical patterns. ~40% of the corpus.

**Rewrite or auxiliary index needed:** the prose-heavy concept docs, partially-implemented sections ("To be continued..." appears 5 times in `_package-function-types.md` alone), and any doc citing platform internals via TypeDoc URLs rather than source file:line. ~50% of the corpus.

### 5.4 What "shape for agents" would mean

The platform repo already has the raw material: TypeScript with JSDoc comments on every exported class, interface, and method (sampled from `viewer.ts`, `events.ts`, `dataframe/*.ts`). What's missing is a **denormalised index** the agent can query without parsing 569 markdown files.

**Sketch:** `dg-api-index.json` — generated from JSDoc + `const.ts` + `events.ts` + `decorators/functions.ts`. Schema:

```json
{
  "namespaces": {
    "grok":  { "exports": ["functions", "events", "dapi", "shell", ...], "source": "js-api/grok.ts" },
    "ui":    { "exports": ["element", "appendAll", "empty", ...],         "source": "js-api/ui.ts"   },
    "dg":    { "reExports": ["interfaces/d4", "const", "events", ...],    "source": "js-api/dg.ts"   }
  },
  "classes": {
    "TableView": {
      "extends": "View",
      "source": "js-api/src/views/view.ts:382",
      "constructors": [{"signature": "(dart: any)", "source": "...:384"}],
      "static": [{"name": "create", "signature": "(table: DataFrame, addToWorkspace?: boolean): TableView"}],
      "instance": [{"name": "addViewer", "signature": "(v: ViewerType | string | Viewer, options?: any): Viewer"}, ...]
    },
    "JsViewer":  { "extends": "Viewer", "source": "js-api/src/viewer.ts:374", ... },
    ...
  },
  "events": {
    "onTableAdded":      { "type": "EventData<DataFrameArgs>", "source": "events.ts:144" },
    "onCurrentRowChanged": { "type": "any", "source": "events.ts:..." },
    ...
  },
  "semTypes":  ["Email Address", "URL", "Phone Number", ..., "Ki"],
  "viewTypes": ["TableView", "apps", "settings", ...],
  "funcRoles": [
    {"role": "app",    "header": "tags", "signature": "app(): void | View"},
    {"role": "panel",  "header": "tags", "signature": "panel(...args): Widget | Viewer | graphics | void"},
    ...
  ],
  "decorators": [
    {"name": "viewer",      "options": ["name", "description", "icon", "toolbox", "trellisable", "viewerPath"]},
    {"name": "filter",      "options": ["name", "description", "semType"]},
    {"name": "cellRenderer","options": ["name", "description", "cellType", "columnTags", "virtual"]},
    ...
  ]
}
```

This index would be generated by a script reading `js-api/src/const.ts`, `js-api/src/events.ts`, and `js-api/src/decorators/functions.ts` directly — no LLM extraction needed; the source is already structured.

A second-tier index, `dg-help-index.json`, would carry the prose-side mapping `{role, task} → markdown_url` so an agent looking for "how do I add a custom filter" lands at `help/develop/how-to/viewers/custom-filters.md`. That index is straightforward to generate from the `_category_.yml` files Docusaurus uses for navigation.

**Implication for the harness work:** the "knowledge artifacts" row in the README's translation table (`README.md:289`) currently points at the 569 markdown files. That's the right *inputs* but the wrong *interface*. The W1.B1 query script (`datagrok-harness-workplan.md:81`) needs the JSON index above as its substrate; querying markdown directly is brittle.

---

## 6. Open questions for thread discussion

1. **Server-side validation visibility.** What does the upload handler validate beyond the public-repo `grok check`? Specifically: does the platform reject (or warn) on viewer-event-handler signature changes, on package-name collisions across orgs, on `DG.SEMTYPE.*` literal usage that doesn't appear in the platform's enum? Without an answer, W1.A4 (publish-time CI hooks) is half-blind.
2. **Detector precedence.** `help/develop/how-to/functions/define-semantic-type-detectors.md:46-47` admits "its semantic type depends on the order in which the detectors were triggered. Standard platform detectors do not necessarily get a preference." Is there a configuration knob (priority field, package-load-order) that the public repo doesn't expose? If not, two plugins both detecting `Molecule` race silently — that's a class of harness bug no static check can catch.
3. **`@grok` decorator authority.** The decorators are runtime no-ops (`decorators/functions.ts:44`). The webpack `FuncGeneratorPlugin` extracts their config and emits `package.g.ts`. **What is the authoritative source — the decorator config or the emitted JSDoc form?** If a developer hand-edits `package.g.ts` after generation, does that edit survive the next webpack run? Verified: it does not — the plugin overwrites. But there is no `grok check` that warns about a hand-edit, so the divergence is silent. This is a contract-triangle straggler in the wild.
4. **Tag-name vs key-name divergence.** `TAGS.SEMTYPE = 'quality'` (`const.ts:318`). Plugins reading `col.tags['semType']` get `undefined`. Is this an intentional historical alias (the runtime carries both keys?), or a single-key contract that just looks like a typo? Source doesn't clarify.
5. **`grok check` extensibility surface.** The check list is hardcoded. The cleanest path to adding project-side audits without forking `datagrok-tools` is the `package.json#grokChecks` proposal in §3.5. Has anyone in the Datagrok team rejected this shape, or is it just unbuilt? The answer determines whether harness-side audits live as a `datagrok-tools` PR or as a parallel `grok-check-plus` script the harness ships separately.

---

## Sources

| File | What it provided |
|---|---|
| `C:/pg/lattice/README.md` | Prior-corpus rows §1 builds on (lines 283-297, the worked translation table) |
| `C:/pg/lattice/docs/datagrok-harness-workplan.md` | W1.A1/A2/A3/B1 reference points |
| `C:/pg/lattice/docs/harness-for-datagrok.md` | Skills/agents disambiguation context (not duplicated) |
| `C:/datagrok/public/CLAUDE.md` | Repo-level conventions, `grok` CLI overview |
| `C:/datagrok/public/CONTRIB.md` | Coding style, eslint setup |
| `C:/datagrok/public/globals.d.ts` | Window-level `grok`/`ui`/`DG` declarations |
| `C:/datagrok/public/js-api/CLAUDE.md` | Module-level architecture, sub-module split, Dart-JS interop pattern |
| `C:/datagrok/public/js-api/grok.ts` | Singleton-export inventory for the `grok` namespace |
| `C:/datagrok/public/js-api/dg.ts` | Re-export inventory for the `dg` namespace; window-global installation |
| `C:/datagrok/public/js-api/ui.ts` | UI-helper free-function shape |
| `C:/datagrok/public/js-api/src/const.ts` | TYPE, SEMTYPE, EVENT_TYPE, VIEWER_PROPERTY_TYPE, VIEW_TYPE, TAGS, FUNC_TYPES, functionRoles enums + types + SemTypeInfo |
| `C:/datagrok/public/js-api/src/events.ts` | Events class, observable inventory, `__obs` Dart-stream-to-RxJS bridge |
| `C:/datagrok/public/js-api/src/views/view.ts` | ViewBase / View / TableView / ScriptView / DataQueryView / DockView / BrowsePanel / VirtualView class hierarchy |
| `C:/datagrok/public/js-api/src/viewer.ts` | Viewer / JsViewer / FilterGroup + 13 named-viewer classes |
| `C:/datagrok/public/js-api/src/widgets/base.ts` | Widget / DartWidget base classes |
| `C:/datagrok/public/js-api/src/dataframe/data-frame.ts` | DataFrame + helper classes |
| `C:/datagrok/public/js-api/src/dataframe/column.ts` | Column<T> + 5 typed subclasses |
| `C:/datagrok/public/js-api/src/decorators/functions.ts` | All 23 `@grok.decorators.*` decorators + options interfaces |
| `C:/datagrok/public/tools/CLAUDE.md` | datagrok-tools architecture, command list, build pipeline, `grok claude` Docker env |
| `C:/datagrok/public/tools/bin/commands/check.ts` | `grok check` validator: 9 checks; signature parsing; type aliasing |
| `C:/datagrok/public/tools/bin/commands/publish.ts` | Publish flow: file walk, env-var substitution, ZIP, POST upload |
| `C:/datagrok/public/tools/bin/commands/api.ts` | `grok api` wrapper-generation entry path |
| `C:/datagrok/public/tools/bin/utils/utils.ts` | headerTags, fileParamRegex, cacheValues, propertyTypes, dgToTsTypeMap |
| `C:/datagrok/public/tools/plugins/func-gen-plugin.js` | Webpack plugin that reads `@grok.decorators.*` and emits `package.g.ts` |
| `C:/datagrok/public/help/develop/function-roles.md` | Function-role tag overview |
| `C:/datagrok/public/help/develop/advanced/decorators.md` | Decorator-pattern user-facing doc |
| `C:/datagrok/public/help/develop/how-to/viewers/develop-custom-viewer.md` | Custom-viewer tutorial; example registration |
| `C:/datagrok/public/help/develop/how-to/functions/define-semantic-type-detectors.md` | Detector signature; precedence-ordering admission |
| `C:/datagrok/public/help/develop/packages/_package-function-types.md` | Function-type role list (with several "to be continued") |
| `C:/datagrok/public/help/datagrok/concepts/functions/func-params-annotation.md` | Input/output options grammar tables (lines 135-176) |
| `C:/datagrok/public/hooks/pre-push` | The only ship-installed git hook (a 4-line `git lfs` wrapper) |
