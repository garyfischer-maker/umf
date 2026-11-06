---
ddx:
  id: TD-093
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-083
      kind: informed_by
    - id: US-094
      kind: informed_by
    - id: TD-092
      kind: informed_by
---

# TD-093: Neutral to Lakeview dashboard export

## Approach

Verify by re-projection rather than by tracking edits. `src/adapters/lakeview/export.ts`
assembles a native tree from retained payloads (a synthesized fragment stands in where an
item has none), runs the importer's own `projectLakeview` over it, and compares each
result with the neutral declaration in the document. Equal items keep their retained
tree untouched. Differing items go through a small set of patch functions, the tree is
projected again, and any item still differing is replaced by a synthesized fragment
(recording which native members were dropped). A final projection yields the
"not reproduced" report. Because the same projection defines both "unchanged" and
"reproduced", the exporter cannot drift from the importer's rules.

## Components

`exportDashboardFromNeutral` takes the Lakeview inspector as a parameter to avoid an import
cycle; `exportNeutralDashboard` in `index.ts` binds it. `project.ts` exports its channel,
control, format and theme-role tables so synthesis uses their inverses.

## Limits and Open Questions

- Synthesis shapes (spec versions, query field names, default data types) come from the
  dashboards observed during TD-092 development, not from a Databricks schema.
  [NEEDS CLARIFICATION]
- Each export validates the document and projects the file three times; the validation
  dominates and is seconds for a hundred widgets.
- Unreferenced datasets with retained JSON but no neutral payload are exported as
  retained. Deleting a neutral payload does not delete the native widget; remove the
  element.
- `LAKEVIEW_EXPORT_UNMAPPED` lists pointers only; it does not rank them by consequence.
