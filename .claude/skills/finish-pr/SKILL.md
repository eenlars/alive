---
name: finish-pr
description: Finish a PR safely: sync branch, run required checks, handle CodeRabbit comments, and push without leaking secrets.
---

# Finish PR (Safe + Repeatable)

Use this workflow when a PR is near merge and needs a final pass for CI and CodeRabbit.

## Prerequisites

1. `bun` is installed and works in this repo.
2. `gh` is installed and authenticated (`gh auth status`).
3. You are on the PR branch (not detached HEAD).
4. Remote is configured and push access is available.

## Security Rules (No Secret Leaks)

1. Never run `env`, `printenv`, or `gh auth token`.
2. Never echo secrets or paste token-bearing URLs.
3. Do not use `set -x` in shell sessions when running GitHub commands.
4. Prefer `gh api` and `gh pr view` over manual curl with auth headers.
5. Share only sanitized command output (errors/findings), not full debug dumps.

## Standard Workflow

1. Confirm branch and cleanliness:
```bash
git status --short --branch
```

2. Sync with main (choose one strategy used by the repo):
```bash
git fetch origin
git merge origin/main
```
If conflicts appear: resolve, run checks, commit conflict resolution.

3. Run local gates with shortest feedback first:
```bash
bun run type-check
bun run lint
bun run static-check
```

4. Check PR CI status:
```bash
gh pr checks <PR_NUMBER>
```
If failing, fix the first root cause, then re-run local gates.

5. Read unresolved CodeRabbit threads safely:
```bash
gh api graphql -f query='
query {
  repository(owner:"<OWNER>", name:"<REPO>") {
    pullRequest(number:<PR_NUMBER>) {
      reviewThreads(first:100) {
        nodes {
          id
          isResolved
          comments(first:20) {
            nodes { body url author { login } }
          }
        }
      }
    }
  }
}
' --jq '.data.repository.pullRequest.reviewThreads.nodes
  | map(select(.isResolved==false))
  | map({id, comments:[.comments.nodes[] | {author:.author.login, url, body}]})'
```

6. For each unresolved item:
- Fix code if valid.
- If disagree, reply with concrete reasoning and evidence.
- Resolve the thread only after fix/reasoning is in place.
- If a CodeRabbit comment is fixed, you must mark that review thread as resolved.

7. Re-run checks after fixes:
```bash
bun run static-check
gh pr checks <PR_NUMBER>
```

8. Push branch:
```bash
git push
```

9. Final verify:
- `gh pr checks <PR_NUMBER>` shows all required checks passing.
- No unresolved CodeRabbit review threads remain.

## Fast Triage Order

1. Type-check failures
2. Lint/format failures
3. Test failures
4. CodeRabbit review threads
5. Re-run full checks once at the end

## Done Criteria

1. Branch is pushed.
2. Required CI checks are green.
3. CodeRabbit unresolved thread count is zero (or documented with explicit, accepted disagreement).
