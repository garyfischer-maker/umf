---
ddx:
  id: US-094
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-034
      kind: informed_by
    - id: US-093
      kind: informed_by
---

# US-094: Export a neutral dashboard to Lakeview

**Feature**: FEAT-034

As a dashboard designer, I want to export a `umf.dashboard` declaration to a Databricks
AI/BI (Lakeview) `.lvdash.json`, so that edits made to the neutral form reach the native
dashboard without disturbing anything I did not change, and without silent guesses
where no native content exists.

## Acceptance Criteria

- **US-094-AC1:** Importing the marketing-campaign dashboard and exporting its neutral
  declaration with no edits yields the source tokens and member order, directly and
  after a UMF JSON/YAML round trip, with an empty report.
- **US-094-AC2:** Editing a visual's title, a filter's target and a page's title each
  changes only the corresponding native members (frame title; query dataset name and
  field expression; page display name); every other native token is unchanged and no
  issue is reported. A moved position and an edited text box likewise change only their
  own members.
- **US-094-AC3:** A document with no `umf.lakeview` payloads exports a dashboard that
  re-imports without loss-report entries to an equivalent neutral declaration, and the
  export reports that its members were synthesized, including assumed spec versions.
  Items and pages added to an imported document are synthesized beside retained ones.
- **US-094-AC4:** A neutral edit with no native write rule (for example a changed
  encoding) leaves the retained native widget unchanged and is reported as
  `LAKEVIEW_EXPORT_EDIT`; neutral members with no native spelling are reported as
  `LAKEVIEW_EXPORT_UNEXPRESSED` rather than dropped silently; deleting a neutral item's
  element removes it; invalid documents are refused.

## Evidence and Limits

`tests/lakeview/export.test.ts` uses the marketing-campaign dashboard (synthetic data)
and authored edits. Evidence is the importer as oracle for synthesized output; there is
no Databricks oracle, so acceptance of exported or synthesized files by a workspace is
unverified. CONTRACT-082 governs rule scope.
