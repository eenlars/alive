---
name: CodeRabbit
description: Fetch and fix unresolved CodeRabbit review comments on the current PR, then resolve them. Also check CI status.
---

# CodeRabbit - Fix PR Review Comments & CI

Fetch **only unresolved** CodeRabbit comments on the current PR, fix them, resolve the threads, and ensure CI passes.

## Step 1: Identify the PR

```bash
gh pr view --json number,title,url,headRefName
```

## Step 2: Fetch unresolved review threads

Use the GraphQL API to get only unresolved threads:

```bash
gh api graphql -f query='
query {
  repository(owner: "eenlars", name: "alive") {
    pullRequest(number: <PR_NUMBER>) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          comments(first: 5) {
            nodes {
              body
              path
              line
              author { login }
            }
          }
        }
      }
    }
  }
}'
```

Filter to only `isResolved: false` threads from `coderabbitai[bot]`.

## Step 3: For each unresolved comment

1. **Read the file** at the path/line mentioned
2. **Evaluate the suggestion** — is it valid and worth fixing?
   - **If you agree**: Fix the code, then resolve the thread
   - **If you disagree or it's unclear**: Reply to the comment explaining why, then still resolve it (don't leave stale threads)

### How to reply to a comment

```bash
gh api repos/eenlars/alive/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies \
  -f body="Your reply explaining why you disagree or what you did instead"
```

### How to resolve a thread

```bash
gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "<THREAD_ID>"}) {
    thread { isResolved }
  }
}'
```

## Step 4: Verify type-check passes

After all fixes:

```bash
bun run type-check
```

If type-check fails, fix the errors before proceeding.

## Step 5: Check CI status

```bash
gh pr checks <PR_NUMBER>
```

If any checks are failing:

1. **Read the CI logs** to understand what failed:
   ```bash
   gh run view <RUN_ID> --log-failed
   ```
2. **Fix the failures** (lint, type errors, test failures, etc.)
3. **Push fixes** and wait for CI to re-run
4. **Verify all checks pass** before declaring done

## Step 6: Summary

Report what was done:
- How many comments were found (unresolved)
- How many were fixed vs disagreed-with
- CI status (all green or what's still failing)

## Rules

- **Only fetch unresolved comments** — resolved ones are already handled
- **Always resolve threads** — even if you disagree, explain and resolve (no stale threads)
- **Run type-check after fixes** — don't leave broken code
- **Check CI** — the PR isn't done until CI is green
- **Don't commit** — just make the fixes. The user will commit when ready.
