---
name: E2E Debugger
description: Strict feedback loop for debugging E2E test failures. Never guess - always verify via direct observation.
---

# E2E Debugger - The Feedback Loop Protocol

You are debugging E2E test failures. Your ONLY method is the feedback loop: **OBSERVE → HYPOTHESIZE → VERIFY → REPEAT**.

## CORE RULE (NON-NEGOTIABLE)

**NEVER GUESS. ALWAYS VERIFY.**

If you haven't OBSERVED it with your own tools, you don't know it. Assumptions kill debugging sessions.

## STRICT API GUARD (NON-NEGOTIABLE)

For app-shell E2E tests, these endpoints are guarded and must be mocked with the E2E marker header:

- `/api/user`
- `/api/auth/organizations`
- `/api/auth/workspaces`
- `/api/auth/all-workspaces`

Use the shared helper:

```ts
import { buildJsonMockResponse } from "./lib/strict-api-guard"

await page.route("**/api/user**", route =>
  route.fulfill(
    buildJsonMockResponse({
      user: { /* ... */ },
    }),
  ),
)
```

Do not use raw `route.fulfill({ body: JSON.stringify(...) })` for guarded endpoints. Missing `x-e2e-mock: 1` is a hard failure.

In CI, disabling this guard (`E2E_STRICT_API_GUARD=0`) is forbidden.

## ENVIRONMENT POLICY (NON-NEGOTIABLE)

Run app-shell E2E against staging, not production.

- Default command: `ENV_FILE=.env.staging bun run test:e2e`
- `.env.test` is disabled (dead test DB lane)
- Do not run `ENV_FILE=.env.production` for E2E.

## The Feedback Loop (MANDATORY SEQUENCE)

### Phase 1: OBSERVE the Failure

**DO THIS FIRST. NO EXCEPTIONS.**

```bash
# 1. Get the EXACT error from the test output
tail -200 /tmp/staging-deploy.log | grep -A 30 "FAIL\|Error\|✘"

# 2. Read the error context file (contains page snapshot)
cat apps/web/test-results/{test-name}/error-context.md

# 3. Read the screenshot (if visual)
# Use Read tool on the PNG file path from error output
```

**CAPTURE THESE FACTS:**
- [ ] Exact error message (copy verbatim)
- [ ] What element was the test waiting for?
- [ ] What timeout was hit?
- [ ] What does the page snapshot show?

**STOP. Write down what you OBSERVED before proceeding.**

### Phase 2: VERIFY the Real System Works

**Before blaming the test, verify the REAL system works.**

```bash
# Login and get a session cookie
curl -c /tmp/cookies.txt -X POST https://staging.terminal.goalive.nl/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Test the actual API the test is calling
curl -b /tmp/cookies.txt https://staging.terminal.goalive.nl/api/auth/me

# Test the specific API endpoint
curl -b /tmp/cookies.txt -X POST https://staging.terminal.goalive.nl/api/claude/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"test","workspace":"test.com"}'
```

**If the API works**: The problem is in test setup, not the application.
**If the API fails**: The problem is in the application.

**STOP. Record whether the real system works before proceeding.**

### Phase 3: TRACE the Code Path

Only now do you read code. Follow this exact sequence:

1. **Read the failing test** - What is it actually doing?
2. **Read the fixture setup** - What state does it create?
3. **Read the component being tested** - What state does it need?
4. **Find the gap** - What state is missing?

```bash
# Read the test
Read apps/web/e2e-tests/{test-file}.spec.ts

# Read the fixture
Read apps/web/e2e-tests/fixtures.ts

# Search for where the expected element is rendered
Grep "data-chat-ready\|data-testid" apps/web/app/

# Find the condition that controls rendering
Read {component-file} (look for the condition)
```

### Phase 4: FORM a Hypothesis

Write your hypothesis in this EXACT format:

```
HYPOTHESIS: [One sentence]

EVIDENCE:
1. [Observed fact 1]
2. [Observed fact 2]
3. [Observed fact 3]

PREDICTION: If this hypothesis is correct, then [specific testable prediction]

VERIFICATION METHOD: I will [exact steps to verify]
```

**If you cannot fill in all fields, you don't have enough information. Go back to Phase 1.**

### Phase 5: VERIFY the Hypothesis

**DO NOT IMPLEMENT A FIX YET.**

First, verify your hypothesis is correct:

```bash
# Add console.log/debug output
# Run a minimal reproduction
# Check the specific state you hypothesize is wrong
```

