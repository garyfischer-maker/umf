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

# US-094: Export an edited neutral dashboard as Lakeview JSON

**Feature**: FEAT-034

As a dashboard designer, I want to export a `umf.dashboard` declaration I have edited
as a Databricks AI/BI (Lakeview) `.lvdash.json`, so that my edits reach the native
dashboard without disturbing anything the neutral declaration does not express.

## Acceptance Criteria

- **US-094-AC1:** Importing the marketing-campaign `.lvdash.json` and exporting the
  neutral declaration with no edits yields the source tokens and member order, with an
  empty issue list.
- **US-094-AC2:** Editing a visual's title, a filter target and a page title changes
  only the corresponding native members (`spec.frame.title`, the target's query dataset
  and field, `displayName`); editing a position changes only that item's `position`
  members.
- **US-094-AC3:** A document with no `umf.lakeview` payloads exports a dashboard that
  re-imports without losses to an equivalent neutral declaration (datasets, pages,
  visuals, text, filters, grid and theme); neutral properties with no native member are
  reported as `LAKEVIEW_EXPORT_DROPPED`.
- **US-094-AC4:** An edit with no one-to-one native member (for example a chart type)
  rebuilds only that widget from the neutral declaration, keeps its native name, and is
  reported as `LAKEVIEW_EXPORT_SYNTHESIZED` with the assumptions made; dataset title and
  query edits and theme edits change only their own native members.
- **US-094-AC5:** A neutral item added to a retained dashboard is appended and reported
  as synthesized; a document whose neutral declaration is invalid, or that is not a
  dashboard, is refused.

## Evidence and Limits

`tests/lakeview/export.test.ts` uses the marketing-campaign dashboard (synthetic data)
and the authored US-077 fixture. There is no Databricks oracle, so acceptance of an
exported file by a workspace is unverified; synthesized widget JSON follows shapes
observed in exported dashboards. CONTRACT-083 governs the export rules.
