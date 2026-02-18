# CodexProvider Implementation — Revised (Feb 18)

Based on verified SDK source (fase_1/13), updated implementation spec.

## CodexProvider Class

```typescript
import { Codex, Thread, ThreadEvent, ThreadItem, Usage } from "@openai/codex-sdk";

interface CodexProviderConfig {
  apiKey: string;
  baseUrl?: string;        // for OpenAI-compatible endpoints
  codexHome: string;       // per-workspace CODEX_HOME
  mcpServers: McpServerSpec[];
}

class CodexProvider implements AgentProvider {
  private codex: Codex;
  private config: CodexProviderConfig;

  constructor(config: CodexProviderConfig) {
    this.config = config;
    this.codex = new Codex({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      env: {
        // Must pass ALL needed env vars since env REPLACES process.env
        PATH: process.env.PATH!,
        HOME: config.codexHome,         // isolate sessions per workspace
        CODEX_HOME: config.codexHome,
        NODE_ENV: process.env.NODE_ENV ?? "production",
        // ... other required vars
      },
      config: {
        // developer_instructions via config flattening
        developer_instructions: undefined, // set per-session in startSession
      },
    });
  }

  async startSession(options: SessionOptions): Promise<AgentSession> {
    // 1. Write MCP config
    await this.writeMcpConfig(options);

    // 2. Create thread
    const thread = this.codex.startThread({
      model: options.model ?? "o4-mini",
      sandboxMode: "danger-full-access",
      workingDirectory: options.workspaceDir,
      skipGitRepoCheck: true,
      approvalPolicy: "never",
      modelReasoningEffort: options.reasoningEffort ?? "medium",
    });

    return new CodexSession(thread, options);
  }

  async resumeSession(threadId: string, options: SessionOptions): Promise<AgentSession> {
    const thread = this.codex.resumeThread(threadId, {
      model: options.model ?? "o4-mini",
      sandboxMode: "danger-full-access",
      workingDirectory: options.workspaceDir,
      skipGitRepoCheck: true,
      approvalPolicy: "never",
    });

    return new CodexSession(thread, options);
  }

  private async writeMcpConfig(options: SessionOptions): Promise<void> {
    // Implementation in fase_2/25
  }
}
```

## CodexSession Class

```typescript
class CodexSession implements AgentSession {
  private thread: Thread;
  private options: SessionOptions;
  private abortController: AbortController | null = null;

  constructor(thread: Thread, options: SessionOptions) {
    this.thread = thread;
    this.options = options;
  }

  get threadId(): string | null {
    return this.thread.id;
  }

  async *query(input: string): AsyncGenerator<AliveEvent> {
    this.abortController = new AbortController();

    const { events } = await this.thread.runStreamed(input, {
      signal: this.abortController.signal,
    });

    for await (const event of events) {
      yield* this.normalizeEvent(event);
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private *normalizeEvent(event: ThreadEvent): Generator<AliveEvent> {
    switch (event.type) {
      case "thread.started":
        yield { type: "session.started", sessionId: event.thread_id };
        break;

      case "turn.started":
        yield { type: "turn.started" };
        break;

      case "turn.completed":
        yield {
          type: "turn.completed",
          usage: {
            inputTokens: event.usage.input_tokens,
            cachedInputTokens: event.usage.cached_input_tokens,
            outputTokens: event.usage.output_tokens,
          },
        };
        break;

      case "turn.failed":
        yield { type: "error", message: event.error.message };
        break;

      case "item.started":
      case "item.updated":
      case "item.completed":
        yield* this.normalizeItem(event.item, event.type);
        break;

      case "error":
        yield { type: "error", message: event.message };
        break;
    }
  }

  private *normalizeItem(
    item: ThreadItem,
    eventType: string
  ): Generator<AliveEvent> {
    const phase = eventType === "item.completed" ? "complete"
                : eventType === "item.started" ? "start"
                : "update";

    switch (item.type) {
      case "agent_message":
        yield { type: "text", text: item.text, phase };
        break;

      case "reasoning":
        yield { type: "thinking", text: item.text, phase };
        break;

      case "command_execution":
        yield {
          type: "tool_use",
          tool: "bash",
          input: { command: item.command },
          output: item.aggregated_output,
          exitCode: item.exit_code,
          status: item.status,
          phase,
        };
        break;

      case "file_change":
        yield {
          type: "file_change",
          changes: item.changes.map(c => ({
            path: c.path,
            kind: c.kind, // add | delete | update
          })),
          status: item.status,
          phase,
        };
        break;

      case "mcp_tool_call":
        yield {
          type: "tool_use",
          tool: `${item.server}/${item.tool}`,
          input: item.arguments,
          output: item.result?.content,
          error: item.error?.message,
          status: item.status,
          phase,
        };
        break;

      case "web_search":
        yield { type: "web_search", query: item.query, phase };
        break;

      case "todo_list":
        yield {
          type: "plan",
          items: item.items.map(i => ({
            text: i.text,
            completed: i.completed,
          })),
          phase,
        };
        break;

      case "error":
        yield { type: "error", message: item.message };
        break;
    }
  }
}
```

## Key Differences from Previous Implementation Docs

1. **`developer_instructions`** instead of `system_message` or CODEX.md
2. **`env` REPLACES `process.env`** — must explicitly pass PATH, HOME, etc.
3. **`CODEX_HOME` env var** for session isolation (not HOME override)
4. **`ephemeral: true`** should be set via config to avoid session persistence (Alive manages its own)
5. **`AbortSignal`** for cancellation — cleaner than process.kill()
6. **`modelReasoningEffort`** exposed as thread option — map from Alive's reasoning level setting

## Supersedes
- fase_2/15 (worker entry refactoring) — this is the concrete provider implementation
- fase_2/21 (concrete API mapping) — incorporated into normalizeEvent/normalizeItem
