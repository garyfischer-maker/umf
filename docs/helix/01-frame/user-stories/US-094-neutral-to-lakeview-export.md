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

# US-094: Export a neutral dashboard to Lakeview with an explicit loss report

**Feature**: FEAT-034

As a dashboard designer, I want to export an edited `umf.dashboard` declaration back to
a Databricks AI/BI (Lakeview) `.lvdash.json`, reusing the native content I imported
wherever I did not change it, so that my edits reach the native file without losing
what the neutral profile cannot express.

## Acceptance Criteria

- **US-094-AC1:** Importing the marketing-campaign fixture and exporting the neutral
  document with no edits yields the source tokens and member order, with an empty
  export report.
- **US-094-AC2:** Editing a visual's title, a filter's target column and a page's title
  each changes only the corresponding native members; every other token is unchanged.
  A neutral edit that has no native rule is reported as `LAKEVIEW_EXPORT_UNSYNCED` and
  the retained native member is exported unchanged.
- **US-094-AC3:** A document with no `umf.lakeview` payloads exports a dashboard that
  re-imports to an equivalent neutral declaration for pages, grid, theme, visuals, text
  and filters; dataset grain and column metadata, which have no native member, and
  each assumption made are reported.
- **US-094-AC4:** Items added to a retained dashboard are synthesized into the native
  file without changing retained members; a neutral document the profile rejects does
  not export.

## Evidence and Limits

`tests/lakeview/export.test.ts` uses the marketing-campaign fixture and the authored
US-077 declaration. There is no Databricks oracle: that a workspace accepts a
synthesized widget is unverified, and synthesized widget `version` numbers and query
field names are copied from the observed fixture. CONTRACT-082 governs rule scope.
