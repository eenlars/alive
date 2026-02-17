# Fase 2.15 — Worker Entry Refactoring Walkthrough

## Goal
Transform `worker-entry.mjs` from Claude-specific to provider-agnostic.

## Current Flow (Claude-only)

```
worker-entry.mjs
├── Receives IPC: { type: "query", prompt, sessionId, workspacePath, ... }
├── Creates Claude session via claude-agent-sdk
│   ├── Configures MCP servers (in-process via createSdkMcpServer)
│   ├── Sets system prompt
│   ├── Configures permissions (canUseTool callback)
│   └── Starts session.start(prompt)
├── Iterates over session messages
│   └── Sends IPC: { type: "message", content: <claude message> }
└── On completion: { type: "complete", result }
```

## Target Flow (multi-provider)

```
worker-entry.mjs
├── Receives IPC: { type: "query", prompt, provider, ... }
├── Resolves provider from registry
│   ├── "claude" → ClaudeProvider
│   └── "codex" → CodexProvider
├── Calls provider.createSession(config)
├── Calls session.run(prompt)
├── Iterates over AgentEvent stream
│   └── Sends IPC: { type: "message", content: <normalized event> }
└── On completion: { type: "complete", result }
```

## Step-by-Step Refactoring

### Step 1: Extract current Claude logic into ClaudeProvider

**New file**: `packages/worker-pool/src/providers/claude.ts`

```typescript
import { AgentProvider, AgentSession, AgentEvent, ProviderConfig } from './types';

export class ClaudeProvider implements AgentProvider {
  name = 'claude' as const;
  
  async createSession(config: ProviderConfig): Promise<AgentSession> {
    // Move existing claude-agent-sdk setup here
    // MCP servers, system prompt, permissions
    return new ClaudeSession(session, config);
  }
}

class ClaudeSession implements AgentSession {
  async *run(prompt: string): AsyncGenerator<AgentEvent> {
    // Move existing session.start() + message iteration here
    // Normalize Claude messages to AgentEvent
  }
  
  async abort(): Promise<void> {
    // Session cleanup
  }
}
```

### Step 2: Create CodexProvider

**New file**: `packages/worker-pool/src/providers/codex.ts`

```typescript
import { Codex } from '@openai/codex-sdk';
import { AgentProvider, AgentSession, AgentEvent, ProviderConfig } from './types';

export class CodexProvider implements AgentProvider {
  name = 'codex' as const;
  
  async createSession(config: ProviderConfig): Promise<AgentSession> {
    const codex = new Codex({
      apiKey: process.env.OPENAI_API_KEY,
      env: buildCodexEnv(config),
      config: buildCodexConfig(config),
    });
    
    const thread = config.sessionId 
      ? codex.resumeThread(config.sessionId, threadOptions)
      : codex.startThread(threadOptions);
    
    return new CodexSession(thread, config);
  }
}

class CodexSession implements AgentSession {
  async *run(prompt: string): AsyncGenerator<AgentEvent> {
    const { events } = await this.thread.runStreamed(prompt);
    
    for await (const event of events) {
      yield this.normalize(event);
    }
  }
  
  private normalize(event: ThreadEvent): AgentEvent {
    switch (event.type) {
      case 'thread.started':
        return { type: 'session', sessionId: event.thread_id };
      case 'item.started':
      case 'item.updated':
      case 'item.completed':
        return this.normalizeItem(event);
      case 'turn.completed':
        return { 
          type: 'complete', 
          result: {
            success: true,
            usage: {
              inputTokens: event.usage.input_tokens,
              outputTokens: event.usage.output_tokens,
              cachedTokens: event.usage.cached_input_tokens,
            }
          }
        };
      case 'turn.failed':
        return { type: 'error', error: event.error.message };
      case 'error':
        return { type: 'error', error: event.message };
      default:
        return { type: 'message', content: { role: 'assistant', type: 'text', text: '', raw: event } };
    }
  }
  
  private normalizeItem(event: ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent): AgentEvent {
    const item = event.item;
    switch (item.type) {
      case 'agent_message':
        return { type: 'message', content: { role: 'assistant', type: 'text', text: item.text } };
      case 'reasoning':
        return { type: 'message', content: { role: 'assistant', type: 'thinking', text: item.text } };
      case 'command_execution':
        if (event.type === 'item.started') {
          return { type: 'message', content: { role: 'assistant', type: 'tool_use', toolName: 'Bash', toolInput: { command: item.command }, toolId: item.id } };
        }
        if (event.type === 'item.updated') {
          // In-progress update; aggregated_output/exit_code not yet final — skip
          return { type: 'message', content: { role: 'assistant', type: 'text', text: '', raw: event } };
        }
        return { type: 'message', content: { role: 'tool', type: 'tool_result', toolId: item.id, output: item.aggregated_output, isError: item.exit_code !== 0 } };
      case 'file_change':
        return { type: 'message', content: { role: 'assistant', type: 'tool_use', toolName: 'Edit', toolInput: { changes: item.changes }, toolId: item.id } };
      case 'mcp_tool_call':
        if (event.type === 'item.started') {
          return { type: 'message', content: { role: 'assistant', type: 'tool_use', toolName: `mcp__${item.server}__${item.tool}`, toolInput: item.arguments, toolId: item.id } };
        }
        if (event.type === 'item.updated') {
          // In-progress update; result not yet final — skip
          return { type: 'message', content: { role: 'assistant', type: 'text', text: '', raw: event } };
        }
        return { type: 'message', content: { role: 'tool', type: 'tool_result', toolId: item.id, output: JSON.stringify(item.result), isError: item.status === 'failed' } };
      case 'todo_list':
        return { type: 'message', content: { role: 'assistant', type: 'plan', items: item.items } };
      case 'web_search':
        return { type: 'message', content: { role: 'assistant', type: 'search', text: item.query } };
      case 'error':
        return { type: 'error', error: item.message };
      default:
        return { type: 'message', content: { role: 'assistant', type: 'text', text: '', raw: item } };
    }
  }
}
```

