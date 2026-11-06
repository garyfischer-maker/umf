# Agent work on this fork

This branch (`agent-work` on `garyfischer-maker/umf`) is where scheduled cloud agents
continue the dashboard-interchange work. It is a fork-only branch: `.claude/` and
`docs/agents/` are agent scaffolding and are never proposed upstream. A human reviews
agent PRs here and carries finished work to `DocumentDrivenDX/umf` separately.

## One run

1. Find work that is already in flight, because `BACKLOG.md` on `agent-work` changes only
   when a PR is merged:
   - list the open pull requests into `agent-work` on `garyfischer-maker/umf`
     (GitHub tools or the API), and
   - list existing item branches with `git ls-remote origin 'refs/heads/agent/*'`.

   An item is **taken** if any open PR's head branch, or any existing branch, starts
   with `agent/<item-id>-`. Earlier runs may have left a branch without a PR; that
   item is still taken, and a human decides what happens to it.
2. Take the first item in `BACKLOG.md` with status `open` whose dependencies are `done`
   and which is not taken. A dependency counts as `done` when its PR is merged into
   `agent-work`, even if `BACKLOG.md` still shows `in-review`, and only then. If no item
   qualifies, make no branch, commit or PR. Finish by listing
   the taken items and their PRs as waiting for review, and stop.
3. Branch from `agent-work` as `agent/<item-id>-<slug>`.
4. Use the `umf-researcher` role for `research` items and `umf-builder` for `build`
   items (definitions in `.claude/agents/`).
5. In the same branch, set the item's status to `in-review`, add the PR link once it
   exists, and append any follow-up items you discovered at the end of the backlog.
6. Push and open a pull request **into `agent-work` on `garyfischer-maker/umf`**.
   If the item could not be finished, open it as a draft with what was learned.

## Hard rules

- Never push to `agent-work`, `main` or `feat/dashboard-profile` directly; only to your
  own `agent/...` branch.
- Never open PRs, issues or comments on `DocumentDrivenDX/umf`.
- One item per run, one PR per item. Keep unrelated files untouched.
- Never start a second branch or PR for an item that is already taken, and never vary a
  branch name to get around that (no `-alt`, `-run4`, `-v2` suffixes).
- Do not commit private or client data. The only real dashboard committed is
  `fixtures/lakeview/marketing-campaign.lvdash.json` (synthetic data).
- Do not regenerate unrelated evidence fixtures (`fixtures/validation/**`, browser
  results) and do not change test expectations to make unrelated tests pass.

## Environment setup

The repo pins its Bun version in `package.json` (`packageManager`). If `bun` is missing or older: `curl -fsSL https://bun.sh/install | bash`
then `export PATH="$HOME/.bun/bin:$PATH"`. Install dependencies with
`bun install --frozen-lockfile`.

## Known unrelated test failures

These fail on a fresh checkout and are not agent work unless an item says so:
evidence gates that expect Chromium `148.0.7778.0` while Playwright 1.63 ships 153
(`tests/core-ideals/*conformance*`, `*evidence*`); key evidence with absolute
`/home/erik/...` paths; evidence that hashes `dist/*` bundles a fresh clone lacks
(`field-conformance`, `key-evidence`); tests needing `protoc` or `go` (`tests/protobuf/*`,
`tests/projections/json-schema-protobuf.test.ts`); and long-running tests that exceed
Bun's 5 s default on slow machines.
