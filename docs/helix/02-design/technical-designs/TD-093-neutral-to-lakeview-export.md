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

## Approach

Exact reuse needs a way to tell "unchanged" from "edited" without storing a copy of the
old neutral declaration. The importer is deterministic, so the baseline is recomputed:
`projectLakeview` runs over the retained native fragments and its output is compared
with the document's declaration. For an edit, the difference between
`synthesize(baseline)` and `synthesize(current)` is applied to the retained tagged tree,
which touches only members the edit changes and does not depend on the synthesis
reproducing the native file.

## Components

`src/adapters/lakeview/synthesize.ts` holds pure functions from neutral payloads to
native members, each returning the issues for what it assumed. `exportNeutralToLakeview`
in `src/adapters/lakeview/index.ts` assembles the document, owns `patch` (a structural
diff applied to a `NativeJson` tree; arrays patch element-wise only when lengths agree)
and reports. Tests are in `tests/lakeview/export.test.ts`.

## Risks

Synthesis conventions come from one export. A native widget the importer partly projected
is patched, not replaced, so unprojected members survive an edit. Legacy six-column pages
in a twelve-column document are left alone rather than rescaled.
