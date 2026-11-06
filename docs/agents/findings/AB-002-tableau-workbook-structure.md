# AB-002 — Tableau workbook structure for import

## Question
What `.twb` XML and `.twbx` package structure must a Tableau importer read, how does each part
map to `umf.dashboard` or to a loss category, and what shape should a native `umf.tableau`
extension take, given UMF has no XML-native precedent?

## Sources
Read by this run:
- Official Tableau XSD, `twb_2026.1.0.xsd` (Apache-2.0), fetched from
  https://github.com/tableau/tableau-document-schemas (`schemas/2026_1/`). Element and attribute
  names below come from this file. The XSD was read, not committed to this repo.
- The same repo's README: XSDs cover `.twb` only, not `.twbx`; validation is syntactic only; it
  does not check connection attributes, calculated-field contents, references by name, or
  `processContents="skip"` content.
- https://github.com/PrigasG/twbparser (MIT) README: confirms what a third-party parser
  extracts (datasources, joins, calculated fields, shelves, filters, zone tree with
  tiled/floating, dashboard size, actions) and that `.twbx` is opened by extracting the largest
  `.twb`. It names no XML paths; nothing below depends on it.
- Repo: `docs/helix/02-design/contracts/CONTRACT-055-dashboard-profile.md`,
  `CONTRACT-082-lakeview-dashboard-interchange.md`, `FEAT-034`, `src/adapters/lakeview/project.ts`.

Not read: Tableau's prose documentation, any real `.twb` file (the repo has none), the `.twbx`
package specification. Statements about `.twbx` and about parameters are **inferences** and are marked.

## Findings

### Document skeleton (XSD `WorkbookFile-CT`)
Root `<workbook version source-build [original-version locale source-platform]>`. The XSD
declares a **sequence** of groups, so child order is significant: manifest, repository location,
preferences, style theme, styles, local data, `datasources`, datasource relationships, map
sources, shared views, `actions`, `worksheets`, `dashboards`, `windows`, datagraph, thumbnails,
shapes, referenced extensions, then several optional newer groups. A `version` higher than the
reader's is rejected by older Tableau (per README), so import must record the version.

### Datasources (`DataSource-CT`)
`<datasource name caption version hasconnection ...>` contains, in order: optional `connection`,
dimensions, settings, aliases, `column` and `column-instance` entries, groups, drill paths,
folders, datasource-level actions, calculated members, `extract`, layout, styles, semantic-role
defaults, and more.
- `connection` is typed `<xs:any processContents="skip">`: the XSD does not constrain it. Every
  connector class has different children. Treat as opaque XML.
- Joins and relationships are not in `column`; they sit in object-graph and relation content
  inside the datasource (`ObjectGraph-G`, `DataSourceTree-Wrapper-G`, `relationships`).
  **Not read in detail this run** `[NEEDS CLARIFICATION]`.
- `extract` holds a materialized extract reference. Extract data (`.hyper`) lives only in `.twbx`
  (inference).

### Columns and calculated fields (`Column-G`)
`<column name role type datatype [caption aggregation hidden default-format semantic-role
param-domain-type value alias folder-name ...]>`. `role` is dimension/measure, `type` is
nominal/ordinal/quantitative (enumerations in `FieldRole-ST`, `FieldType-ST`, not dumped here).
A calculated field is a `column` whose child `<calculation class formula ...>`; `class` is
`tableau`, `passthrough`, `bin` or `categorical-bin` (`DataSource-CalculationType-ST`).
`formula` is opaque Tableau calculation language (level-of-detail expressions and table
calculations are formula text, with table-calc addressing in a `TableCalc-G` child).
**Parameters** carry `param-domain-type` and `value` on a `column`; that parameters live in a
datasource named `Parameters` is **an inference** from Tableau practice, not read in the XSD.

### Worksheets (`Workbook-VisualSpecification-G`)
`<worksheet name>` → `<table>` → `<view>` (with its own `datasources`,
`datasource-dependencies`, filters, slices, `aggregation`), `<style>`, `<panes>`
(per-pane mark class and encodings), mark layout, and `<rows>` / `<cols>`. Shelves `rows`
and `cols` are **text** content (simple content, with `include-empty`/`total`), holding field
reference expressions that need their own tiny grammar. Filters are `<filter>` with nested
`<groupfilter>` trees. Worksheets reference fields by internal names such as column instances,
not by caption.

### Dashboards (`DashboardDoc-G`, `Zone-G`)
`<dashboard name [type="storyboard"]>` → size options, datasource dependencies, `<zones>`
(`is-pixels`, `use-insets`), optional `<devicelayouts>` (Desktop/Phone/Tablet/default), and a
`simple-id` UUID. `zone` is recursive and carries `x y w h id` (integers, **required**) plus
`name`, `type-v2`, `layout-strategy-id` (`basic`, `free-form`, `flow`, `distribute-evenly`,
`trivial`), `param`, `hidden`, `is-fixed`, `fixed-size`, `show-title`, `url`, etc. Zone types
include `visual`, `filter`, `text`, `bitmap`, `web`, `paramctrl`, `title`, `empty`,
`layout-basic`, `layout-flow`, `dashboard-object`, `add-in`. Coordinates in `<zones>` are
unitless integers; whether they are pixels or a 0–100000 proportion depends on `is-pixels`
(0–100000 range is **an inference**, confirm against a real file). A zone's `name` is the
worksheet name for a `visual` zone (inference). Tiled versus floating is expressed by the
parent's `layout-strategy-id` and zone nesting, not by a per-zone flag `[NEEDS CLARIFICATION]`.

