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
    - id: US-094
      kind: informed_by
    - id: TD-092
      kind: informed_by
---

# TD-093: Neutral-to-Lakeview export

## Approach

`src/adapters/lakeview/export.ts`. To tell edits from untouched content, the exporter
re-runs `projectLakeview` over the retained native dashboard (the same ids as the
document) and compares each module's and element's neutral declaration with that
baseline. Equal means retained; a difference in a patchable member edits a clone of the
native tree in place, so untouched members keep their tokens and order; any other
difference rebuilds that one item. Items without a payload are synthesized, and a
document without any payload is synthesized whole. Synthesis is the inverse of the
projector's reading rules (field names such as `sum(x)`, `measure(x)`, per-target filter
queries, scale and format reversal), so a synthesized dashboard re-imports to the same
neutral declaration. The dashboard title has no baseline (Lakeview files carry none), so
a retained document cannot detect a title edit; a synthesized export reports it.

## Limits

Compared by deep equality of JSON, so editing a neutral member to an equal value is not
an edit. Spec versions follow the fixture (counter, table 2; others 3).
