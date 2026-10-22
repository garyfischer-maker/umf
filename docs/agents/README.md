# Agent work on this fork

This branch (`agent-work` on `garyfischer-maker/umf`) is where scheduled cloud agents
continue the dashboard-interchange work. It is a fork-only branch: `.claude/` and
`docs/agents/` are agent scaffolding and are never proposed upstream. A human reviews
agent PRs here and carries finished work to `DocumentDrivenDX/umf` separately.

## One run

1. Take the first item in `BACKLOG.md` with status `open` whose dependencies are `done`.
   If none qualifies, write a short note in the PR explaining why and stop.
2. Branch from `agent-work` as `agent/<item-id>-<slug>`.
3. Use the `umf-researcher` role for `research` items and `umf-builder` for `build`
   items (definitions in `.claude/agents/`).
4. In the same branch, set the item's status to `in-review`, add the PR link once it
   exists, and append any follow-up items you discovered at the end of the backlog.
5. Push and open a pull request **into `agent-work` on `garyfischer-maker/umf`**.
   If the item could not be finished, open it as a draft with what was learned.

## Hard rules

- Never push to `agent-work`, `main` or `feat/dashboard-profile` directly; only to your
  own `agent/...` branch.
- Never open PRs, issues or comments on `DocumentDrivenDX/umf`.
- One item per run, one PR per item. Keep unrelated files untouched.
- Do not commit private or client data. The only real dashboard committed is
  `fixtures/lakeview/marketing-campaign.lvdash.json` (synthetic data).
- Do not regenerate unrelated evidence fixtures (`fixtures/validation/**`, browser
  results) and do not change test expectations to make unrelated tests pass.

## Environment setup

The repo uses Bun 1.3.x. If `bun` is missing: `curl -fsSL https://bun.sh/install | bash`
then `export PATH="$HOME/.bun/bin:$PATH"`. Install dependencies with
`bun install --frozen-lockfile`.

## Known unrelated test failures

These fail on a fresh checkout and are not agent work unless an item says so:
evidence gates that expect Chromium `148.0.7778.0` while Playwright 1.63 ships 153
(`tests/core-ideals/*conformance*`, `*evidence*`); key evidence with absolute
`/home/erik/...` paths; a stale `native/tablespec/sources/tests/unit/test_umf_loader.py`
hash; tests needing `protoc` or `go` (`tests/protobuf/*`,
`tests/projections/json-schema-protobuf.test.ts`); and long-running tests that exceed
Bun's 5 s default on slow machines.
