# Tool Workflow: Bug Report / Debugging Request

## Scenario
User reports: "Something is broken" or "I'm getting an error" or "The site isn't working"

## Agent Capabilities
- Server logs (`read_server_logs`, `debug_workspace`)
- Code reading (`Read`)
- Code searching (`Grep`)
- Codebase checks (`check_codebase`)
- Server restart (`restart_dev_server`)

## Decision Tree

```
START: User reports bug/error
│
├─→ Check: Is error message in user's report?
│   ├─→ YES: Extract error details
│   └─→ NO: Need to gather information
│
├─→ INFORMATION GATHERING:
│   ├─→ debug_workspace({ workspace: "domain.alive.best" })
│   │   ├─→ Returns: Recent server logs (last 10 minutes)
│   │   ├─→ IF errors found: Analyze stack trace, error patterns
│   │   └─→ IF no errors: Check codebase
│   │
│   ├─→ check_codebase({})
│   │   ├─→ Returns: TypeScript errors, ESLint warnings
│   │   ├─→ IF errors found: Fix compilation issues first
│   │   └─→ IF clean: Check runtime issues
│   │
│   └─→ IF specific error mentioned:
│       └─→ read_server_logs({ workspace, regex: "error-pattern", lines: 500 })
│
├─→ ROOT CAUSE ANALYSIS:
│   ├─→ ERROR TYPE: TypeScript/compilation error
│   │   ├─→ check_codebase({}) → Get exact errors
│   │   └─→ Read(file-with-error) → Fix type issues
│   │
│   ├─→ ERROR TYPE: Runtime error (from logs)
│   │   ├─→ Extract file/line from stack trace
│   │   └─→ Read(problem-file) → Analyze and fix
│   │
│   ├─→ ERROR TYPE: Server not responding
│   │   ├─→ read_server_logs({ workspace, since: "5 minutes ago" })
│   │   ├─→ IF crashed: restart_dev_server({})
│   │   └─→ IF still failing: Check code changes
│   │
│   └─→ ERROR TYPE: Build/compilation issue
│       └─→ check_codebase({}) → Fix all errors
│
├─→ CONTEXT LOADING:
│   └─→ Read(identified-problem-file)
│       ├─→ IF imports suggest more files needed:
│       │   └─→ Read(dependency-file-1) || Read(dependency-file-2)
│       └─→ ANALYZE: Identify exact issue
│
└─→ FIX IMPLEMENTATION:
    ├─→ Edit(file, changes) OR Write(new-file, content)
    ├─→ IF fix requires multiple files:
    │   └─→ Parallel Edit calls when possible
    ├─→ VERIFICATION:
    │   ├─→ check_codebase({}) → Ensure no new errors
    │   └─→ IF server issue: restart_dev_server({})
    └─→ IF still failing: debug_workspace({}) again to check logs
```

## Tool Sequence

### Path 1: TypeScript/Compilation Error
```
1. check_codebase({})
   → Returns: List of TypeScript/ESLint errors
2. For each error:
   a. Read(file-with-error)
   b. Edit(file, fix-error)
3. check_codebase({}) again to verify fixes
4. restart_dev_server({}) if needed
```

### Path 2: Runtime Error (from Logs)
```
1. debug_workspace({ workspace: "domain.alive.best" })
   → Returns: Recent server logs with errors
2. Extract error details:
   - File path from stack trace
   - Error message
   - Line number (if available)
3. Read(problem-file)
4. Edit(file, fix-issue)
5. restart_dev_server({}) to apply changes
6. debug_workspace({}) again to verify fix
```

### Path 3: Server Not Responding
```
1. read_server_logs({ workspace, since: "10 minutes ago", lines: 200 })
   → Check if server crashed or stopped
2. IF logs show crash:
   a. Read(recently-changed-files) → Find breaking change
   b. Edit(file, revert-or-fix)
   c. restart_dev_server({})
3. IF logs show nothing:
   a. restart_dev_server({}) → May fix stale cache issues
   b. debug_workspace({}) → Check if server started
```

### Path 4: Build/Bundle Error
```
1. check_codebase({})
   → Get compilation errors
2. IF import errors:
   a. Grep(pattern: "import.*missing-module", path: "src/**")
   b. install_package({ package: "missing-module" })
3. IF type errors:
   a. Read(file-with-type-error)
   b. Edit(file, fix-types)
4. check_codebase({}) → Verify build succeeds
```

### Path 5: Vite Cache Issues (Renders but Doesn't Work)
```
1. User reports: "Component renders but doesn't respond"
2. restart_dev_server({})
   → Clears Vite cache and restarts
3. IF still broken:
   a. check_codebase({}) → Check for errors
   b. Read(component-file) → Verify code is correct
   c. Edit(file, fix-if-needed)
```

## Critical Rules

1. **Always use debugging tools FIRST** - Don't guess, gather data
2. **Read logs before reading code** - Error messages guide you to the problem
3. **check_codebase before runtime debugging** - Fix compilation errors first
4. **restart_dev_server fixes Vite cache issues** - Use when components render but don't work
5. **Parallel file reading** - If multiple files are implicated, read together
6. **Don't fix blindly** - Understand root cause before changing code
7. **Verify fixes** - Run check_codebase and debug_workspace after fixes

## Common Mistakes

❌ Reading code without checking logs first
❌ Making changes without running check_codebase
❌ Not restarting server after fixes
❌ Reading files sequentially when parallel is faster
❌ Assuming error is where user thinks it is
❌ Not clearing Vite cache (restart_dev_server) for rendering issues
❌ Fixing symptoms instead of root cause

## Tool Reference

- `debug_workspace({ workspace, lines?, since? })` - Quick debugging, reads recent logs
- `read_server_logs({ workspace, lines?, since?, regex?, summary_only? })` - Detailed log reading with filtering
- `check_codebase({})` - TypeScript + ESLint checks
- `restart_dev_server({})` - Restart systemd service, clears Vite cache
- `Read(path)` - Read file contents
- `Edit(path, changes)` - Edit file
- `Grep(pattern, path)` - Search code
- `install_package({ package })` - Install npm package if missing

