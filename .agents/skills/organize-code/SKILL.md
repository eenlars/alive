---
name: organize-code
description: Review code organization including file structure, lost files, Vite workspace structure, imports, config files, naming conventions, and code grouping.
---

# Organize Code - Structure & Organization Review

Review the codebase organization and identify improvements for better maintainability.

## File Structure & Placement

- Are all files in the correct directories according to their purpose?
- Did you put components in the right place (are UI components separated from business logic)?
- Are utility functions properly organized in dedicated utility folders?
- Are there any misplaced files that should be moved?
- Are test files colocated with their source files or in appropriate test directories?

## Lost & Orphaned Files

- Are there any unused/dead files that should be removed?
- Are there any duplicate files or redundant code?
- Are there any temporary files (e.g., .bak, .tmp, .old) that were left behind?
- Are there any commented-out imports or references to files that no longer exist?

## Vite Workspace Specifics

- Are workspace packages properly structured (packages/, apps/, libs/)?
- Is each package/app using the correct directory structure (src/, dist/, public/)?
- Are shared dependencies extracted to proper locations?
- Are barrel exports (index.ts) used appropriately for cleaner imports?
- Are build outputs and config files (.vite/, vite.config.ts) in the right places?

## Import Organization

- Are imports grouped logically (external, internal, relative)?
- Are there any circular dependencies?
- Are path aliases (e.g., @/, ~/) configured correctly and used consistently?
- Are there unused imports that should be removed?

## Configuration Files

- Are all config files (tsconfig.json, vite.config.ts, package.json) in the correct locations?
- Are workspace-level configs separated from package-level configs?
- Is the tsconfig properly extending workspace configs?

## Naming Conventions

- Do file and folder names follow a consistent convention (kebab-case, camelCase, PascalCase)?
- Are component files named consistently (e.g., ComponentName.tsx)?
- Are utility files named descriptively?

## Code Grouping

- Are related components/features grouped together?
- Should any code be extracted into separate modules or packages?
- Are types/interfaces defined near their usage or in dedicated type files?

---

Analyze the codebase and provide specific recommendations for improvements with file paths.
