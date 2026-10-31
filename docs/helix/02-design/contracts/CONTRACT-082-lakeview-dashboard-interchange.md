---
ddx:
  id: CONTRACT-082
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
    - id: CONTRACT-055
      kind: informed_by
    - id: US-093
      kind: informed_by
---

# CONTRACT-082: Lakeview dashboard interchange

**Profile:** `umf.lakeview` 0.1.0. **Native representation:** Databricks AI/BI
(Lakeview) `.lvdash.json` as observed in exported dashboards; no published Databricks
schema or workspace oracle is claimed. **Neutral projection:** `umf.dashboard` 0.1.0.

## Retention

Native JSON is held as the lossless tagged tree used by `umf.delta` (CONTRACT-018):
number tokens and member order are kept and nothing is parsed into host numbers. The
dashboard is split by identity rather than stored once:

| Scope | Kind | Native content |
|---|---|---|
| document | `dashboard` | top-level members except `datasets` and `pages`, plus `order`, the full top-level member order |
| module | `data` | none; holds dataset elements in source order |
| module | `page` | the page object except `layout`, plus `order` |
| element | `dataset` | one `datasets` item |
| element | `layout-item` | one page `layout` item (`widget` and `position`) |

Module ids are page `name`s; the data module is `data`, suffixed if a page already uses
that name. Element ids are dataset and widget `name`s, suffixed on a duplicate; missing
names fall back to their position. Module and element order are the native order.

`LAKEVIEW_SCOPE` and `LAKEVIEW_PLACEMENT` reject wrong attachment scope or container;
`LAKEVIEW_ROOT` rejects element payloads without a document-level dashboard;
`LAKEVIEW_NATIVE` rejects a non-object native root; `LAKEVIEW_ORDER` rejects an `order`
that is not exactly the retained members plus, where reassembled, `datasets`, `pages`
or `layout`. Unknown wrapper fields are `LAKEVIEW_REPRESENTATION` and block export.
Every document carries `LAKEVIEW_CONTEXT_UNVERIFIED`: widget specs are not checked
against Databricks, so interpretation is never complete.

## Export

`exportLakeviewDashboard` reassembles members in recorded order, datasets from the data
module and pages from page modules in module order, and renders compact JSON. The
result equals the source after the same compact rendering; whitespace and line endings
are not retained.

## Neutral Export

`exportNeutralLakeviewDashboard(document)` returns `{text, issues}`; `text` is compact
`.lvdash.json`. The neutral declaration is authoritative for structure: datasets come
from dataset elements of data modules in module order, pages from `umf.dashboard`
`pages`, and layout items from page-module elements in element order. A retained native
item that has no neutral payload (never projected) is kept; an element removed from the
document is removed from the export.

Each retained item is compared with the baseline the importer projects from the
retained native content. Equal items reuse their native JSON exactly. For an edited
item only these members are rewritten: dataset `displayName` and query text
(`queryLines` or `query`); visual and filter `spec.frame.title` and `description`;
widget `position` (legacy six-column pages divide `x` and `width` by two, and an odd
value is reported); text-box lines; a filter target's query `datasetName` and column
expression (same number of targets only); page `displayName` and `pageType`; theme
members of `uiSettings.theme`. Any other changed neutral member is reported as
`LAKEVIEW_EXPORT_EDIT` and the retained native content is unchanged.

An item with no retained native JSON is synthesized in the shapes the importer reads
back: widget and dataset names are element ids, page names are module ids, datasets
write `queryLines` and measure `columns`, visuals write one `main_query`, filters one
query per target, text boxes `multilineTextboxSpec`, and a twelve-column document marks
pages `GRID_V1`. Synthesis assumptions are reported as `LAKEVIEW_EXPORT_ASSUMPTION`
(`representation-change`): spec versions (counter and table 2, filters 2, other charts
3), table sources written as `SELECT *`, plain text written as markdown, and the whole
dashboard when nothing was retained. Neutral members with no native spelling (field
types and titles, `detail` encodings, date formats, extra encodings of a singular
channel, unknown properties) are `LAKEVIEW_EXPORT_UNEXPRESSED` (`unsupported`).
Export issue paths are JSON Pointers into the exported file. Spec shapes are inferred
from imported dashboards; acceptance by Databricks is unverified.

