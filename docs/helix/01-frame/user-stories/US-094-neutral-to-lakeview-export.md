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
    - id: US-077
      kind: informed_by
---

# US-094: Export a neutral dashboard to Lakeview

**Feature**: FEAT-034

As a dashboard designer, I want to export a `umf.dashboard` declaration back to a
Databricks AI/BI (Lakeview) `.lvdash.json`, so that edits made on the neutral form reach
the native dashboard without losing native content I did not touch.

## Acceptance Criteria

- **US-094-AC1:** Importing the marketing-campaign dashboard and exporting its neutral
  declaration with no edits yields the source tokens exactly, with no issues reported.
- **US-094-AC2:** Editing a visual's title, a filter target and a page title each changes
  only the corresponding native members (`frame.title`; the filter's query dataset/field
  and encoding field name; the page `displayName`); all other tokens are unchanged.
- **US-094-AC3:** A document with no `umf.lakeview` payloads exports a dashboard that
  re-imports to an equivalent neutral declaration, and the export reports what it had to
  assume.
- **US-094-AC4:** A neutral edit that is not a member-level change regenerates that
  widget from the neutral declaration and reports the retained native members that no
  longer appear; unapplied edits (page role, theme) are reported and the native content
  is kept.

## Evidence and Limits

`tests/lakeview/export.test.ts`. There is no Databricks oracle: acceptance of exported
files by a workspace is unverified, and synthesized widget spec versions are assumed.
