# Cloud routine setup

How to (re)create the scheduled agents for this fork. Create them **while signed in to
claude.ai as `gary.fischer@synaptiq.ai`**. That org's GitHub link can push to
`garyfischer-maker/umf`. Routines created under any other claude.ai org fail with
403 "Claude doesn't have GitHub access … for your organization".

Create them at https://claude.ai/code/routines (New routine), or from a Claude Code
session signed in to the same account (`/schedule`).

## 1. Push check (one-time, run first)

| Setting | Value |
|---|---|
| Name | `umf push-check` |
| Repository | `https://github.com/garyfischer-maker/umf` |
| Model | Sonnet 5.5 |
| Tools | Bash only |
| Connectors | none (remove any that get attached automatically) |
| Schedule | run once, now |

Prompt:

```text
This is a write-access test for the repository garyfischer-maker/umf. Do only the following, using only Bash, and do not read, install or change anything else.

1. `git fetch origin agent-work` then `git switch -c agent/push-check origin/agent-work`.
2. `git -c user.name='push-check' -c user.email='push-check@example.invalid' commit --allow-empty -m 'push-check: write-access test (throwaway)'`
3. `git push -u origin agent/push-check` and capture its full output, including stderr.
4. Run `git remote -v` and `git ls-remote origin agent/push-check`.

Do not retry with other methods, do not open a pull request, do not send notifications, and do not delete the branch. Finish by quoting the exact output of steps 3 and 4 and saying PUSH-CHECK: OK if the push succeeded or PUSH-CHECK: FAILED if it did not.
```

It passes when `agent/push-check` appears on the fork. Then delete that branch:
`git push fork --delete agent/push-check` from the local clone, or delete it on GitHub.

## 2. Daily agent (only after the push check passes)

| Setting | Value |
|---|---|
| Name | `umf dashboard-interchange daily` |
| Repository | `https://github.com/garyfischer-maker/umf` |
| Model | Opus 5.5 |
| Tools | Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, Agent |
| Connectors | none (remove any that get attached automatically) |
| Schedule | daily, cron `0 6 * * *` UTC (2:00 AM New York in summer, 1:00 AM in winter) |

Prompt:

```text
You are a scheduled agent working in the repository garyfischer-maker/umf, a fork of DocumentDrivenDX/umf. Do exactly one unit of work, then stop.

1. Run `git fetch origin` and `git switch agent-work`. All work starts from the `agent-work` branch, never `main`.
2. Read `AGENTS.md`, `docs/agents/README.md` and `docs/agents/BACKLOG.md`. The README's "One run" steps and "Hard rules" govern this run.
3. Set up the environment as the README describes (the Bun version pinned in package.json, then `bun install --frozen-lockfile`).
4. Pick the first backlog item whose status is `open` and whose dependencies are `done`. If there is none, make no changes and finish by saying so.
5. Follow the role definition for its type: `.claude/agents/umf-researcher.md` for research items, `.claude/agents/umf-builder.md` for build items.
6. Work on a branch named `agent/<item-id>-<slug>`. Update that item's status (and any follow-up items) in `docs/agents/BACKLOG.md` on that branch, commit, push only that branch, and open a pull request into `agent-work` on garyfischer-maker/umf. Open it as a draft if the item is not finished. The PR body lists what was done, each check that was run with its result, and open questions.
7. Never push to `agent-work`, `main` or `feat/dashboard-profile`. Never create pull requests, issues or comments on DocumentDrivenDX/umf. Never commit private or client data.

End by reporting the pull request URL, or the reason there is none.
```

## History

The first routines (2026-10-22) were created from a Claude Code session signed in to the
personal `gary.fischerr@gmail.com` org. Their pushes failed with 403. They are disabled.
Delete them at https://claude.ai/code/routines while signed in to that account.