### Actions
`actions` holds legacy `action` (filter/highlight/URL via `ActionList-Command-G` and
`-Link-G`), `nav-action`, group actions (`edit-group-action`) and parameter actions
(`edit-parameter-action`).

### `.twbx`
Tableau's XSDs exclude `.twbx`. Per twbparser a `.twbx` is a ZIP holding one `.twb` plus data
and image assets; its manifest is not specified in anything read. **Inference:** a packaged
workbook is a ZIP, so import needs a browser-compatible unzip (`DecompressionStream` handles
deflate streams but not whole ZIP containers; a small ZIP reader is needed) and extracted data
must not be parsed.

## Mapping to umf.dashboard

| Tableau construct | `umf.dashboard` | Loss reporting |
|---|---|---|
| `datasource` with plain connection | `dataset` (kind `table` or `query`) | connection class, credentials, extract → `TABLEAU_CONNECTION` unsupported; retained natively |
| `column` role=dimension | `column` field | caption → field title only if the profile has a home; type is descriptive |
| `column` role=measure with calculation | `measure` with opaque expression `{language:'tableau-calc'}` | expression is opaque; LOD/table calcs → `TABLEAU_CALCULATION` unsupported |
| calculation class `bin` | none | `TABLEAU_BIN` unsupported |
| parameter column | none (CONTRACT-055: parameters have no neutral form) | `TABLEAU_PARAMETER` unsupported |
| worksheet, simple mark class + rows/cols/panes encodings | `visual` bar/line/area/scatter/pie/heatmap/table/counter | mark classes with no chart family (map, gantt, dual-axis, polygon…) → `TABLEAU_MARK_TYPE` unsupported, native only |
| shelf expressions with table-calc, dual axis, reference lines | none | `TABLEAU_SHELF_UNSUPPORTED` |
| worksheet `filter` / `groupfilter` on a dimension | page filter targets | context filters, top-N, condition filters → `TABLEAU_FILTER_KIND` |
| dashboard `zone` type `visual` | layout item for a visual | position rescaled to the grid; rescaling → `TABLEAU_GRID` representation-change |
| zone `filter` / `paramctrl` | filter / none | quick-filter scope (all-using-datasource vs worksheet) lost → `TABLEAU_FILTER_SCOPE` |
| zone `text` | `text` | rich-text runs reduced to markdown/plain → representation-change |
| zone `bitmap`, `web`, `add-in`, `button` | none | `TABLEAU_ZONE_TYPE` unsupported |
| floating zones (`free-form`), device layouts | none | `TABLEAU_FLOATING` / `TABLEAU_DEVICE_LAYOUT` unsupported; overlap is only a profile warning |
| actions | none | `TABLEAU_ACTION` unsupported |
| stories (`dashboard type=storyboard`) | none | `TABLEAU_STORY` unsupported |

Report codes are proposals named after the `LAKEVIEW_*` convention, each with a source pointer.

## Proposed `umf.tableau` shape (exact retention for XML)
UMF's lossless tagged tree (CONTRACT-018) is JSON-only. Options:
1. **Lossless XML tree** (recommended): store elements as an ordered tree of
   `{name, attributes:[[name,value]...], children}` plus text and comment nodes, with attribute
   order, namespace prefixes and declarations, whitespace-only text, entity forms (`&#10;` etc.)
   and the XML declaration recorded. This mirrors the Lakeview split: document payload (root
   attributes and ordered child names), module per `dashboard`, `datasources` stored in a data
   module, element per `zone`/`worksheet`/`datasource`. Export reassembles in recorded order.
2. Store the original bytes as a base64 blob plus a derived index. Exact by construction, but
   edits to the neutral side cannot patch natively, and the retained content is not inspectable.
Exact byte equality additionally needs line endings, encoding and quoting style, so a
byte-exact claim should be limited to: *canonical re-serialization equals canonical source*,
with the same qualification CONTRACT-082 uses (whitespace not retained) unless option 2's
bytes are also kept. Unknown elements and `processContents="skip"` regions (such as
`connection`) are retained as ordinary tree nodes, so new Tableau versions cannot be dropped.
Parse with a browser-compatible XML reader (`DOMParser` exists in browsers but not in Bun's
runtime) so `src/` stays free of Node APIs `[NEEDS CLARIFICATION]`: choose a small
dependency-free parser or inject one.

## Open questions
- `[NEEDS CLARIFICATION]` No real `.twb` was read. Zone coordinate units, tiled/floating
  representation, shelf text grammar, and relation/join element names need a real sample.
  Candidates must be openly licensed; none was verified here.
- `[NEEDS CLARIFICATION]` Which Tableau versions to claim (XSDs exist for 2026.1 and 2026.2;
  older workbooks are not covered by any schema read).
- `[NEEDS CLARIFICATION]` XML parser choice for browser-compatible `src/`.
- `[NEEDS CLARIFICATION]` Whether the `.twbx` ZIP reader belongs in core or an adapter.
- `[NEEDS CLARIFICATION]` Whether to carry caption/title of fields in the neutral profile.

## Proposed next build item
AB-003 should be split. First an XML retention layer (`umf.tableau`, lossless tree, round-trip
test on a synthetic `.twb` authored from this XSD and checked with the XSD). Then the
projection to `umf.dashboard` limited to datasources, simple worksheets and tiled dashboards,
with the loss codes above. Confirm structure against one openly licensed real workbook first.
