---
ddx:
  id: CONTRACT-083
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-082
      kind: informed_by
    - id: US-094
      kind: informed_by
---

# CONTRACT-083: Neutral-to-Lakeview export

**API:** `exportNeutralDashboard(document)` returns `{text, issues, elements}`.
**Governs:** `umf.dashboard` 0.1.0 to `.lvdash.json`; builds on CONTRACT-082.

## Rules

1. The document must carry a valid document-level `umf.dashboard`; otherwise the call
   throws `LAKEVIEW_EXPORT`. A document with `umf.lakeview` payloads must also pass
   `inspectLakeview` and have no unknown representation fields.
2. **Retained.** An item whose neutral declaration equals what the importer projects from
   its retained payload exports that payload token for token.
3. **Patched.** Changed neutral members map to native members only as follows: visual and
   filter `title`/`description` to `spec.frame`, `position` to `position` (legacy
   six-column pages divide by two), text `content` to the text-box lines, filter
   `targets` to the widget's `queries` and `encodings.fields` (entries for unchanged
   targets and entries the neutral form never expressed are kept), dataset `title` to
   `displayName`, page `title`/`role` to `displayName`/`pageType`, dashboard theme to the
   mapped `uiSettings.theme` members.
4. **Synthesized.** Any other change, and any item with no payload, is built from the
   neutral declaration. A rebuilt item loses native-only members and reports
   `LAKEVIEW_EXPORT_RESYNTHESIZED`. Assumptions (widget spec version, filter default data
   type, plain text as markdown, table source as `SELECT *`, non-Databricks-SQL languages
   written verbatim) report `LAKEVIEW_EXPORT_ASSUMED` or `LAKEVIEW_QUERY_LANGUAGE`.
5. Neutral members with no Lakeview form (dashboard title, `trace`, grid size, theme
   name, date formats, `detail` channel, field types) report `LAKEVIEW_EXPORT_UNMAPPED`
   or `LAKEVIEW_STYLE`; they are never dropped silently.
6. A neutral declaration the importer omitted stays omitted and its native payload is
   exported unchanged. The input document is never modified.
7. Expressions and queries are not parsed or validated; acceptance by Databricks is not
   claimed.
