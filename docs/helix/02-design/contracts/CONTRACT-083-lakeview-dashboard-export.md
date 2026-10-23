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
    - id: CONTRACT-055
      kind: informed_by
    - id: US-094
      kind: informed_by
---

# CONTRACT-083: Neutral to Lakeview dashboard export

**Profile:** `umf.dashboard` 0.1.0 to `umf.lakeview` 0.1.0 native files. **Native
representation:** as CONTRACT-082; no Databricks schema or workspace oracle is claimed.

## API

`exportNeutralDashboard(document)` returns `{text, issues}`: compact `.lvdash.json` text
and a report. The document must validate under the dashboard and Lakeview registries and
carry `umf.dashboard` 0.1.0 with a document-level dashboard; otherwise it throws. It may
carry no `umf.lakeview` payloads at all, retained payloads only on some items, or the full
set an import produces. `exportLakeviewDashboard` (CONTRACT-082) remains the exact
export of retained content and ignores neutral edits.

## Decision per item

Each dataset, page and layout item is exported by the first rule that applies:

1. **Reuse.** The item has retained native JSON and its neutral declaration equals what
   `importLakeviewDashboard` would project from the assembled file; the retained JSON is
   used token for token.
2. **Patch.** The neutral declaration differs and every difference is one of: visual,
   filter or dataset title; description; text-box text (markdown); position; filter
   targets (same count); filter default values (same count); dataset query text
   (Databricks SQL) and measure expression or description; page title and role; theme
   font, palette and role colors; page order. Only the matching native members are
   written; new members are appended after existing ones.
3. **Synthesize.** Otherwise, or when the item has no native JSON, the native JSON is
   built from the neutral declaration.

After patching, the file is projected again; an item whose projection still differs
from its neutral declaration falls to rule 3. Synthesis uses the shapes observed in
exported dashboards: widget spec versions 2 (counter, table, filters) and 3 (other
charts), a single `main_query` per visual and one query per filter target, query fields
named from their aggregation, `queryLines` split after newlines, `showTitle` and
`showDescription` true, and pages with `layoutVersion` `GRID_V1` (twelve columns) or
none (six).

## Report

Each issue is `{path, code, classification, detail}`; `path` is a JSON Pointer into the
exported file, or `''` for the dashboard.

| Code | When |
|---|---|
| `LAKEVIEW_EXPORT_SYNTHESIZED` | A dataset, page, layout item or the dashboard container was built from the neutral declaration. `detail` lists the assumptions; for a replaced retained item it also lists the native member pointers (relative to the item) that were not carried over. |
| `LAKEVIEW_EXPORT_UNMAPPED` (`unsupported`) | Neutral members the re-imported file would not reproduce, as JSON Pointers into the neutral payload (for example plain column titles and types, text format `plain`, unused declared fields, the `detail` channel, theme name, dashboard description, a non-twelve/six grid). |
| `LAKEVIEW_EXPORT_UNMAPPED` (`annotation-only`) | Always present: `.lvdash.json` has no member for the dashboard title or description. |

The check is round-trip equality of neutral payloads (key order ignored, array order
significant); it says nothing about how Databricks interprets the file.

## Limits

Field types are never written. A repeated channel shares its first encoding's scale and
format. Table sources become `SELECT *` queries. Expressions are written as Databricks
SQL whatever their declared language, with an assumption noted. Page order follows
`umf.dashboard` `pages`.
