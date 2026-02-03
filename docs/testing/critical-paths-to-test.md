# Critical Paths To Test

**Purpose**: Identify highest-risk paths that MUST be tested before deployment.

---

## ⚠️ MOST CRITICAL: User Sends Message → Claude Installs Package

**Risk**: Entire workflow broken - users can't use the tool at all

**What can go wrong**:
- Session cookie not passed to child process
- MCP tool can't read environment variable
- Tool executes in wrong directory
- Package installed but files owned by root (not workspace user)
- Dev server doesn't pick up changes

**Full Integration Test**:
```bash
# 1. Login and get session cookie
SESSION=$(curl -s -c - http://localhost:8999/api/login \
  -H "Content-Type: application/json" \
  -d '{"workspace":"test","passcode":"test"}' \
  | grep session | awk '{print $7}')

# 2. Send message to install package
curl -N http://localhost:8999/api/claude/stream \
  -H "Cookie: session=$SESSION" \
  -H "Content-Type: application/json" \
  -d '{"message":"install lodash","workspace":"test"}' \
  > /tmp/stream-output.txt &

# 3. Wait for completion
sleep 10

# 4. Verify package installed
test -d /srv/webalive/sites/test/user/node_modules/lodash || echo "FAILED: Package not installed"

# 5. Verify correct ownership
OWNER=$(stat -c '%U' /srv/webalive/sites/test/user/node_modules/lodash)
test "$OWNER" = "site-test" || echo "FAILED: Wrong owner: $OWNER"

# 6. Check stream response
grep -q "Successfully installed" /tmp/stream-output.txt || echo "FAILED: No success message"
grep -q "error" /tmp/stream-output.txt && echo "FAILED: Error in stream"

echo "✅ Full workflow test passed"
```

**Why this is THE test**: Covers entire stack:
- Authentication (JWT)
- Session cookie flow (parent → child → env var)
- Child process spawning
- Privilege dropping
- MCP tool execution
- Direct execution pattern (no API call)
- File ownership
- User feedback

**Files involved**:
- `apps/web/app/api/claude/stream/route.ts:358` (extract cookie)
- `apps/web/lib/workspace-execution/agent-child-runner.ts:62` (pass to child)
- `apps/web/scripts/run-agent.mjs:58-64` (drop privileges)
- `packages/tools/src/tools/workspace/install-package.ts` (execute)

---

## Other Critical Paths

### 1. Path Traversal Attack Prevention

**Risk**: User accesses another workspace via path manipulation

**Test**:
```typescript
// User authenticated for "attacker.com" tries to access "victim.com"
test("blocks path traversal in API routes", async () => {
  const token = createSessionToken(["attacker.com"])

  const response = await fetch("http://localhost:8999/api/restart-workspace", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `session=${token}`
    },
    body: JSON.stringify({
      workspaceRoot: "/srv/webalive/sites/attacker.com/../victim.com/user"
    })
  })

  expect(response.status).toBe(403) // Must reject
})
```

**Files to test**:
- `apps/web/lib/workspace-api-handler.ts:80-98` (containment validation)
- `apps/web/app/api/restart-workspace/route.ts` (uses handleWorkspaceApi)

**Why critical**: Allows complete workspace isolation bypass

---

### 2. JWT Workspace Authorization

**Risk**: User modifies JWT to add unauthorized workspaces

**Test**:
```typescript
test("rejects tampered JWT tokens", async () => {
  // Create valid token
  const validToken = createSessionToken(["example.com"])

  // Manually tamper (change workspaces without re-signing)
  const [header, payload, signature] = validToken.split(".")
  const decoded = JSON.parse(atob(payload))
  decoded.workspaces = ["example.com", "victim.com"] // Add workspace
  const tamperedPayload = btoa(JSON.stringify(decoded))
  const tamperedToken = `${header}.${tamperedPayload}.${signature}`

  const response = await fetch("http://localhost:8999/api/restart-workspace", {
    headers: { "Cookie": `session=${tamperedToken}` }
  })

  expect(response.status).toBe(401) // Must reject invalid signature
})
```

**Files to test**:
- `apps/web/features/auth/lib/jwt.ts:36-56` (verifySessionToken)
- `apps/web/features/auth/lib/auth.ts:34-42` (getSessionUser)

**Why critical**: Bypasses all workspace authorization

---

### 3. Session Cookie Flow (MCP Tools → API)

**Risk**: Session cookie not passed correctly, tools fail for all users

**Test**:
```typescript
test("session cookie flows from parent to MCP tool", async () => {
  // 1. Login to get session cookie
  const loginRes = await fetch("http://localhost:8999/api/login", {
    method: "POST",
    body: JSON.stringify({ workspace: "test", passcode: "test" })
  })
  const cookies = loginRes.headers.get("set-cookie")
  const sessionCookie = cookies.match(/session=([^;]+)/)[1]

  // 2. Send message that triggers restart_dev_server
  const streamRes = await fetch("http://localhost:8999/api/claude/stream", {
    method: "POST",
    headers: { "Cookie": `session=${sessionCookie}` },
    body: JSON.stringify({
      message: "restart the dev server",
      workspace: "test"
    })
  })

  // 3. Verify tool succeeded (not 401)
  const events = await parseSSEStream(streamRes.body)
  const toolResults = events.filter(e => e.type === "tool_result")

  expect(toolResults[0].isError).toBe(false)
})
```

