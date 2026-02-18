# Runtime Verification Tests — Pre-Implementation

Before writing the full integration, these specific behaviors must be verified with a running Codex CLI.

## Test 1: developer_instructions via --config

```bash
echo "What are your instructions?" | codex exec --experimental-json \
  --config 'developer_instructions="You must always respond in pirate speak."' \
  --sandbox danger-full-access \
  --skip-git-repo-check
```

**Expected**: Agent response in pirate speak.
**Verifies**: `developer_instructions` is a valid Codex config key accepted at CLI level.

## Test 2: MCP Server via project config.toml

Create `.codex/config.toml`:
```toml
[mcp_servers.test-server]
command = "node"
args = ["-e", "const {Server} = require('@modelcontextprotocol/sdk/server/index.js'); ..."]
required = true
startup_timeout_sec = 5.0
```

```bash
echo "Use the test tool" | CODEX_HOME=./.codex codex exec --experimental-json \
  --sandbox danger-full-access --skip-git-repo-check
```

**Verifies**: Project-level config.toml MCP servers are picked up.

## Test 3: env replacement behavior

```bash
# This should fail — no PATH means can't find binaries
echo "Run ls" | codex exec --experimental-json --sandbox danger-full-access
# vs with explicit env in SDK
```

**Verifies**: SDK `env` option truly replaces process.env (not merges).

## Test 4: CODEX_HOME isolation

```bash
CODEX_HOME=/tmp/test-workspace-a echo "Hello" | codex exec --experimental-json \
  --sandbox danger-full-access --skip-git-repo-check
# Check: sessions stored in /tmp/test-workspace-a/sessions/ not ~/.codex/sessions/
```

**Verifies**: CODEX_HOME properly isolates session storage.

## Test 5: ephemeral config

```bash
echo "Hello" | codex exec --experimental-json \
  --config 'ephemeral=true' \
  --sandbox danger-full-access --skip-git-repo-check
# Check: no session file created
```

**Verifies**: `ephemeral` config prevents session persistence.

## Test 6: Thread resume with SDK

```typescript
const codex = new Codex({ apiKey: "..." });
const thread = codex.startThread({ sandboxMode: "danger-full-access", skipGitRepoCheck: true });
const { finalResponse } = await thread.run("Remember the number 42.");
const threadId = thread.id!;

const thread2 = codex.resumeThread(threadId, { sandboxMode: "danger-full-access" });
const { finalResponse: r2 } = await thread2.run("What number did I tell you?");
// Expected: mentions 42
```

**Verifies**: Thread resume works via SDK, session state persists correctly.

## Test 7: AbortSignal cancellation

```typescript
const controller = new AbortController();
const { events } = await thread.runStreamed("Write a very long essay about...", {
  signal: controller.signal,
});
setTimeout(() => controller.abort(), 1000);
// Verify: generator terminates, process is killed, no zombie processes
```

**Verifies**: Clean abort behavior, resource cleanup.

## Priority

Tests 1 and 2 are **blockers** — if `developer_instructions` doesn't work via CLI config, or MCP servers aren't loaded from project config.toml, the entire approach needs revision.

Tests 3-7 are important but have documented fallback strategies.
