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

# TD-093: Neutral to Lakeview export

`src/adapters/lakeview/index.ts` (`exportNeutralDashboard`) orchestrates; per-widget
patching and synthesis live in `src/adapters/lakeview/export.ts`.

The export re-projects the retained native JSON with `projectLakeview`, using the
document's own module and element ids by position, to get a baseline per element.
Comparing the current neutral declaration with that baseline decides reuse, patch or
regeneration, so no hash or dirty flag is stored. The result is reassembled with the
existing member-order reassembly, so unrelated tokens and member order are untouched.
Synthesis inverts the importer's tables (channels, controls, formats, aggregations)
so that synthesized output re-imports to an equivalent declaration.
