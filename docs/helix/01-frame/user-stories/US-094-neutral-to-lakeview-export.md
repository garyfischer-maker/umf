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

# US-094: Export a neutral dashboard declaration to Lakeview

**Feature**: FEAT-034

As a dashboard designer, I want to export an edited `umf.dashboard` declaration back to
a Lakeview `.lvdash.json`, reusing the native content I imported wherever the neutral
declaration did not change, so that restyling a dashboard never rewrites the parts I
did not touch and every assumption made for new content is reviewable.

## Acceptance Criteria

- **US-094-AC1:** Importing the marketing-campaign fixture and exporting without edits
  yields the source tokens and member order, every item is reported as retained, and no
  issues are reported.
- **US-094-AC2:** Editing a visual's title, a filter's targets and a page's title each
  changes only the matching native members (`spec.frame.title`, the filter's `queries`
  and `encodings.fields`, the page `displayName`); all other tokens are unchanged and
  only the edited items are reported as patched.
- **US-094-AC3:** A document with no `umf.lakeview` payloads exports a dashboard that
  re-imports to an equivalent neutral declaration (pages, grid, theme, datasets,
  visuals, text and filters), and the assumptions made are reported.
- **US-094-AC4:** A neutral edit that cannot be written into the retained native
  content rebuilds that one item from the neutral declaration and reports it; neutral
  members with no Lakeview form (dashboard title, trace, grid size) are reported rather
  than dropped silently; an invalid neutral declaration is refused.

## Evidence and Limits

`tests/lakeview/export.test.ts` over the marketing-campaign dashboard (synthetic data).
There is no Databricks oracle: re-import by UMF's own importer is the only check that a
synthesized dashboard is well formed, and acceptance by a workspace is unverified.
Synthesized widget spec versions and filter default data types are assumptions.
