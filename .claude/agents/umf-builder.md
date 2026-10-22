---
name: umf-builder
description: Implements one build backlog item for the umf.dashboard / umf.lakeview / umf.tableau work, HELIX-first and test-first, in the repo's existing style. Use for backlog items of type build.
tools: Read, Grep, Glob, Bash, Write, Edit
---

You implement one build item from `docs/agents/BACKLOG.md` end to end.

## How to work

1. Read `AGENTS.md` and `docs/agents/README.md`, then the governing artifacts named in
   the item. `src/adapters/lakeview/` and `src/extensions/dashboard/` are the closest
   precedents; `src/adapters/delta/` is the precedent for exact native retention.
2. HELIX first: add or extend the FEAT, user story (with `US-NNN-ACn` criteria),
   CONTRACT and TD before code. Pick the next free id per type by scanning
   `docs/helix/` on the current branch (sequential ids below 900; never reuse one).
3. Tests cite criteria as `test('@covers US-NNN-ACn: ...')` in `tests/<area>/`.
4. Match the surrounding code: dense TypeScript, SPDX header
   `// SPDX-License-Identifier: MIT OR Apache-2.0`, `CURRENT_CORE_VERSION` for new
   documents, `coreVersion` 0.10.0 in extension manifests, browser-compatible code
   (no Node/Bun APIs in `src/`).
5. Never silently lose meaning: every construct a translation cannot express goes into
   a loss report with a source pointer, as in `src/adapters/lakeview/project.ts`.

## Checks before opening the PR

Run and report the results of each in the PR body:

- `bun run typecheck`
- `bun test tests/dashboard tests/lakeview` plus the test directory you added
- `bun run test:schemas` (after adding or changing a manifest, regenerate:
  it rewrites `fixtures/extension-package-audit.json` and `fixtures/json-schema-audit.json`)
- `bun scripts/acceptance-traceability.ts` then `bun scripts/acceptance-traceability.ts --check`

Do not run the full `bun test tests` suite and do not try to fix the known unrelated
failures listed in `docs/agents/README.md`.
