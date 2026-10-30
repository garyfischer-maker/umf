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

**Operation:** `exportNeutralDashboard(document)` returns `{text, issues}`; `text` is
compact `.lvdash.json`. Governed by CONTRACT-082 (retention) and CONTRACT-055 (profile).
The document must validate as `umf.dashboard` 0.1.0.

## Per element

1. **Unchanged.** If the neutral declaration equals what `importLakeviewDashboard`
   projects from the element's retained native JSON (re-projected at export time), the
   native tokens are reused exactly.
2. **Member edit.** Supported edits are applied as member changes to a copy of the
   native tree: dataset title and query text; widget title, description, position
   (divided by 2 on legacy six-column pages), control, filter default and same-count
   filter targets; text content; page title.
3. **Regeneration.** Any other change regenerates the widget or dataset from the
   neutral declaration. `LAKEVIEW_EXPORT_RESYNTHESIZED` lists the retained native members
   that are absent afterwards.
4. **No payload.** Elements, pages and datasets without `umf.lakeview` are synthesized.
   Assumptions are reported as `LAKEVIEW_EXPORT_ASSUMPTION` (widget spec version, filter
   default data type, sort spelling, table sources, dropped dataset field metadata,
   dashboard title, theme name).

Page role and theme edits are not applied (`LAKEVIEW_EXPORT_UNAPPLIED`). Removing a
neutral declaration does not delete native content. Issues use the importer's issue type,
whose `retainedInSource` is fixed `true`; for synthesized output it means only that the
neutral document still holds the meaning. Paths are JSON Pointers into the exported file.
