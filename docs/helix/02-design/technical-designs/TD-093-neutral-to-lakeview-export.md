---
ddx:
  id: TD-093
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-083
      kind: informed_by
    - id: TD-092
      kind: informed_by
    - id: US-094
      kind: informed_by
---

# TD-093: Neutral to Lakeview export

## Approach

`src/adapters/lakeview/export.ts` decides per unit whether the neutral edit is visible.
It re-runs `projectLakeview` over the retained native JSON (reassembled by
`exportNeutralToLakeview` in `index.ts`) to get the neutral baseline for every module and
element, then compares each current declaration to its baseline. Equal units keep their
retained tagged tree untouched, so number tokens and member order survive. Differing units
are patched on a clone of the tree: the patch functions throw `Fallback` for any edit with
no single native home, and the caller then rebuilds the unit with the synthesizer under
its existing native name. Comparing against a baseline means the exporter never diffs native files.

## Limits and Open Questions

- Synthesized spec versions (counter and table 2, others 3), query and field names and
  filter query names are copied from observed exports; a workspace may reject or
  normalise them. [NEEDS CLARIFICATION]
- `label-ascending` and `alphabetical` sort both map back to `natural-order`.
- Filter target patching needs the same number of targets and a one-to-one query field
  per target; adding or removing a target rebuilds the filter.
- A neutral declaration deleted while its native JSON remains exports the native
  unchanged; delete the element to remove the widget.
- Dataset columns that only exist because a widget uses them are not declared on export.
- Moving a visual to another dataset, changing encodings or the chart type rebuilds the
  widget and drops its native query orders, widget-level filters and styling.
