---
name: CodeRabbit
description: Fetch and fix unresolved CodeRabbit review comments on the current PR, then resolve them. Also check CI status.
---

# CodeRabbit - Fix PR Review Comments & CI

Fetch **only unresolved** CodeRabbit comments on the current PR, fix them, resolve the threads, and ensure CI passes.

## Step 1: Get PR number

```bash
gh pr view --json number,headRefName --jq '{number, headRefName}'
```

## Step 2: Fetch unresolved threads + CI status (in parallel)

**CRITICAL: Always use the `filter-threads.jq` file to filter the GraphQL response.** The raw response contains ALL threads (resolved + unresolved) with verbose comment bodies. The jq filter:
- Keeps only unresolved coderabbitai threads
- Extracts only needed fields (threadId, file, line, commentId, body)
- Strips HTML comments, "Prompt for AI Agents" blocks, "Learnings used" blocks, and "Analysis chain" blocks

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
              databaseId
              author { login }
            }
          }
        }
      }
    }
  }
}' | jq -f .claude/skills/coderabbit/filter-threads.jq
```

Run `gh pr checks <PR_NUMBER>` in parallel with the above.

**If the jq output is `[]`**: Report "0 unresolved comments" and CI status, then stop.

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

## Step 4: Check for merge conflicts

Before verifying fixes, check if the PR has merge conflicts:

```bash
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus
```

If `mergeable` is `CONFLICTING`:

1. Merge the base branch into the current branch: `git merge main`
2. Resolve any conflicts
3. Commit the merge resolution

Do this before type-checking so you're validating the final state.

## Step 5: Verify type-check passes

After all fixes:

```bash
bun run type-check
```

If type-check fails, fix the errors before proceeding.

## Step 6: Commit and push

After type-check passes, commit all fixes and push:

1. Stage the changed files
2. Commit with a descriptive message (e.g., `fix: address CodeRabbit review comments`)
3. Push: `bun run push`

## Step 7: Check CI status

```bash
gh pr checks <PR_NUMBER>
```

If any checks are failing:

1. **Read the CI logs**: `gh run view <RUN_ID> --log-failed`
2. **Fix the failures** (lint, type errors, test failures, etc.)
3. **Push fixes** and wait for CI to re-run
4. **Verify all checks pass** before declaring done

## Step 8: Summary

Report what was done:
- How many comments were found (unresolved)
- How many were fixed vs disagreed-with
- CI status (all green or what's still failing)

## Rules

- **ALWAYS use filter-threads.jq** — never dump raw GraphQL thread responses into context
- **Always resolve threads** — even if you disagree, explain and resolve (no stale threads)
- **Run type-check after fixes** — don't leave broken code
- **Check CI** — the PR isn't done until CI is green
- **Check merge conflicts** — resolve before pushing
- **Always commit and push** — don't leave fixes uncommitted
