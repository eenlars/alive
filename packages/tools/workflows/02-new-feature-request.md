# Tool Workflow: New Feature Request

## Scenario
User requests: "Add [specific feature] to my app"

## Agent Capabilities
- Code search (`Grep`, `Glob`)
- Code reading (`Read`)
- Code writing (`Write`, `Edit`)
- Package installation (`install_package`)
- Codebase checks (`check_codebase`)
- Server restart (`restart_dev_server`)

## Decision Tree

```
START: User requests new feature
│
├─→ ANALYSIS PHASE:
│   ├─→ Check: Does feature already exist?
│   │   ├─→ Grep(pattern: "feature-keywords", path: "src/**")
│   │   ├─→ IF found: Inform user, ask if they want modifications
│   │   └─→ IF not found: Proceed
│   │
│   ├─→ Check: Does feature require new dependencies?
│   │   ├─→ IF yes: install_package({ package: "package-name" })
│   │   └─→ WAIT for installation
│   │
│   └─→ Check: Does feature require refactoring?
│       ├─→ Will new code make files >500 lines?
│       ├─→ Is existing code tightly coupled?
│       └─→ IF YES: Plan refactoring first
│
├─→ IMPLEMENTATION PLANNING:
│   ├─→ List files to create:
│   │   ├─→ New components
│   │   ├─→ New hooks
│   │   ├─→ New utilities
│   │   ├─→ New pages
│   │   └─→ New API routes (if needed)
│   │
│   ├─→ List files to modify:
│   │   ├─→ Routes (App.tsx or routing file)
│   │   ├─→ Navigation components
│   │   ├─→ Parent components
│   │   └─→ Config files
│   │
│   └─→ Determine: Can writes be parallel?
│       ├─→ Independent new files: YES (parallel)
│       └─→ Same file edits: NO (sequential or single edit)
│
├─→ CONTEXT GATHERING:
│   ├─→ For files to modify:
│   │   ├─→ Check: Already in context?
│   │   │   ├─→ YES: Skip reading
│   │   │   └─→ NO: Read(file)
│   │   └─→ Read in parallel if multiple files
│   │
│   └─→ For related existing code:
│       └─→ Grep(pattern: related-pattern, path: "src/**")
│           └─→ Read(relevant-files) if needed
│
└─→ EXECUTION PHASE:
    ├─→ INSTALL DEPENDENCIES (if needed):
    │   └─→ install_package({ package: "package-name" })
    │
    ├─→ CREATE NEW FILES (parallel):
    │   ├─→ Write(component1.tsx, content) || Write(component2.tsx, content) || Write(hook.ts, content)
    │   └─→ Write(api-route.ts, content) if backend feature
    │
    ├─→ MODIFY EXISTING FILES:
    │   ├─→ IF single file: Edit(file, changes)
    │   └─→ IF multiple files: Parallel Edit calls when independent
    │
    └─→ VERIFICATION:
        ├─→ check_codebase({}) → Ensure no errors
        ├─→ IF errors: Fix them
        └─→ restart_dev_server({}) → Apply changes and clear cache
```

## Tool Sequence Examples

### Example 1: Simple Frontend Feature (No Dependencies)
Request: "Add a dark mode toggle"

```
1. Grep(pattern: "theme|dark", path: "src/**")
2. IF theme system exists:
   a. Read(theme-related-file)
   b. Edit(file, add-toggle-component)
3. ELSE:
   a. install_package({ package: "next-themes@latest" })
   b. Write(src/components/ThemeToggle.tsx, content) || Edit(src/App.tsx, add-toggle)
4. check_codebase({})
5. restart_dev_server({})
```

### Example 2: Feature Requiring Refactoring
Request: "Add user profile editing" (but profile page is already 600 lines)

```
1. Read(src/pages/Profile.tsx)
2. Identify: File too large, needs splitting
3. REFACTOR FIRST:
   a. Write(src/components/ProfileHeader.tsx, content) ||
     Write(src/components/ProfileForm.tsx, content) ||
     Write(src/hooks/useProfile.ts, content)
   b. Edit(src/pages/Profile.tsx, refactor-to-use-components)
4. THEN ADD FEATURE:
   a. Write(src/components/ProfileEditDialog.tsx, content)
   b. Edit(src/components/ProfileForm.tsx, add-edit-logic)
5. check_codebase({})
6. restart_dev_server({})
```

### Example 3: Feature with Multiple Dependencies
Request: "Add real-time chat"

```
1. Check existing code:
   a. Grep(pattern: "chat|websocket", path: "src/**")
2. Dependencies:
   a. install_package({ package: "date-fns@latest" }) ||
     install_package({ package: "socket.io-client@latest" })
3. Implementation (parallel):
   a. Write(src/components/ChatInterface.tsx, content) ||
     Write(src/hooks/useChat.ts, content) ||
     Write(src/lib/chatUtils.ts, content)
4. Integration:
   a. Read(src/App.tsx)
   b. Edit(src/App.tsx, add-chat-route)
5. check_codebase({})
6. restart_dev_server({})
```

## Critical Rules

1. **Check existing code first** - Don't duplicate functionality
2. **Maximize parallelization** - Write independent files simultaneously
3. **Refactor before adding complexity** - Don't make bad code worse
4. **Dependencies before code** - Install packages before using them
5. **Plan before executing** - Know all files you'll create/modify
6. **Read only what's not in context** - Check context first
7. **Small focused files** - Create components, hooks, utils separately
8. **Always verify** - Run check_codebase and restart_dev_server after changes

## Common Mistakes

❌ Writing code without checking if feature exists
❌ Sequential writes when parallel possible
❌ Creating monolithic files instead of small components
❌ Modifying files without reading them first (if not in context)
❌ Not installing dependencies before using them
❌ Not running check_codebase after changes
❌ Not restarting server after adding dependencies
❌ Forgetting to update routes/navigation

## Tool Reference

- `Grep(pattern, path)` - Search code for patterns
- `Glob(pattern)` - Find files by pattern
- `Read(path)` - Read file contents
- `Write(path, content)` - Create new file
- `Edit(path, changes)` - Modify existing file
- `install_package({ package })` - Install npm package via bun
- `check_codebase({})` - Run TypeScript + ESLint checks
- `restart_dev_server({})` - Restart systemd service, clear Vite cache