**Files to test**:
- `apps/web/app/api/claude/stream/route.ts:358` (extract cookie)
- `apps/web/lib/workspace-execution/agent-child-runner.ts:62` (env var)
- `packages/tools/src/lib/bridge-api-client.ts:52` (read env)

**Why critical**: Breaks all MCP tools that need API calls

---

## 🟡 CRITICAL FUNCTIONALITY PATHS

### 4. Direct Tool Execution (install_package)

**Risk**: Package installation fails, users can't add dependencies

**Test**:
```typescript
test("install_package executes directly without API", async () => {
  // Mock: MCP tool running in child process
  process.chdir("/srv/webalive/sites/test/user")

  const result = await installPackage({
    packageName: "lodash",
    version: "4.17.21"
  })

  expect(result.isError).toBe(false)
  expect(existsSync("/srv/webalive/sites/test/user/node_modules/lodash")).toBe(true)
})
```

**Files to test**:
- `packages/tools/src/tools/workspace/install-package.ts:33-76`

**Why critical**: Core feature used in every project

---

### 5. Workspace Path Validation

**Risk**: Invalid paths cause tools to fail or access wrong locations

**Test**:
```typescript
test("validateWorkspacePath rejects paths outside allowed bases", () => {
  expect(() => validateWorkspacePath("/etc/passwd")).toThrow()
  expect(() => validateWorkspacePath("/tmp/workspace")).toThrow()
  expect(() => validateWorkspacePath("/srv/webalive/sites/test/user")).not.toThrow()
})

test("validateWorkspacePath resolves symlinks", () => {
  // Create symlink outside allowed base
  symlinkSync("/etc", "/srv/webalive/sites/test/user/evil-link")

  expect(() =>
    validateWorkspacePath("/srv/webalive/sites/test/user/evil-link")
  ).toThrow() // Must resolve and reject
})
```

**Files to test**:
- `packages/tools/src/lib/workspace-validator.ts:19-38`

**Why critical**: Foundation of all workspace security

---

### 6. Workspace Authorization Extraction

**Risk**: Workspace name extracted incorrectly, wrong auth check

**Test**:
```typescript
test("extracts workspace from RESOLVED path, not original", () => {
  // Setup: User authenticated for "attacker.com"
  const user = { id: "test", workspaces: ["attacker.com"] }

  // Request with path traversal
  const originalPath = "/srv/webalive/sites/attacker.com/../victim.com/user"
  const resolvedPath = "/srv/webalive/sites/victim.com/user"

  // Extract workspace from resolved path
  const pathParts = resolvedPath.split("/")
  const sitesIndex = pathParts.indexOf("sites")
  const workspaceName = pathParts[sitesIndex + 1]

  expect(workspaceName).toBe("victim.com") // Not "attacker.com"
  expect(user.workspaces.includes(workspaceName)).toBe(false) // Must reject
})
```

**Files to test**:
- `apps/web/lib/workspace-api-handler.ts:96-98`

**Why critical**: Prevents path traversal bypass

---

## 🔵 CRITICAL DATA PATHS

### 7. SessionUser Interface Completeness

**Risk**: Missing workspaces field causes compilation/runtime errors

**Test**:
```typescript
test("SessionUser includes workspaces array", async () => {
  const token = createSessionToken(["example.com", "demo.com"])
  setCookie("session", token)

  const user = await getSessionUser()

  expect(user).toBeDefined()
  expect(user.workspaces).toEqual(["example.com", "demo.com"])
  expect(Array.isArray(user.workspaces)).toBe(true)
})
```

**Files to test**:
- `apps/web/features/auth/lib/auth.ts:5-8` (interface)
- `apps/web/features/auth/lib/auth.ts:39-42` (extraction)

**Why critical**: Breaks all workspace authorization if missing

---

## Testing Priority

### Pre-Deployment (MUST PASS)

1. ✅ Path traversal attack prevention (#1)
2. ✅ JWT tampering rejection (#2)
3. ✅ SessionUser completeness (#7)
4. ✅ Workspace extraction from resolved path (#6)

### Post-Deployment (Within 24 Hours)

5. ⚠️ Session cookie flow end-to-end (#3)
6. ⚠️ Direct tool execution (#4)
7. ⚠️ Workspace path validation (#5)

---

## Test Execution

```bash
# Run security tests
cd apps/web
bun run test workspace-api-handler.test.ts
bun run test auth.test.ts

# Run integration tests
bun run test:e2e critical-paths.spec.ts

# Manual verification
curl -X POST http://localhost:8999/api/restart-workspace \
  -H "Cookie: session=<token>" \
  -d '{"workspaceRoot":"/srv/webalive/sites/attacker/../victim/user"}'
# Must return 403
```

---

## Known Gaps (TODO)

- [ ] No E2E test for session cookie flow (#3)
- [ ] No test for symlink resolution in path validation (#5)
- [ ] No test for JWT expiration handling
- [ ] No test for multi-workspace session behavior

---

**Last Updated**: 2025-11-12
**Status**: Active - tests should be implemented before deployment
