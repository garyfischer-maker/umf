# Agent backlog

Statuses: `open`, `in-review` (PR open), `done` (PR merged into `agent-work`), `blocked`.
Agents take the first `open` item whose dependencies are `done`. Humans reorder freely.

## AB-001 — Neutral → Lakeview export
- **Type:** build · **Status:** done · **Depends on:** — · **PR:** https://github.com/garyfischer-maker/umf/pull/1
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
- **Superseded on this branch (2026-11-06):** `agent-work` was rebuilt on upstream `main`
  after upstream moved Lakeview into the Rust core. AB-001's TypeScript export did not
  carry over. It survives on `agent-work-old`, and AB-007 ports it.

## AB-002 — Tableau workbook structure research
- **Type:** research · **Status:** done · **Depends on:** — · **PR:** https://github.com/garyfischer-maker/umf/pull/4
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
- AB-002 findings (`docs/agents/findings/AB-002-tableau-workbook-structure.md`) recommend
  splitting this: first a lossless XML-tree retention layer for `umf.tableau` with an
  XSD-valid synthetic `.twb`, then the projection. Confirm structure on one openly licensed
  real workbook first.
- Needs a committed test workbook. If none exists when this item starts, author a small
  synthetic `.twb` from AB-002's findings and say so in the PR.
- Follow the current upstream Lakeview structure, not the PR42 TypeScript one: native
  retention, import, export and diagnostics in Rust (`crates/umf-core/src/lakeview.rs`),
  exposed through a thin TypeScript adapter over the shared native/WASM runtime
  (`src/adapters/lakeview/index.ts`), with text and byte entry points and an explicit
  native validator capability. AB-002's notes on the Lakeview split predate this.

## AB-004 — Upstream test hygiene write-up
- **Type:** research · **Status:** done · **Depends on:** — · **PR:** https://github.com/garyfischer-maker/umf/pull/5
- Write draft upstream issues (for a human to file) for failures that occur on any fresh
  checkout: the Chromium 148 pin vs Playwright 1.63's Chromium 153; `/home/erik/...`
  absolute paths in key evidence; the stale tablespec loader hash; evidence that hashes
  `dist/*` bundles which a fresh checkout does not have; and a note that installs made
  from a CRLF checkout apply `patches/jsonld@9.0.0.patch` with CRLF lines. For each:
  reproduction, affected tests, root cause with file:line, and a proposed fix.

## AB-005 — Lakeview export: Databricks acceptance check
- **Type:** research · **Status:** open · **Depends on:** AB-007 · **PR:** —
- The export's synthesized widget shapes (spec versions, query field names, filter
  default data types) come from dashboards observed during import work, not a Databricks
  schema. Find public Databricks documentation or open samples that confirm or contradict
  each assumption listed in the export contract AB-007 adds, and list what a human with a
  workspace should try importing.

## AB-006 — Lakeview export: carry plain column titles, types and widget query filters
- **Type:** build · **Status:** open · **Depends on:** AB-007 · **PR:** —
- AB-007's export reports neutral field titles/types and unused declared fields as
  `LAKEVIEW_EXPORT_UNMAPPED`. Decide with a human whether `umf.lakeview` should gain a
  place for them (for example dataset `columns` entries) before building anything.

## AB-007 — Port neutral → Lakeview export onto current upstream Lakeview
- **Type:** build · **Status:** open · **Depends on:** — · **PR:** —
- AB-001 built a TypeScript neutral → `.lvdash.json` export on the PR42 Lakeview code.
  Upstream has since replaced that code. Lakeview now lives in Rust
  (`crates/umf-core/src/lakeview.rs`), the TypeScript adapter only wraps the runtime, and
  the importer no longer stores a `umf.dashboard` projection by default
  (`projectLakeviewToLegacyDashboard` is the explicit compatibility view). Upstream
  `exportLakeviewDashboard` only re-emits the untouched `originalText`; it refuses any
  edit with `LAKEVIEW_EDIT_UNSUPPORTED`, as
  `CONTRACT-083-lakeview-dashboard-interchange.md` requires.
- Reference implementation on `agent-work-old`: `src/adapters/lakeview/export.ts`,
  `tests/lakeview/export.test.ts`, `US-094-lakeview-dashboard-export.md`,
  `CONTRACT-083-lakeview-dashboard-export.md` and `TD-093-lakeview-dashboard-export.md`
  (read them with `git show origin/agent-work-old:<path>`). Its contract id clashes with
  upstream. Renumber the HELIX artifacts to the next free ids on this branch (on
  2026-11-06 these were US-094, CONTRACT-084, TD-093) and cite FEAT-034.
- Scope: synthesize `.lvdash.json` from a `umf.dashboard` declaration that has no
  `umf.lakeview` payload, report every assumption and unmapped construct, and keep
  upstream's round-trip export unchanged for documents that do carry one. Put the export
  where CONTRACT-083 allows it. Either it goes in the Rust core behind the shared runtime,
  or it is a separate profile-level adapter that never claims to be native retention.
  Explain the choice in the TD.
- AB-001's "edit one visual's title and rewrite only those native members" behaviour
  contradicts CONTRACT-083's `LAKEVIEW_EDIT_UNSUPPORTED` rule. Do not port it. Record it as
  `[NEEDS CLARIFICATION]` in the PR so a human can raise it upstream.
- **Done when:** a `umf.dashboard` document with no Lakeview payload exports a dashboard
  that imports (`importLakeviewDashboard`, then `projectLakeviewToLegacyDashboard`) to an
  equivalent neutral declaration; exporting an unedited imported marketing-campaign
  document still returns the source text exactly; the existing `tests/lakeview` and
  `cargo test -p umf-core --test lakeview` still pass; new story criteria are SATISFIED
  in the ledger.
