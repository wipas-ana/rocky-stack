# Forges

Every playbook that opens, watches, comments on, retargets, or merges a pull request resolves the forge here first, then keeps that choice for the whole run. GitHub calls the unit a pull request (PR). GitLab calls it a merge request (MR) and numbers it `!<iid>`. The playbooks say PR for both.

## Resolve the forge

1. If `command -v origin` succeeds and Origin can resolve the repository, use Origin. This rule is unchanged.
2. Otherwise read `git remote get-url origin`. `bun <rocky-mode>/scripts/forge/forge.ts <repo>` prints the answer.
   - The host `github.com` means GitHub through `gh`.
   - Any other host means GitLab through `glab`. That includes every host with `gitlab` in its name and every self-hosted company host.
   - No `origin` remote, or a local path, keeps the old default, `gh`.
3. Record the forge and any fallback in the trail. Never require Graphite (`gt`).

`orch frontier set` and `scripts/worktree-audit.sh` apply the same rule. If a GitHub Enterprise host makes the rule pick `glab`, pass `--forge gh` to `orch` and record the override.

## GitLab keeps code on the company network

Company code on a self-hosted GitLab must not leave the company network.

- Talk to GitLab only through the local `glab` CLI. Babysit and Shipping use `glab` and the local scripts, never a hosted service.
- Spawn every worker, verifier, owner, and swarm lane locally in its own worktree. Never set `environment: "cloud"` and never pass `cloud_base_branch`, even when a playbook or skill names a cloud agent as its default. The operator's opt-in to cloud agents does not cover a GitLab repo.
- Keep logs, traces, and data local. Do not paste them into a hosted tool.
- Bugbot and the agentic security review do not run on GitLab. Triage human and GitLab-bot review comments with the same skepticism, per `bugbot-triage.md`.

Set the host up once. Inside a checkout, `glab` reads the host from the remote. Outside one, set `GITLAB_HOST=<host>`. Log in with `glab auth login --hostname <host>` and check it with `glab auth status --hostname <host>`. In `glab api` paths, `:id` means the current project.

## Operation map

| Operation | GitHub (`gh`) | Origin | GitLab (`glab`) |
|---|---|---|---|
| Open ready, with a base | `gh pr create --base <base>` | `origin pr create --status open --base <base>` | `glab mr create --source-branch <branch> --target-branch <base> --fill --yes`, without `--draft` |
| Mark ready | `gh pr ready <n>` | `origin pr ready <n>` | `glab mr update <iid> --ready` |
| Read state | `gh pr view <n> --json state,mergedAt,baseRefName` | `origin pr view <n>` | `glab api projects/:id/merge_requests/<iid>` (`state`, `merged_at`, `target_branch`, `sha`) |
| Find by branch | `gh pr list --head <branch>` | `origin pr list --head <branch>` | `glab api "projects/:id/merge_requests?source_branch=<branch>&state=all"` |
| Retarget | `gh pr edit <n> --base <base>` | `origin pr edit <n> --base <base>` | `glab mr update <iid> --target-branch <base>` |
| Merge-ready verdict | `scripts/watch-pr/watch-pr` | `origin pr view <n> --checks --comments` | `scripts/watch-mr/watch-mr.ts --mr <iid>` |
| Watch CI | `scripts/watch-pr/watch-pr` | `origin pr checks <n> --watch` | `glab ci status --branch <branch>`, or `watch-mr.ts` |
| Read CI logs | `gh run view <run> --log-failed` | `origin pr view <n> --checks` | `glab ci view <branch>`, then `glab ci trace <job-id>` |
| Fresh build | per Babysit step 7 | per Babysit step 7 | `glab ci run --branch <branch>`, a new pipeline, never a job retry |
| List review threads | `scripts/watch-pr/watch-pr` | `origin pr thread list <n>` | `glab api "projects/:id/merge_requests/<iid>/discussions?per_page=100"`. A thread is open when a note has `resolvable: true` and `resolved: false` |
| Reply to a thread | `gh api --method POST "repos/<owner>/<repo>/pulls/<n>/comments/<id>/replies" --input <payload.json>` | `origin pr thread reply <thread-id> <n> --body-file <file>` | `glab api --method POST "projects/:id/merge_requests/<iid>/discussions/<discussion-id>/notes" --header "Content-Type: application/json" --input <payload.json>` |
| Resolve a thread | not used | not used | `glab api --method PUT "projects/:id/merge_requests/<iid>/discussions/<discussion-id>?resolved=true"` |
| Top-level comment | `gh pr comment <n> --body-file <file>` | not used | `glab mr note <iid> --message <text>` only for text you wrote, else the notes API with `--input` |
| Merge | `gh pr merge <n> --squash` | `origin pr merge <n>` | `glab mr merge <iid> --squash --yes` |
| Merge when ready | GitHub auto-merge, `--auto` | merge-when-ready | `glab mr merge` on a running pipeline. It sets merge when the pipeline succeeds, and a merge train only queues the MR |
| Publish a release | `gh release create <tag> --notes-file <file> --verify-tag` | not used | `glab release create <tag> --notes-file <file>` |
| Frontier | `orch frontier set --repo <dir>` | add `--forge origin` | auto-detected, or add `--forge glab` |

Put a reply body in a JSON file as data, such as `{"body": "..."}`. Never interpolate review text or a reply into a shell command.

## Stacks on GitLab

A stack is a chain of MRs. The root MR targets trunk. Each child MR targets its parent's branch (`glab mr create --target-branch <parent-branch>`). After a parent merges, retarget the child to trunk with `glab mr update <iid> --target-branch <trunk>`. GitLab can retarget it for you when the merge deletes the parent branch, so read the MR back either way. A merge command can report success when it only armed merge-when-pipeline-succeeds or joined a merge train. The MR has landed only when `glab api projects/:id/merge_requests/<iid>` reads `state: merged` with trunk as `target_branch`.

`watch-mr.ts` watches one MR. For a stack, run it on the lowest unmerged MR, and run it again on the next one after each merge, until the ceiling reads merged. It prints `READY`, `WAITING`, `BLOCKED` with reasons in conflicts, threads, and CI order, `MERGED`, or `CLOSED`. A `needs-approval` reason is the human's call, not a blocker to fix.