## Projection

Pages map `displayName` to title and `PAGE_TYPE_GLOBAL_FILTERS` to role
`global-filters`, otherwise `canvas`. Datasets become query sources in language
`databricks-sql` (`queryLines` joined, or `query`); `columns` entries with an expression
become `measure` fields keyed by `displayName`; plain columns are declared from the
projected widgets that use them. Field types are not inferred.

A widget query field expression resolves as: `` `c` `` → column `c`, aggregation
`none`; ``MEASURE(`m`)`` → measure `m`; `SUM`/`AVG`/`MIN`/`MAX`/`COUNT` of one column
→ that aggregation; `COUNT(DISTINCT `c`)` → `count-distinct`; any other aggregate over
one column → `custom` with the expression retained; a non-aggregate function of one
column → that column with `representation-change`. Qualified references, queries
without a `datasetName` (both read relationship-graph sources), multi-column
expressions and ``COUNT(`*`)``, which names no field the profile can declare, are
`unsupported` and the widget is not projected.

Widget types `counter`, `bar`, `line`, `area`, `scatter`, `pie`, `heatmap` and
`table` become visuals; `extra` becomes `tooltip`, table `columns` become `column`
encodings, and `y.fields` become repeated `y` encodings. `scale.sort.by` on one axis by
the other axis maps to value order, `natural-order` and `alphabetical` to label order,
`-reversed` descending, and `custom-order` with `orderedValues` to a custom sort.
Formats `number` and `number-plain`, `number-currency` and `number-percent` map to
number, currency and percent. `disaggregated: true` is `rows: detail`. A dataset no
projected item draws a field from is not projected, because the profile requires at
least one field. Text boxes (`multilineTextboxSpec`,
`textbox_spec`) become markdown text. `filter-single-select`, `filter-multi-select`,
`filter-date-range-picker`, `filter-text-entry` and `filter-range-slider` become
filters whose targets resolve each `queryName` to a dataset and plain column; a
single-value or multi-value default maps to `default.values`. Frame titles and
descriptions map directly; a shown frame is the neutral default.

Pages with `layoutVersion: GRID_V1` use twelve columns and pages without one use six.
The document grid is twelve if any page is `GRID_V1`; legacy pages are then doubled
horizontally (`LAKEVIEW_GRID`). Theme colors, font and visualization colors map to the
neutral theme; `fontSettings.base` supplies the font and font color only when the
top-level spelling is absent.

## Loss Report

`importLakeviewDashboard` returns `{document, issues}`. Each issue is
`{path, code, classification, detail, retainedInSource: true}` where `path` is a JSON
Pointer into the source file. Codes are `LAKEVIEW_WIDGET_TYPE`, `LAKEVIEW_EXPRESSION`,
`LAKEVIEW_QUERY_FILTER` (the neutral visual is broader than the native one),
`LAKEVIEW_ORDER_BY`, `LAKEVIEW_PARAMETER`, `LAKEVIEW_RELATIONSHIP`,
`LAKEVIEW_DATASET_CONTEXT`, `LAKEVIEW_FILTER_DEFAULT`, `LAKEVIEW_FILTER_ASSOCIATIVITY`,
`LAKEVIEW_FORMAT`, `LAKEVIEW_GRID`, `LAKEVIEW_STYLE`, `LAKEVIEW_FIELD_COLLISION`,
`LAKEVIEW_PROJECTION` (the item could not be built, or the profile rejected it, and it
is omitted) and
`LAKEVIEW_UNMAPPED` (native content no rule consumed). Every native member is either
consumed by a mapping rule or reported, so the report is complete with respect to the
source. The issues map to HELIX `[NEEDS CLARIFICATION]` markers in dashboard workflows.

## API

`lakeviewRegistry()` registers `umf.dashboard` and `umf.lakeview`;
`inspectLakeview(document)` validates both. `importLakeviewDashboard(text, {id, title?,
namespace?})`, `exportLakeviewDashboard(document)` and
`getLakeviewNative(document, module?, element?)`, which returns a copy of the rendered
native JSON for the document, a page or an element.
