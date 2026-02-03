# Tool Workflow: Package Installation

## Scenario
User requests: "Add [package] to my project" or feature requires a new dependency

## Agent Capabilities
- Package installation (`install_package`)
- Codebase checks (`check_codebase`)
- Server restart (`restart_dev_server`)
- Code reading (`Read`)
- Code searching (`Grep`)

## Decision Tree

```
START: User requests package installation OR feature needs dependency
│
├─→ Check: Does package already exist?
│   ├─→ Read(package.json)
│   ├─→ IF found: Inform user, ask if they want to update
│   └─→ IF not found: Proceed
│
├─→ INSTALLATION:
│   └─→ install_package({ package: "package-name@version" })
│       ├─→ Tool runs: bun add package-name@version
│       ├─→ Updates package.json and bun.lockb
│       └─→ Installs in workspace (as workspace user)
│
├─→ VERIFICATION:
│   ├─→ check_codebase({})
│   │   ├─→ IF errors: May need type definitions
│   │   │   └─→ install_package({ package: "@types/package-name" })
│   │   └─→ IF clean: Continue
│   │
│   └─→ restart_dev_server({})
│       └─→ Ensures Vite picks up new dependencies
│
└─→ USAGE:
    └─→ Update code to use new package
        ├─→ Edit(file, add-import)
        └─→ check_codebase({}) → Verify imports work
```

## Tool Sequence

### Path 1: Simple Package Installation
```
1. Read(package.json)
   → Check if package already exists
2. install_package({ package: "lodash@latest" })
   → Installs package, updates package.json
3. check_codebase({})
   → Verify no type errors
4. restart_dev_server({})
   → Clear Vite cache, restart server
5. Edit(file, add-import-and-usage)
```

### Path 2: Package with Type Definitions
```
1. install_package({ package: "express@latest" })
2. check_codebase({})
   → IF type errors:
3. install_package({ package: "@types/express@latest" })
4. check_codebase({})
   → Should be clean now
5. restart_dev_server({})
```

### Path 3: Multiple Packages (Parallel)
```
1. install_package({ package: "date-fns@latest" }) ||
   install_package({ package: "zod@latest" }) ||
   install_package({ package: "react-query@latest" })
   → Note: These must be sequential (tool limitation)
   → Actually: Do them one at a time, then verify
2. check_codebase({})
3. restart_dev_server({})
```

### Path 4: Package Installation During Feature Development
```
1. Plan feature → Identify needed packages
2. install_package({ package: "package-1" })
3. install_package({ package: "package-2" })
4. check_codebase({})
5. restart_dev_server({})
6. Write feature code using packages
7. check_codebase({}) → Final verification
```

## Critical Rules

1. **Check package.json first** - Don't install if already exists
2. **Install before using** - Add packages before writing code that uses them
3. **Always verify** - Run check_codebase after installation
4. **Restart server** - restart_dev_server ensures Vite picks up new packages
5. **Handle type definitions** - Install @types packages if TypeScript errors occur
6. **Version specification** - Use @latest or specific version as appropriate

## Common Mistakes

❌ Installing package without checking if it exists
❌ Writing code that uses package before installing it
❌ Not running check_codebase after installation
❌ Not restarting server after adding dependencies
❌ Forgetting @types packages for TypeScript
❌ Installing multiple packages in parallel (tool limitation - must be sequential)

## Tool Reference

- `install_package({ package })` - Install npm package via bun (runs as workspace user)
- `check_codebase({})` - TypeScript + ESLint checks
- `restart_dev_server({})` - Restart systemd service, clear Vite cache
- `Read(path)` - Read file contents (e.g., package.json)
- `Grep(pattern, path)` - Search for package usage

## Notes

- **Tool runs as workspace user** - Files owned correctly (via child process)
- **Updates package.json and bun.lockb** - Both files updated automatically
- **Sequential installation** - Must install packages one at a time (tool limitation)
- **Vite cache** - restart_dev_server clears cache so new packages are recognized