### Step 3: Create provider registry

**New file**: `packages/worker-pool/src/providers/registry.ts`

```typescript
import { ClaudeProvider } from './claude';
import { CodexProvider } from './codex';

const providers = {
  claude: new ClaudeProvider(),
  codex: new CodexProvider(),
};

export function getProvider(name: string) {
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown provider: ${name}`);
  return provider;
}
```

### Step 4: Update worker-entry.mjs

```diff
- import { Session } from '@anthropic-ai/claude-agent-sdk';
+ import { getProvider } from './providers/registry';

  process.on('message', async (msg) => {
    if (msg.type === 'query') {
-     const session = new Session({ ... });
-     for await (const message of session.start(msg.prompt)) {
-       process.send({ type: 'message', content: message });
-     }
+     const provider = getProvider(msg.provider || 'claude');
+     const session = await provider.createSession({
+       oauthAccessToken: msg.oauthAccessToken,
+       workspacePath: msg.workspacePath,
+       sessionId: msg.sessionId,
+       mcpServers: msg.mcpServers,
+       systemPrompt: msg.systemPrompt,
+       permissions: msg.permissions,
+     });
+     for await (const event of session.run(msg.prompt)) {
+       process.send(event);
+     }
    }
  });
```

### Step 5: Update IPC types

Add `provider` field to query IPC message:
```typescript
interface QueryMessage {
  type: 'query';
  provider: 'claude' | 'codex';  // NEW
  prompt: string;
  sessionId?: string;
  workspacePath: string;
  // ... existing fields
}
```

## MCP Server Config Passing

Both providers receive MCP server specs in the same format:
```typescript
interface McpServerSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
```

- **Claude**: Passed as `McpStdioServerConfig` to SDK
- **Codex**: Passed via `config.mcp_servers` option which serializes to `--config mcp_servers.<name>.command="..."` TOML

## Migration Safety

1. Default provider = `claude` → zero breaking changes for existing workspaces
2. Provider registry is extensible → future providers (Gemini, local models) plug in easily
3. AgentEvent normalization keeps frontend changes minimal
4. Feature flag: `ENABLE_CODEX_PROVIDER=true` to gate availability

## Estimated Work
- Step 1 (extract Claude): ~4h (careful refactoring, preserve all behavior)
- Step 2 (Codex provider): ~3h (new code, straightforward)
- Step 3 (registry): ~1h
- Step 4+5 (worker updates): ~2h
- Testing: ~4h
- **Total: ~14h**
