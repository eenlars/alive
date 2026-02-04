# Plan Mode Architecture

Plan mode allows Claude to explore and analyze without making modifications.

## Quick Reference

- **Constant**: `PLAN_MODE_BLOCKED_TOOLS` from `@webalive/shared`
- **Helper**: `filterToolsForPlanMode(tools, isPlanMode)` - use this to filter
- **Trigger**: `planMode: true` in request body
- **Effect**: Filters modification tools from `allowedTools` before SDK call

## ExitPlanMode Requires User Approval

**CRITICAL**: Claude cannot approve its own plan. `ExitPlanMode` is intentionally NOT in `BRIDGE_ALLOWED_SDK_TOOLS`.

When Claude tries to use `ExitPlanMode`, `canUseTool()` denies it with a message:
> "You cannot approve your own plan. The user must review and approve the plan."

The user must click "Approve Plan" in the UI to exit plan mode and allow implementation.

## The Problem (Why This Exists)

The Claude SDK has a specific behavior: tools in the `allowedTools` array are **auto-allowed without calling `canUseTool()`**. The `canUseTool()` callback is only invoked for tools NOT in `allowedTools`.

This means:
```javascript
// WRONG: canUseTool never gets called for Edit because it's in allowedTools
const allowedTools = ["Read", "Edit", "Write"]
canUseTool: (tool) => {
  if (isPlanMode && tool === "Edit") return deny // NEVER REACHED
}

// CORRECT: Use filterToolsForPlanMode helper
import { filterToolsForPlanMode } from "@webalive/shared"
const allowedTools = filterToolsForPlanMode(baseTools, isPlanMode)
```

## Data Flow

```
Frontend Toggle (planModeStore.ts)
    ↓
getPlanModeState().planMode → Request body
    ↓
route.ts → effectivePermissionMode = planMode ? "plan" : "default"
    ↓
agent-child-runner.ts → permissionMode passed to child
    ↓
run-agent.mjs / worker-entry.mjs
    ↓
Filter PLAN_MODE_BLOCKED_TOOLS from allowedTools
    ↓
SDK receives filtered allowedTools (blocked tools cannot be called)
```

## Blocked Tools

```typescript
// From @webalive/shared/stream-tools.ts
export const PLAN_MODE_BLOCKED_TOOLS = [
  "Write", "Edit", "MultiEdit", "Bash", "NotebookEdit",
  "mcp__alive-workspace__delete_file",
  "mcp__alive-workspace__install_package",
  "mcp__alive-workspace__restart_dev_server",
  "mcp__alive-workspace__switch_serve_mode",
  "mcp__alive-workspace__create_website",
]
```

## Debugging

1. Check frontend sends `planMode: true`:
   ```
   // route.ts logs: Plan mode: see docs/architecture/plan-mode.md
   ```

2. Check runner filters tools:
   ```
   // run-agent.mjs logs: PLAN MODE ENABLED: Write/Edit/Bash tools will be blocked
   // run-agent.mjs logs: PLAN MODE: Filtered to X tools (removed Y modification tools)
   ```

3. Check blocking works:
   ```
   // run-agent.mjs logs: PLAN MODE: Blocked modification tool: Edit
   ```

## Common Issues

### Stale Closure in React

The `usePlanMode()` hook value can be stale in memoized callbacks. Solution:
```typescript
// WRONG: Stale closure
const planMode = usePlanMode()
const createBody = useCallback(() => ({ planMode }), [planMode])

// CORRECT: Read from store at execution time
import { getPlanModeState } from "@/lib/stores/planModeStore"
const createBody = useCallback(() => ({
  planMode: getPlanModeState().planMode
}), [])
```

## Related Files

- `packages/shared/src/stream-tools.ts` - Constants and helpers (`PLAN_MODE_BLOCKED_TOOLS`, `filterToolsForPlanMode`, `allowTool`, `denyTool`)
- `apps/web/lib/stores/planModeStore.ts` - Zustand store for UI toggle
- `apps/web/app/api/claude/stream/route.ts` - Receives planMode, filters tools before sending to worker
- `apps/web/scripts/run-agent.mjs` - Legacy spawn runner (backup filtering in canUseTool)
- `packages/worker-pool/src/worker-entry.mjs` - Worker pool (backup filtering in canUseTool)
