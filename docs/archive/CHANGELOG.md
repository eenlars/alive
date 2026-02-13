# Changelog

All notable changes to the Alive project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Fixed
- **[2025-11-21] MCP Tool Authentication Failure** - Fixed `restart_dev_server` and other MCP tools failing with "Authentication required" when calling Bridge APIs
  - **Root Cause:** Cookie name mismatch - tools sent `Cookie: session=JWT` but API expected `Cookie: auth_session=JWT`
  - **Solution:** Created `@webalive/shared` package as single source of truth for cookie names
  - **Files Changed:**
    - Created `packages/shared/` with COOKIE_NAMES constant
    - Updated `packages/tools/src/lib/api-client.ts` to import from shared package
    - Updated `apps/web/lib/auth/cookies.ts` to re-export from shared package
  - **Impact:** All workspace management tools now authenticate correctly
  - **Documentation:** See `docs/diagrams/mcp-tool-authentication-flow.md` for complete sequence diagram

### Added
- **[2025-11-21] Shared Constants Package** - New `@webalive/shared` package for constants used across monorepo
  - Exports: `COOKIE_NAMES`, `SESSION_MAX_AGE`, `ENV_VARS`
  - Prevents duplication and ensures consistency
  - Used by both `apps/web` and `packages/tools`

---

## Guidelines

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes
