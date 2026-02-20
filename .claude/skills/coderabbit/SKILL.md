---
name: CodeRabbit
description: Fetch and fix unresolved CodeRabbit review comments on the current PR, then resolve them. Also check CI status.
---

# CodeRabbit - Fix PR Review Comments, Test Plan & CI

Fetch **only unresolved** CodeRabbit comments on the current PR, fix them, resolve the threads, **prove every test plan item passes**, fix all user comments, and ensure CI passes.

## Step 1: Get PR number and repo info

```bash
gh pr view --json number,headRefName --jq '{number, headRefName}'
gh repo view --json owner,name --jq '{owner: .owner.login, repo: .name}'
```

Store the `OWNER`, `REPO`, and `PR_NUMBER` values — all subsequent commands use them.

## Step 2: Fetch PR body (test plan)

```bash
gh pr view <PR_NUMBER> --json body --jq '.body'
```

**Extract all unchecked test plan items** from the PR body (lines matching `- [ ]`). These are your verification targets — every single one must be proven.

## Step 3: Fetch user comments, unresolved threads, and CI status (all in parallel)

### User comments

**CRITICAL: Use the `filter-comments.jq` file** to avoid bash escaping issues with `!=`.

```bash
gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments | jq -f .claude/skills/coderabbit/filter-comments.jq
```

### Unresolved CodeRabbit threads

**CRITICAL: Always use the `filter-threads.jq` file to filter the GraphQL response.** The raw response contains ALL threads (resolved + unresolved) with verbose comment bodies. The jq filter:
- Keeps only unresolved coderabbitai threads
- Extracts only needed fields (threadId, file, line, commentId, body)
- Strips HTML comments, "Prompt for AI Agents" blocks, "Learnings used" blocks, and "Analysis chain" blocks

```bash
gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:50){nodes{id isResolved comments(first:5){nodes{body path line databaseId author{login}}}}}}}}' -f owner=<OWNER> -f repo=<REPO> -F pr=<PR_NUMBER> | jq -f .claude/skills/coderabbit/filter-threads.jq
```

### CI status

```bash
gh pr checks <PR_NUMBER>
```

## Step 4: Fix user comments FIRST

User comments take priority. For each user comment:

1. **Read and understand** the request
2. **Fix the code** to address it
3. **Verify** the fix works (read the code, run relevant tests)

Do NOT skip or deprioritize user comments. They are the most important feedback.

## Step 5: Fix CodeRabbit comments

For each unresolved CodeRabbit comment:

1. **Read the file** at the path/line mentioned
2. **Evaluate the suggestion** — is it valid and worth fixing?
   - **If you agree**: Fix the code, then resolve the thread
   - **If you disagree or it's unclear**: Reply to the comment explaining why, then still resolve it (don't leave stale threads)

**If the jq output is `[]`**: Report "0 unresolved comments" and move on.

### How to reply to a comment

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies \
  -f body="Your reply explaining why you disagree or what you did instead"
```

### How to resolve a thread

```bash
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id="<THREAD_ID>"
```

## Step 6: Prove every test plan item

**STRICT REQUIREMENT: Every unchecked `- [ ]` item in the test plan MUST be proven to work. No exceptions.**

For each test plan item, you must provide **proof** using one or more of these methods:

### Proof by testing
- Write a unit/integration test that exercises the exact behavior described
- Run the test and show it passes
- The test must be committed so it prevents regressions

### Proof by direct observation
- Call the actual endpoint/API and show the response
- Use `curl`, `bun run`, or similar to demonstrate the behavior
- Paste the output as evidence

### Proof by code analysis
- Only acceptable when the behavior is **structurally guaranteed** by the code
- Read the code path and explain exactly why it works
- Show the specific lines that enforce the behavior
- This is the weakest form of proof — prefer testing or observation

### After proving each item

Check the box in the PR description by updating the PR body:

```bash
gh pr view <PR_NUMBER> --json body --jq '.body' > /tmp/pr-body.md
# Edit the file to check boxes
sed -i 's/- \[ \] Exact item text/- [x] Exact item text/' /tmp/pr-body.md
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER> -X PATCH -F "body=@/tmp/pr-body.md" --jq '.body' | head -15
```

**If a test plan item CANNOT be proven** (e.g., requires manual browser testing, production access, etc.):
- Do NOT silently skip it
- Leave it unchecked
- Add a comment to the PR explaining what was verified and what still needs manual testing

## Step 7: Check for merge conflicts

Before verifying fixes, check if the PR has merge conflicts:

```bash
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus --jq '{mergeable, mergeStateStatus}'
```

If `mergeable` is `CONFLICTING`:

1. Merge the base branch into the current branch: `git merge main`
2. Resolve any conflicts
3. Commit the merge resolution

Do this before type-checking so you're validating the final state.

## Step 8: Verify type-check passes

After all fixes:

```bash
bun run type-check
```

If type-check fails, fix the errors before proceeding.

## Step 9: Commit and push

After type-check passes, commit all fixes and push:

1. Stage the changed files
2. Commit with a descriptive message (e.g., `fix: address CodeRabbit review comments`)
3. Push: `bun run push`

## Step 10: Check CI status

```bash
gh pr checks <PR_NUMBER>
```

If any checks are failing:

1. **Read the CI logs**: `gh run view <RUN_ID> --log-failed`
2. **Fix the failures** (lint, type errors, test failures, etc.)
3. **Push fixes** and wait for CI to re-run
4. **Verify all checks pass** before declaring done

## Step 11: Summary

Report what was done:
- **User comments**: How many found, how many fixed
- **CodeRabbit comments**: How many found (unresolved), how many fixed vs disagreed-with
- **Test plan**: Status of each item — proven (how) or needs manual verification (why)
- **Regressions**: Any new tests written to prevent regressions
- **CI status**: All green or what's still failing

## Rules

- **ALWAYS use filter-threads.jq** — never dump raw GraphQL thread responses into context
- **ALWAYS use filter-comments.jq** — never use `!=` in jq within bash (causes `\!` escaping errors)
- **ALWAYS use GraphQL variables** — never hardcode owner/repo in query strings
- **User comments are #1 priority** — fix them before CodeRabbit suggestions
- **Always resolve threads** — even if you disagree, explain and resolve (no stale threads)
- **Every test plan item needs proof** — "I looked at the code and it seems fine" is NOT proof. Test it, call it, or show structurally why it's guaranteed
- **No unchecked boxes without explanation** — if you can't prove it, say why explicitly
- **Write regression tests** — if a CodeRabbit comment found a real bug, write a test so it never comes back
- **Run type-check after fixes** — don't leave broken code
- **Check CI** — the PR isn't done until CI is green
- **Check merge conflicts** — resolve before pushing
- **Always commit and push** — don't leave fixes uncommitted
- **Use REST API for PR body updates** — `gh pr edit --body-file` fails with Projects Classic deprecation; use `gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER> -X PATCH -F "body=@file"` instead
