# Manager Feature

The Manager feature provides a comprehensive dashboard for managing domains, organizations, feedback, and system settings.

## Directory Structure

```
features/manager/
├── components/              # Reusable UI components
│   ├── DomainsTable.tsx    # Domain listing and management
│   ├── FeedbackList.tsx    # User feedback display
│   ├── SettingsPanel.tsx   # System settings and actions
│   └── OrganizationsList.tsx # Organization management
├── lib/                     # Utilities and services
│   ├── services/           # API service layer (pure, testable)
│   │   ├── domainService.ts       # Domain operations
│   │   ├── orgService.ts          # Organization operations
│   │   ├── settingsService.ts     # Settings operations
│   │   └── index.ts               # Service barrel export
│   ├── utils/              # Reusable utilities
│   │   ├── executeHandler.ts      # Async handler wrapper
│   │   ├── domain-utils.ts        # Domain-related helpers
│   │   └── index.ts               # Utils barrel export
│   └── index.ts            # Main lib barrel export
├── page.tsx                # Manager page (page route)
├── hooks/                  # Custom React hooks
├── store/                  # State management (Zustand)
├── types/                  # TypeScript type definitions
└── __tests__/              # Test files
```

## Services

All API operations are abstracted into service functions for:
- **Testability**: Pure functions with no React dependencies
- **Reusability**: Can be used in different components
- **Maintainability**: Single source of truth for API contracts

### Available Services

**Domain Service** (`lib/services/domainService.ts`)
- `deleteDomain(domain)` - Delete a domain
- `checkPermissions(domain)` - Check domain permissions
- `fixPermissions(domain)` - Fix domain permission issues
- `fixPort(domain)` - Fix and restart domain service

**Organization Service** (`lib/services/orgService.ts`)
- `deleteOrg(orgId)` - Delete an organization
- `removeMember(orgId, userId)` - Remove org member
- `transferOwnership(orgId, newOwnerId)` - Transfer org ownership
- `updateOrgCredits(orgId, credits)` - Update credits
- `addOrgMember(orgId, userId, role)` - Add org member

**Settings Service** (`lib/services/settingsService.ts`)
- `checkServiceStatus()` - Check system service status
- `reloadCaddy()` - Reload reverse proxy
- `restartBridge()` - Restart Alive
- `backupWebsites()` - Backup all websites
- `cleanupTestData(preview)` - Clean test data

## Utilities

### executeHandler

Wrapper utility for consistent async handler patterns:

```typescript
await executeHandler({
  fn: () => domainService.deleteDomain(domain),
  onLoading: setDeleting,
  successMessage: "Domain deleted successfully",
  errorMessage: "Failed to delete domain",
  onSuccess: () => {
    // Update local state after success
    setDomains(prev => /* ... */)
  },
})
```

**Features:**
- Automatic loading state management
- Consistent error handling and logging
- Toast notifications (success/error)
- Optional onSuccess callback with result

## Imports

Use barrel exports for clean imports:

```typescript
// ✅ Good - use barrel exports
import { domainService, executeHandler } from "@/features/manager/lib"

// ❌ Avoid - direct imports
import * as domainService from "@/features/manager/lib/services/domainService"
```

## Components

UI components are presentational and located in `components/`:
- No business logic
- Props-driven data
- Event callbacks passed down from page

## Page

The main page (`page.tsx`) handles:
- State management for all manager data
- useEffect hooks for data fetching
- Tab switching logic
- Modal/dialog state
- Handler functions that orchestrate services and state updates

## Hook Rules

### Dependency Arrays
- ✅ Include all memoized callbacks (from useCallback)
- ✅ Exclude stable objects (like `domains` - use authenticated flag instead)
- ✅ Use stable references with useCallback

### Loading States
- Use `executeHandler` wrapper for consistency
- Each async operation gets its own loading state
- Loading states are local to the handler

## Adding New Features

1. **Add Service**
   - Create function in appropriate service file
   - Make it pure (no React dependencies)
   - Add TypeScript types for request/response

2. **Update Manager Page**
   - Add state for new data/loading
   - Create useEffect for fetching if needed
   - Create handler that uses executeHandler wrapper

3. **Add Component**
   - Create in components/ directory
   - Keep it presentational
   - Accept data and callbacks as props

4. **Update Tests**
   - Add tests for service functions
   - Mock API responses
   - Test handlers with React Testing Library

## Performance Optimizations

- All fetch functions memoized with useCallback
- Stable dependencies in useEffect hooks
- Polling interval only depends on authenticated flag
- Parallel status fetch with domain fetch
- No unnecessary re-renders from unstable object references
