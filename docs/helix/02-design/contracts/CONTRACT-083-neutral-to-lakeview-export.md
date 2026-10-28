---
ddx:
  id: CONTRACT-083
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-082
      kind: informed_by
    - id: US-094
      kind: informed_by
---

# CONTRACT-083: Neutral to Lakeview export

**Profile:** `umf.lakeview` 0.1.0 and `umf.dashboard` 0.1.0 (CONTRACT-082, CONTRACT-055).
**Evidence:** UMF's own importer only; no Databricks schema or workspace oracle.

## API

`exportNeutralToLakeview(document)` returns `{text, issues}`. `text` is the rendered
`.lvdash.json`; each issue is `{path, code, classification, detail, retainedInSource:
true}` with `path` a JSON Pointer into `text`. It throws when the document fails
`inspectLakeview`, carries unknown representation fields, has no document-level
`umf.dashboard` declaration, or declares a grid that is not 6 or 12 columns.
`exportLakeviewDashboard` is unchanged: it exports retained native content only.

## Per-element rule

For each dataset, layout item and page, the importer's projection of the retained native
content is recomputed (the baseline) and compared with the element's current neutral
declaration.

- Equal: the retained native payload is reused token for token.
- Different: the baseline and the current declaration are both synthesized and the
  difference between the two synthesized values is applied to the retained payload;
  members the difference does not touch keep their tokens. Reported as
  `LAKEVIEW_SYNTH_PATCH`.
- No payload: the element is synthesized in full.
- Payload but no neutral declaration: the retained payload is kept. A neutral declaration
  on a payload the importer did not project is ignored and reported as
  `LAKEVIEW_SYNTH_SKIPPED`.

The theme follows the same rule against `uiSettings.theme`. Pages are exported in module
order; a neutral page list in another order is reported as `LAKEVIEW_SYNTH_ORDER`.

## Synthesis

Names are element ids (retained names are kept). Datasets become `queryLines` plus
`columns` for measures. Visuals become one `main_query` whose field names follow
`measure(f)`, `sum(f)` or the bare column; filters become one query per target dataset and
no associativity field. Spec versions are 2 for counter, table and filters and 3 for the
other charts. Pages are `GRID_V1` in a twelve-column document and unmarked in a
six-column one. These choices are copied from the one observed export and reported as
`LAKEVIEW_SYNTH_ASSUMPTION`.

## Codes

`LAKEVIEW_SYNTH_ASSUMPTION` (representation-change), `LAKEVIEW_SYNTH_PATCH`,
`LAKEVIEW_SYNTH_ORDER`, `LAKEVIEW_SYNTH_SKIPPED`, `LAKEVIEW_SYNTH_GRID`,
`LAKEVIEW_SYNTH_LANGUAGE`, `LAKEVIEW_SYNTH_FIELD`, `LAKEVIEW_SYNTH_ENCODING`,
`LAKEVIEW_SYNTH_FORMAT`, `LAKEVIEW_SYNTH_TARGET`, `LAKEVIEW_SYNTH_DEFAULT` and
`LAKEVIEW_SYNTH_ANNOTATION` (unsupported or annotation-only content dropped from the
export). Edits to widgets on a six-column legacy page in a twelve-column document, new
widgets there, and grid-column changes are not exported and reported.

## Known limits

Deleting a neutral declaration does not delete native content. Neutral `date` formats,
the `detail` channel, query languages other than Databricks SQL, and mixed-type filter
defaults have no native form.