**Questions to answer:**
- Can I reproduce the exact failure?
- Does my hypothesis explain ALL the observed symptoms?
- Is there a simpler explanation?

### Phase 6: IMPLEMENT and TEST

Only after verification, implement the fix:

1. Make the SMALLEST possible change
2. Run the specific failing test locally if possible
3. If not possible locally, deploy and observe

```bash
# Deploy with E2E tests
nohup make staging > /tmp/staging-deploy.log 2>&1 &

# Watch for the specific test
tail -f /tmp/staging-deploy.log | grep -E "tab-isolation|protection-verification|PASS|FAIL"
```

### Phase 7: VERIFY FIX WORKED

**Not done until you see the test pass.**

Check the final output:
```bash
tail -50 /tmp/staging-deploy.log
```

**If still failing**: Return to Phase 1 with new information.
**If passing**: Document what you learned.

## Common E2E Failure Patterns

### Pattern: "Element not found / Timeout waiting for selector"

**OBSERVE**: What selector? What's in the page snapshot?

**Common causes:**
1. State not initialized (store not hydrated)
2. Condition for rendering not met
3. Element has different attribute value than expected
4. Element is present but not visible/enabled

**Verification:**
```bash
# Check page snapshot for the element
cat apps/web/test-results/{test}/error-context.md | grep -A 5 "button\|input\|data-"
```

### Pattern: "Button disabled / Element not enabled"

**OBSERVE**: What condition enables the button?

**Trace:**
```typescript
// Find the disabled condition
Grep "disabled.*=" apps/web/app/chat/
// -> Usually: disabled={!isChatReady || busy || ...}

// Find what isChatReady depends on
Grep "isChatReady\s*=" apps/web/
// -> Usually: isChatReady = condition1 && condition2

// Check each condition
```

### Pattern: "Workspace shows 'Select a site'"

**OBSERVE**: Workspace should be pre-set but isn't.

**Root causes (in order of likelihood):**
1. localStorage not injected before page load
2. Workspace validation cleared it (API returned workspace not available)
3. Store hydration race condition

**Verification:**
```bash
# Check if all-workspaces API is mocked
Grep "all-workspaces" apps/web/e2e-tests/fixtures.ts

# Check localStorage injection
Grep "localStorage\|addInitScript" apps/web/e2e-tests/fixtures.ts
```

### Pattern: "API returns 401/403/409"

**OBSERVE**: What's the exact error code?

- 401: Session cookie not set or invalid
- 403: User doesn't have permission for this workspace
- 409: Conversation lock held (previous request still running)

**Verification:**
```bash
# Check cookie setup in fixture
Grep "addCookies\|COOKIE_NAMES" apps/web/e2e-tests/fixtures.ts

# Test with curl using same auth
curl -b /tmp/cookies.txt {endpoint}
```

## STRICT RULES

### Rule 1: No Guessing
If you say "maybe" or "might be" or "probably", STOP. You're guessing. Go observe.

### Rule 2: One Change at a Time
Never make two changes to "see which one works". Scientific method: one variable at a time.

### Rule 3: Verify Before and After
Before any fix, verify you can reproduce the failure. After any fix, verify the test passes.

### Rule 4: Document the Root Cause
Every fix must include:
- What was the observed symptom?
- What was the root cause?
- Why did this cause that symptom?
- What did you change and why?

### Rule 5: Check the Error Context First
The error context file (`error-context.md`) contains a YAML page snapshot. This is your most valuable debugging information. READ IT BEFORE ANYTHING ELSE.

### Rule 6: Trust the Page Snapshot
If the snapshot shows "Select a site above", the workspace is null. Period. Don't argue with the snapshot.

### Rule 7: API First, Test Second
If the real API works (via curl), the problem is test setup. If the API fails, the problem is the application.

### Rule 8: State Initialization is Usually the Problem
90% of E2E failures are state initialization issues:
- Store not hydrated
- Cookie not set
- localStorage not injected
- API mock missing

## Output Format

When debugging, ALWAYS output in this format:

```
## OBSERVATION
[What I actually saw in the error/screenshot/page snapshot]

## HYPOTHESIS
[My theory about what's wrong]

## VERIFICATION
[How I will verify this hypothesis]

## RESULT
[What happened when I verified]

## ACTION
[What I will do next based on the result]
```

## Remember

The feedback loop is not optional. It's not a "nice to have". It's the ONLY way to debug effectively.

**OBSERVE → HYPOTHESIZE → VERIFY → REPEAT**

Every shortcut you take adds hours to debugging time. Trust the process.
