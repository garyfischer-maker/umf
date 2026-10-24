---
ddx:
  id: CONTRACT-083
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-082
      kind: informed_by
    - id: CONTRACT-055
      kind: informed_by
    - id: US-094
      kind: informed_by
---

# CONTRACT-083: Neutral to Lakeview export

**Profile:** `umf.dashboard` 0.1.0 to `umf.lakeview` 0.1.0 native JSON. Same evidence
limits as CONTRACT-082: no published Databricks schema and no workspace oracle.

## Rule

`exportNeutralToLakeview(document)` returns `{text, issues}`. The document must pass
`inspectLakeview` and declare a document-level dashboard. Each unit (dataset element,
page module, layout-item element, theme) is exported in one of three ways:

1. **Reuse.** Where the unit carries `umf.lakeview` native JSON, the retained dashboard
   is projected again with `projectLakeview` as the baseline. If the unit's current
   neutral declaration equals its baseline, or it has no neutral declaration, or it has a
   neutral declaration but the baseline projected none (the import omitted it), its
   native JSON is exported with tokens and member order unchanged.
2. **Patch.** If the neutral declaration differs from its baseline, the differences are
   applied to the matching native members and nothing else changes:

   | Neutral change | Native members written |
   |---|---|
   | page `title`, `role` | `displayName`, `pageType` |
   | dataset `title`; query `text`; measure add, change, remove | `displayName`; `queryLines` or `query`; `columns` entries |
   | visual or filter `title`, `description` | `spec.frame.title`, `spec.frame.description` |
   | filter `targets` (same count) | the target query's `datasetName` and field `expression`; the field `name` and encoding `fieldName` when they equalled the old column |
   | text `content.text` | `multilineTextboxSpec.lines` or `textbox_spec` |
   | item `position` | `position` members; `x` and `width` are halved on legacy six-column pages in a twelve-column document |
   | theme `fontFamily`, `palette`, `roles` | `uiSettings.theme` `fontFamily`, `visualizationColors`, role colors |

3. **Synthesize.** A unit with no native JSON (a neutral-only element or page, or a
   document without `umf.lakeview`), or an edit the patch table does not cover, is built
   from the neutral declaration. A rebuilt unit that had native JSON keeps its native
   `name` so references resolve, but native members the neutral declaration does not
   express (query orders, widget-level filters, styling) are replaced; the issue says so.

Pages are written in `umf.dashboard` page order. New pages use `GRID_V1` unless the
document grid has six columns. New datasets and widgets are named by their element ids.

## Synthesis rules (inverse of CONTRACT-082 Projection)

Datasets become `queryLines` of the query text (a table source becomes
`SELECT * FROM <table>`); measures become `columns` with `displayName` and `expression`.
A visual becomes one `main_query` whose fields are generated from each encoding: `` `c` ``,
``MEASURE(`m`)``, ``SUM(`c`)`` and the other simple aggregates, ``COUNT(DISTINCT `c`)``, or the
custom expression text; field names are `c`, `measure(m)`, `sum(c)` and so on. Channels map
back as `tooltip` to `extra` and `column` to `columns`; repeated `y` encodings become
`y.fields` sharing the first one's scale and format. Value sort maps to the opposite axis
(`-reversed` for descending), label sort to `natural-order`, custom sort to `custom-order`.
Formats map to `number`, `number-currency` and `number-percent` with exact decimal places.
Filters become one query per target plus `encodings.fields`; defaults become
`selection.defaultSelection`. Text becomes `multilineTextboxSpec`.

## Issues

`{path, code, classification, detail}` where `path` points into the neutral document.
`LAKEVIEW_EXPORT_SYNTHESIZED` (unit built or rebuilt; detail lists assumptions such as
generated spec versions and field names), `LAKEVIEW_EXPORT_ASSUMPTION` (a patch rounded
a position or dropped a format), `LAKEVIEW_EXPORT_DROPPED` (a neutral property such as
`trace`, `grain` or a theme `name` has no native member), `LAKEVIEW_EXPORT_IGNORED` (a
neutral declaration could not be exported because its native unit has no baseline, or the
column count changed). Channel `detail` and format kind `date` have no native form and are
omitted with a synthesized-issue assumption. The dashboard `title` has no native member
and is not reported.

## Errors

`LAKEVIEW_DOCUMENT` (invalid document), `DASHBOARD_PROFILE` (not a dashboard),
`LAKEVIEW_PAYLOAD` and `LAKEVIEW_EXPORT` as for `exportLakeviewDashboard`.
