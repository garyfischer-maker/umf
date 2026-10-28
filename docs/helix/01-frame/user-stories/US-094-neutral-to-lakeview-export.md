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
AI/BI (Lakeview) `.lvdash.json`, reusing the native content I imported wherever I did not
change it, so that edits I make to the neutral form reach Lakeview without disturbing
anything else and without hiding what the export had to assume.

## Acceptance Criteria

- **US-094-AC1:** Importing the marketing-campaign `.lvdash.json` and exporting the
  neutral declaration with no edits yields the source tokens and member order, and
  reports no issues.
- **US-094-AC2:** Editing a visual's title, a filter's targets or a page's title, or the
  theme palette, changes only the corresponding native members; each edit is reported as
  a `LAKEVIEW_SYNTH_PATCH` naming the native members it changed.
- **US-094-AC3:** A document with no `umf.lakeview` payloads exports a dashboard that
  re-imports to an equivalent neutral declaration (root, pages, datasets, visuals,
  filters and text), and the export reports its assumptions.
- **US-094-AC4:** Neutral content with no native form (a channel, a format kind, a
  dataset reference that is not exported), an edit to a widget on a six-column legacy page
  in a twelve-column document, and a neutral declaration added to a native widget the
  importer did not project are each reported and keep the native member; a grid that is
  neither 6 nor 12 columns, or a document with no neutral declaration, fails.

## Evidence and Limits

`tests/lakeview/export.test.ts` uses the synthetic marketing-campaign dashboard and
authored edits. The only oracle is UMF's own importer; there is no Databricks oracle, so
acceptance of a synthesized dashboard by a workspace is unverified. CONTRACT-083 governs
the synthesis rules.
