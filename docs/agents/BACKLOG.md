# Agent backlog

Statuses: `open`, `in-review` (PR open), `done` (PR merged into `agent-work`), `blocked`.
Agents take the first `open` item whose dependencies are `done`. Humans reorder freely.

## AB-001 — Neutral → Lakeview export
- **Type:** build · **Status:** in-review · **Depends on:** — · **PR:** https://github.com/garyfischer-maker/umf/pull/1
- Export a `umf.dashboard` declaration to `.lvdash.json`. Where an element still carries
  its `umf.lakeview` payload and its neutral declaration is unchanged from what
  `importLakeviewDashboard` would project, reuse the retained native JSON exactly;
  otherwise synthesize widget JSON from the neutral declaration and report what the
  synthesis had to assume.
- **Done when:** importing the marketing-campaign fixture and exporting with no edits
  yields the source tokens; editing a visual's title, a filter target and a page title
  each changes only the corresponding native members; a document with no `umf.lakeview`
  payloads exports a dashboard that re-imports to an equivalent neutral declaration;
  new story criteria are SATISFIED in the ledger.

## AB-002 — Tableau workbook structure research
- **Type:** research · **Status:** open · **Depends on:** — · **PR:** —
- Document the `.twb` XML and `.twbx` package structure needed for import: datasources
  and connections, columns and calculated fields, worksheets (shelves, marks, filters),
  dashboards (zones, tiled vs floating), parameters and actions. Map each to
  `umf.dashboard` or to a loss category, and propose the shape of a native `umf.tableau`
  extension (UMF has no XML-native precedent yet; say how exact retention could work).
- Use public Tableau documentation and openly licensed sample workbooks; the repo has no
  committed Tableau file yet.

## AB-003 — Tableau importer
- **Type:** build · **Status:** open · **Depends on:** AB-002 · **PR:** —
- Implement `umf.tableau` (exact retention) and `.twb`/`.twbx` → `umf.dashboard` with a
  loss report, following AB-002's findings and the Lakeview importer's structure.
- Needs a committed test workbook. If none exists when this item starts, author a small
  synthetic `.twb` from AB-002's findings and say so in the PR.

## AB-004 — Upstream test hygiene write-up
- **Type:** research · **Status:** open · **Depends on:** — · **PR:** —
- Write draft upstream issues (for a human to file) for failures that occur on any fresh
  checkout: the Chromium 148 pin vs Playwright 1.63's Chromium 153; `/home/erik/...`
  absolute paths in key evidence; the stale tablespec loader hash; evidence that hashes
  `dist/*` bundles which a fresh checkout does not have; and a note that installs made
  from a CRLF checkout apply `patches/jsonld@9.0.0.patch` with CRLF lines. For each:
  reproduction, affected tests, root cause with file:line, and a proposed fix.

## AB-005 — Lakeview export: Databricks acceptance check
- **Type:** research · **Status:** open · **Depends on:** AB-001 · **PR:** —
- AB-001's synthesized widget shapes (spec versions, query field names, filter default
  data types) come from dashboards observed during import work, not a Databricks schema.
  Find public Databricks documentation or open samples that confirm or contradict each
  assumption listed in CONTRACT-083, and list what a human with a workspace should try
  importing.

## AB-006 — Lakeview export: carry plain column titles, types and widget query filters
- **Type:** build · **Status:** open · **Depends on:** AB-001 · **PR:** —
- Exports currently report neutral field titles/types and unused declared fields as
  `LAKEVIEW_EXPORT_UNMAPPED`. Decide with a human whether `umf.lakeview` should gain a
  place for them (for example dataset `columns` entries) before building anything.
