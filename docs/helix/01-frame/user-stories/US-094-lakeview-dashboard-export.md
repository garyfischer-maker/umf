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

# US-094: Export a neutral dashboard to Lakeview without losing retained native content

**Feature**: FEAT-034

As a dashboard designer, I want to export a `umf.dashboard` declaration to a Databricks
AI/BI (Lakeview) `.lvdash.json`, reusing the exact native JSON of anything I did not
change and being told what the export had to assume or could not carry, so that I can
restyle an imported dashboard or generate one from a neutral declaration.

## Acceptance Criteria

- **US-094-AC1:** An unedited import of the marketing-campaign dashboard exports to JSON
  with source tokens and member order unchanged, directly and after a UMF JSON/YAML
  round trip.
- **US-094-AC2:** Editing a visual's title, a filter's target and title, and a page's
  title changes only the corresponding native members of the exported file, and the
  edited file re-imports to the edited neutral declaration.
- **US-094-AC3:** A document with no `umf.lakeview` payloads exports a dashboard that
  re-imports to an equivalent neutral declaration; each synthesized dataset, page and
  layout item is reported with the assumptions made, and neutral members the file
  cannot reproduce are reported with their pointers.
- **US-094-AC4:** An edit no patch rule expresses replaces the retained widget JSON with
  a synthesized widget and lists the native members not carried over; an invalid neutral
  declaration or a document without `umf.dashboard` 0.1.0 is refused.

## Evidence and Limits

`tests/lakeview/export.test.ts` uses the marketing-campaign dashboard (synthetic data)
and authored edits; round trips are checked through the project's own importer, not a
Databricks workspace, so acceptance of an exported file by Databricks is unverified.
CONTRACT-083 governs rule scope.
