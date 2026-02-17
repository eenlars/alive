---
name: Add a Database & Server
description: Turn your website into a full app with its own database. Save data, load data, and create your own server routes.
category: setup
complexity: 2
files: 4
dependencies:
  - better-sqlite3@^11.0.0
estimatedTime: 8-12 minutes
estimatedTokens: 85
tags: [backend, database, server, api, sqlite]
requires:
  - Vite 5+
  - Node 18+
previewImage: https://terminal.alive.best/_images/t/alive.best/o/3e51d4885e323647/v/orig.webp
enabled: true
---

# Vite API Plugin - Backend Server in Vite Dev Server

Add a full backend API to your Vite project without needing a separate server. This plugin runs API endpoints directly inside Vite's dev server using custom middleware, enabling full-stack development in a single process. Perfect for prototypes, small apps, or projects that need simple backend functionality without Express/Fastify complexity.

## Implementation Requirements

**For Claude (AI Assistant):**
- ✅ **Project-Aware:** Analyze existing code structure before starting (Step 0)
- ✅ **Non-Destructive:** Preserve all existing configuration and plugins
- ✅ **Typed:** Use proper TypeScript types throughout - no `any` types
- ✅ **Adaptive:** Match project's code style, indentation, quotes, and patterns
- ✅ **Verified:** Test each step and provide evidence that it works
- ✅ **Evidence-Based:** Show console output, API responses, or screenshots as proof

## Step-by-Step Implementation

### Step 0: Analyze Current Project (CRITICAL - DO THIS FIRST)

**For Claude (AI Assistant):** Before implementing anything, you MUST understand the current project structure. Use your Read tool to analyze these files:

**Required Analysis:**

1. **Read `vite.config.ts` or `vite.config.js`:**
   - Check current plugins array (don't overwrite existing plugins)
   - Note server configuration (port, host settings)
   - Check if using TypeScript or JavaScript
   - Identify existing path aliases (e.g., `@` mapping)
   - Preserve any custom configuration

2. **Read `package.json`:**
   - Check if `better-sqlite3` is already installed (skip installation if present)
   - Identify package manager: look for `packageManager` field or lockfile
   - Check existing scripts (don't overwrite `dev`, `build` commands)
   - Note project dependencies to understand tech stack

3. **Check project structure:**
   - Use Glob tool: `src/**/*.{ts,tsx,js,jsx}` to find source files
   - Identify if using `src/lib/`, `src/utils/`, or other patterns
   - Check if `src/pages/` or `src/app/` exists (routing pattern)
   - Look for existing API integration patterns

4. **Identify code style:**
   - Check existing files for quote style (single vs double)
   - Check indentation (tabs vs spaces, 2 vs 4 spaces)
   - Check import style (named vs default imports)
   - Match the project's existing patterns

**Verification Checklist:**
- [ ] Read vite.config file and noted current plugins
- [ ] Read package.json and identified package manager
- [ ] Checked project structure with Glob
- [ ] Identified code style from existing files
- [ ] Know where to place new files (lib/api.ts location)

**Output to user:** Briefly summarize what you found (adapt based on actual project):
```
Project Analysis Complete:
- Vite version and current plugins identified
- Package manager detected
- Source structure mapped
- Code style noted (TypeScript/JavaScript, indentation, quotes)
- Server port configuration found
- Ready to proceed with implementation
```

### Step 1: Install Dependencies

**For Claude (AI Assistant):**

**FIRST:** Check if dependencies already exist by reading package.json from Step 0.
- If `better-sqlite3` is already in dependencies, SKIP installation and inform user
- If not present, proceed with installation

Use the `install_package` tool:
```
install_package({ packageName: "better-sqlite3", version: "9.2.2" })
install_package({ packageName: "@types/better-sqlite3", version: "7.6.8", dev: true })
```

**For manual installation:**
Adapt the command based on package manager identified in Step 0:
```bash
# If bun (default)
bun add better-sqlite3@9.2.2
bun add -D @types/better-sqlite3@7.6.8

# If npm
npm install better-sqlite3@9.2.2
npm install -D @types/better-sqlite3@7.6.8

# If pnpm
pnpm add better-sqlite3@9.2.2
pnpm add -D @types/better-sqlite3@7.6.8
```

**Why these packages:**
- `better-sqlite3@9.2.2` - Fast, synchronous SQLite database (no async needed)
- `@types/better-sqlite3@7.6.8` - TypeScript types for better-sqlite3

**Peer dependencies** (should already be installed):
- `vite@^5.0.0` - Required for plugin system
- `react@^18.0.0` - For frontend components (if using React)

**Verification:**
- No installation errors in terminal
- `package.json` contains `better-sqlite3` in dependencies
- Types package in devDependencies (if using TypeScript)

**Optional check:** List installed packages to confirm versions

**Common Issues:**
- **Installation fails:** Check network connection, try clearing package cache
- **Native module build errors:** Ensure you have build tools installed (python, make, gcc)
- **Permission errors:** Don't use sudo with npm/pnpm, use bun if available
- **Already installed:** If package already exists, skip this step and continue

### Step 2: Create the Vite API Plugin

**For Claude (AI Assistant):** Adapt this code to match the project's style from Step 0 analysis:
- If project uses different indentation, adjust the code
- If project uses different quote style, adjust the code
- Keep the logic identical, only adjust formatting

Create `vite-plugin-api.js` in your project root (same level as `vite.config.ts`):

**File location:** `./vite-plugin-api.js` (project root, NOT in src/ folder)

**Note:** Plugin must be `.js` (not `.ts`) because Vite config imports it before TypeScript compilation.

```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function apiPlugin() {
  const dbPath = path.join(__dirname, 'api.db');
  const MAX_BODY_SIZE = 1024 * 100; // 100KB limit for security

  // Initialize SQLite database
  const db = new Database(dbPath);

  // Create example table
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert sample data if table is empty
  const count = db.prepare('SELECT COUNT(*) as count FROM items').get();
  if (count.count === 0) {
    const insert = db.prepare('INSERT INTO items (name, description) VALUES (?, ?)');
    insert.run('Example Item', 'This is a sample item');
  }

  // Helper function for consistent JSON responses
  const sendJson = (res, statusCode, data) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };

  return {
    name: 'vite-plugin-api',
    configureServer(server) {
      console.log('✅ API Plugin loaded - endpoints available at /api/*');

      // Health check endpoint
      server.middlewares.use('/api/health', (req, res, next) => {
        if (req.method === 'GET') {
          sendJson(res, 200, {
            status: 'ok',
            timestamp: new Date().toISOString()
          });
        } else {
          next();
        }
      });

      // Items API - GET all items
      server.middlewares.use('/api/items', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const items = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
            sendJson(res, 200, items);
          } catch (error) {
            console.error('Error fetching items:', error);
            sendJson(res, 500, { error: 'Failed to fetch items' });
          }
        } else if (req.method === 'POST') {
          // Handle POST request with body size limit
          let body = '';
          let sizeLimitExceeded = false;

          req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > MAX_BODY_SIZE) {
              sizeLimitExceeded = true;
              req.pause();
              sendJson(res, 413, { error: 'Request body too large' });
            }
          });

          req.on('end', () => {
            if (sizeLimitExceeded) return;

            try {
              const { name, description } = JSON.parse(body);

              // Enhanced validation
              if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return sendJson(res, 400, { error: 'Name is required and must be a non-empty string' });
              }

              if (name.length > 255) {
                return sendJson(res, 400, { error: 'Name must be less than 255 characters' });
              }

              // Trim whitespace from name
              const trimmedName = name.trim();

              // Insert into database
              const insert = db.prepare('INSERT INTO items (name, description) VALUES (?, ?)');
              const result = insert.run(trimmedName, description || null);

              // Return created item
              const newItem = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
              sendJson(res, 201, newItem);
            } catch (error) {
              console.error('Error creating item:', error);
              sendJson(res, 400, { error: 'Invalid request body' });
            }
          });
        } else if (req.method === 'DELETE') {
          // Handle DELETE request
          try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const idParam = url.searchParams.get('id');

            if (!idParam) {
              return sendJson(res, 400, { error: 'ID parameter is required' });
            }

            // Parse and validate ID
            const id = parseInt(idParam, 10);
            if (isNaN(id) || id < 1) {
              return sendJson(res, 400, { error: 'ID must be a positive integer' });
            }

            const deleteStmt = db.prepare('DELETE FROM items WHERE id = ?');
            const result = deleteStmt.run(id);

            if (result.changes === 0) {
              return sendJson(res, 404, { error: 'Item not found' });
            }

            sendJson(res, 200, { success: true, deleted: id });
          } catch (error) {
            console.error('Error deleting item:', error);
            sendJson(res, 500, { error: 'Failed to delete item' });
          }
        } else {
          next();
        }
      });
    }
  };
}
```

**Key Features Added:**
- ✅ **Body size limit (100KB)** - Prevents DoS attacks via large payloads
- ✅ **Enhanced validation** - Name must be non-empty, trimmed, and under 255 characters
- ✅ **ID validation** - DELETE endpoint validates ID is a positive integer
- ✅ **Helper function** - `sendJson()` for consistent JSON responses
- ✅ **Better error messages** - More specific validation errors

**Verification:**
- File exists in project root (same level as vite.config)
- No syntax errors when reading the file
- Code matches project's style (indentation, quotes) from Step 0

**Common Issues:**
- **File in wrong location:** Must be in project root, NOT in src/ or any subdirectory
- **Syntax errors:** Ensure all quotes and brackets are properly closed
- **Import errors:** Check that 'better-sqlite3' is correctly installed from Step 1

### Step 3: Register the Plugin in Vite Config

**For Claude (AI Assistant):** **CRITICAL - DO NOT OVERWRITE EXISTING CONFIG**

1. **Read the current vite.config file** (from Step 0)
2. **Preserve ALL existing settings:**
   - Keep all existing plugins in the plugins array
   - Keep existing server configuration (port, host, proxy, etc.)
   - Keep existing resolve aliases
   - Keep any other custom configuration
3. **Only add these two changes:**
   - Import line: `import apiPlugin from "./vite-plugin-api.js";`
   - Add `apiPlugin()` to the existing plugins array

**Example of correct update** (yours will look different based on Step 0):

```typescript
import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import apiPlugin from "./vite-plugin-api.js";  // ← ADD THIS LINE

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 3000,
  },
  plugins: [
    react(),
    apiPlugin()  // ← ADD THIS TO EXISTING PLUGINS ARRAY
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
```

**Important:** The above is just an example. Your actual config will have different plugins, different server settings, etc. Use the Edit tool to:
1. Add the import line at the top
2. Add `apiPlugin()` to the plugins array (don't remove other plugins!)

**Verification Steps:**

1. **After editing, read the file back** to verify changes are correct
2. **Restart the dev server** (stop and start it again)
3. **Look for confirmation** that the API plugin loaded successfully in the console
4. **Test health endpoint** (adapt port from Step 0):
```bash
curl http://localhost:PORT/api/health
# Expected: JSON response with status and timestamp
```

5. **Check for errors:**
   - No console errors about missing imports
   - No TypeScript errors in IDE
   - Server starts successfully

**Common Issues:**
- **Plugin not loading:** Check the import path in vite.config - must be `./vite-plugin-api.js` (relative path)
- **Module not found:** Ensure the plugin file is in project root, not in src/
- **Changes not applied:** Make sure you restarted the server (stop and start, not just refresh browser)

### Step 4: Create API Helper Functions (Frontend)

**For Claude (AI Assistant):**
- **Check Step 0 analysis** for the correct location (could be `src/lib/`, `src/utils/`, or other)
- **Match project's TypeScript style** (interfaces vs types, naming conventions)
- **Use proper TypeScript types** - no `any`, ensure all functions are fully typed
- If project doesn't have a `lib/` directory, create it or use the appropriate location

Create `src/lib/api.ts` (or adapt path based on project structure):

```typescript
export interface Item {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ApiError {
  error: string;
}

const API_BASE = '/api';

/**
 * Fetch all items from the API
 */
export async function getItems(): Promise<Item[]> {
  try {
    const response = await fetch(`${API_BASE}/items`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch items:', error);
    return [];
  }
}

/**
 * Create a new item
 */
export async function createItem(name: string, description?: string): Promise<Item | null> {
  try {
    const response = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, description }),
    });

    if (!response.ok) {
      let errorMsg = 'Failed to create item';
      try {
        const error: ApiError = await response.json();
        errorMsg = error.error || errorMsg;
      } catch {
        // If JSON parsing fails, use status text
        errorMsg = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to create item:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Delete an item by ID
 */
export async function deleteItem(id: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/items?id=${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete item');
    }

    return true;
  } catch (error) {
    console.error('Failed to delete item:', error);
    return false;
  }
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<{ status: string; timestamp: string } | null> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    return null;
  }
}
```

**Key Improvements:**
- ✅ **Better error extraction** - Tries to parse JSON error, falls back to status text
- ✅ **Type-safe error logging** - Uses `instanceof Error` check before accessing `.message`
- ✅ **Graceful error handling** - Returns null instead of throwing, preventing crashes

**Verification:**
- No TypeScript errors in IDE
- File created in correct location based on Step 0 analysis
- All functions properly typed (no `any` types)

**Optional test** in browser console:
```javascript
import { checkHealth } from '@/lib/api';
await checkHealth(); // Should return object with status and timestamp
```

### Step 5: Use the API in Your Components

**For Claude (AI Assistant):**
- **Adapt the example** to fit the project's routing structure (could be `src/pages/`, `src/app/`, or other)
- **Match project's component style** (function syntax, export style, etc.)
- **Ensure full TypeScript typing** - properly type state, props, event handlers
- **Use project's existing patterns** for styling (Tailwind classes, CSS modules, etc.)
- If project uses a different UI framework or no framework, adapt accordingly

Example usage in `src/pages/Index.tsx` (adapt path and styling based on your project):

```tsx
import { useEffect, useState } from 'react';
import { getItems, createItem, deleteItem, type Item } from '@/lib/api';

const Index = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Load items on mount
  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    const data = await getItems();
    setItems(data);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      setError('Please enter an item name');
      return;
    }

    setSubmitting(true);
    setError(null);
    const newItem = await createItem(newItemName);

    if (newItem) {
      setItems([newItem, ...items]);
      setNewItemName('');
      setError(null);
    } else {
      setError('Failed to create item. Please try again.');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    const success = await deleteItem(id);

    if (success) {
      setItems(items.filter(item => item.id !== id));
      setError(null);
    } else {
      setError('Failed to delete item. Please try again.');
    }
    setDeletingId(null);
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Items Manager</h1>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {error}
          </div>
        )}

        {/* Create Form */}
        <form onSubmit={handleCreate} className="mb-8 flex gap-2">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="New item name..."
            disabled={submitting}
            className="flex-1 px-4 py-2 border rounded-lg disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Adding...' : 'Add Item'}
          </button>
        </form>

        {/* Items List */}
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-gray-500">No items yet. Create one above!</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center"
              >
                <div>
                  <h3 className="font-semibold">{item.name}</h3>
                  {item.description && (
                    <p className="text-sm text-gray-600">{item.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded disabled:text-red-300 disabled:cursor-not-allowed transition-colors"
                >
                  {deletingId === item.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
```

**Key UX Improvements:**
- ✅ **Error banner** - Shows user-friendly error messages at the top
- ✅ **Loading states** - `submitting` and `deletingId` prevent double-clicks
- ✅ **Disabled states** - Inputs and buttons disabled during operations
- ✅ **Visual feedback** - "Adding..." and "Deleting..." text during operations
- ✅ **Input validation** - Shows error if user tries to submit empty name
- ✅ **Error clearing** - Errors automatically clear on next successful operation

**Success criteria:**

1. **Restart the dev server** to apply changes
2. **Navigate to the page** in browser (use port from Step 0 analysis)
3. **Verify functionality:**
   - Page loads without errors
   - UI renders correctly (adapted to your project's style)
   - Sample item appears in the list
   - Can add new items via form (list updates)
   - Can delete items (list updates)
   - No TypeScript errors in IDE or console

**Console verification:**
- Look for confirmation that API plugin loaded
- API requests show successful status codes (200, 201)
- No 404 errors for `/api/*` endpoints

**For Claude:** After implementation:
1. TEST the functionality manually
2. Describe what you see in the browser
3. Show evidence it works (paste console output showing successful API calls)
4. If errors occur, troubleshoot using the tips below

**Common Issues:**
- **404 on /api/items:** Plugin not loaded - check vite.config import and restart server
- **Items don't appear:** Check browser console for fetch errors, verify API endpoint works with curl
- **TypeScript errors:** Ensure all types are properly imported from '@/lib/api'
- **CORS errors:** Should not occur (same origin), but if it does, check Vite proxy config

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────┐
│   Vite Dev Server (port 3000)           │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  Static File Server                │ │
│  │  (HTML, JS, CSS)                   │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  API Plugin Middleware             │ │
│  │  ├─ /api/health                    │ │
│  │  ├─ /api/items (GET/POST/DELETE)   │ │
│  │  └─ SQLite Database (api.db)       │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### How Vite Plugins Work

1. **Plugin Registration**: Vite loads your plugin via `plugins: [apiPlugin()]` in config
2. **configureServer Hook**: Your plugin gets access to Vite's internal server
3. **Middleware Injection**: You add custom middleware using `server.middlewares.use()`
4. **Request Routing**: When a request comes in, middleware checks if it matches `/api/*`
5. **Response Handling**: If matched, your handler runs; otherwise, request passes through

### Request Flow Example (POST /api/items)

```
1. Browser: fetch('/api/items', { method: 'POST', body: {...} })
2. Vite Server receives request at port 3000
3. Middleware checks: Does path === '/api/items'? YES
4. Middleware checks: Is method === 'POST'? YES
5. Read request body chunks: req.on('data', ...)
6. Parse JSON: JSON.parse(body)
7. Validate: Is name present and string?
8. Execute SQL: db.prepare('INSERT...').run(name, description)
9. Query new row: db.prepare('SELECT...').get(lastInsertRowid)
10. Send response: res.end(JSON.stringify(newItem))
11. Browser receives JSON response
```

### Why This Approach?

✅ **Single Process**: No need for separate backend server
✅ **Zero Config**: No Express/Fastify/Hono setup needed
✅ **Hot Reload**: Frontend HMR still works
✅ **Type Safety**: Share types between frontend and backend
✅ **Fast Development**: Instant backend changes
✅ **Production Ready**: Can migrate to standalone server later

### Database Choice: SQLite

- **Synchronous API**: No async/await needed (simpler code)
- **File-based**: Single `api.db` file, easy backup
- **Zero Setup**: No database server to install
- **Fast**: Excellent for <100k records
- **ACID Compliant**: Safe transactions

### Performance Characteristics

**Request Speed:**
- Health check: ~1-2ms
- Simple SELECT: ~2-5ms
- INSERT with index: ~5-10ms
- Complex queries: ~10-50ms

**Optimizations Applied:**
- Prepared statements (compiled once, reused)
- Synchronous I/O (no async overhead)
- In-process database (no network latency)
- Automatic query optimization by SQLite

**Limitations:**
- Single writer at a time (readers unlimited)
- File locks can cause issues with multiple processes
- Not suitable for >100 concurrent users
- Maximum database size: 281 TB (practically unlimited)

**When to migrate:**
- Concurrent writes needed (use PostgreSQL)
- Millions of records (use PostgreSQL/MySQL)
- Geographic distribution (use cloud database)
- Real-time sync required (use Firebase/Supabase)

## Customization Examples

### Add a New API Endpoint

Add this to your `vite-plugin-api.js` inside `configureServer()`:

```javascript
// Users API
server.middlewares.use('/api/users', (req, res, next) => {
  if (req.method === 'GET') {
    const users = db.prepare('SELECT * FROM users').all();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(users));
  } else {
    next();
  }
});
```

Don't forget to create the table in the initialization section!

### Add Request Logging

```javascript
server.middlewares.use('/api/*', (req, res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});
```

### Add CORS Headers (for external requests)

```javascript
server.middlewares.use('/api/*', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  next();
});
```

### Use JSON File Instead of Database

Replace the database code with:

```javascript
const dataPath = path.join(__dirname, 'data.json');

const readData = () => {
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch {
    return { items: [] };
  }
};

const writeData = (data) => {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
};

// In your endpoint:
if (req.method === 'GET') {
  const data = readData();
  res.end(JSON.stringify(data.items));
}
```

### Add Authentication

```javascript
const AUTH_TOKEN = 'your-secret-token';

server.middlewares.use('/api/*', (req, res, next) => {
  // Skip auth for health check
  if (req.url === '/api/health') return next();

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token !== AUTH_TOKEN) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  next();
});
```

## Important Notes

### ⚠️ Development Only Pattern

**This plugin runs in Vite's DEV server.** For production:

1. **Build static frontend**: `vite build` creates `dist/`
2. **Migrate API**: Move API to standalone server (Express/Fastify/Hono)
3. **OR**: Use serverless functions (Vercel/Netlify/Cloudflare)
4. **OR**: Use this pattern with `vite preview` (not recommended for production)

### ⚠️ File Locations Matter

- Plugin file: `vite-plugin-api.js` (root, same level as `vite.config.ts`)
- Database file: `api.db` (created automatically in root)
- Frontend helpers: `src/lib/api.ts`

### ⚠️ SQLite Concurrency

SQLite handles multiple readers but **one writer at a time**. For high-traffic apps:
- Use PostgreSQL/MySQL instead
- Or use connection pooling
- Or migrate to dedicated backend

### ⚠️ Error Handling is Critical

Always wrap database operations in try-catch:
```javascript
try {
  const result = db.prepare('SELECT...').all();
  res.end(JSON.stringify(result));
} catch (error) {
  console.error(error);
  res.statusCode = 500;
  res.end(JSON.stringify({ error: 'Internal server error' }));
}
```

### ⚠️ Request Body Streaming

Node.js middleware doesn't buffer request bodies automatically:
```javascript
let body = '';
req.on('data', chunk => {
  body += chunk.toString();
});
req.on('end', () => {
  // Now you can use body
});
```

## Best Practices

### 1. **Input Validation & Security**

Always validate before database operations:
```javascript
// Check type, emptiness, and length
if (!name || typeof name !== 'string' || name.trim().length === 0) {
  return sendJson(res, 400, { error: 'Name is required and must be a non-empty string' });
}

if (name.length > 255) {
  return sendJson(res, 400, { error: 'Name must be less than 255 characters' });
}

// Always trim user input
const trimmedName = name.trim();
```

**Security measures included in template:**
- ✅ Body size limit (100KB) prevents DoS attacks
- ✅ Whitespace trimming prevents accidental empty entries
- ✅ Length validation prevents database overflow
- ✅ Type checking prevents injection attempts
- ✅ ID validation ensures positive integers only

### 2. **Prepared Statements**

Use prepared statements to prevent SQL injection:
```javascript
// ✅ GOOD (safe)
const stmt = db.prepare('SELECT * FROM items WHERE id = ?');
stmt.get(userId);

// ❌ BAD (SQL injection risk)
db.exec(`SELECT * FROM items WHERE id = ${userId}`);
```

### 3. **HTTP Status Codes**

Use proper status codes:
- `200` - Success (GET, DELETE)
- `201` - Created (POST)
- `400` - Bad Request (validation error)
- `401` - Unauthorized (auth failed)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error (unexpected error)

### 4. **Consistent Response Format**

```javascript
// Success
{ "data": [...], "success": true }

// Error
{ "error": "Error message", "success": false }
```

### 5. **Database Indexes**

For better performance on queries:
```javascript
db.exec(`
  CREATE TABLE items (...);
  CREATE INDEX idx_items_created_at ON items(created_at);
  CREATE INDEX idx_items_name ON items(name);
`);
```

### 6. **Separate Plugin File**

Keep plugin in separate `.js` file (not `.ts`) because:
- Vite config needs to import it before TypeScript compilation
- ESM compatibility is simpler
- Can be reused across projects

### 7. **Environment Variables**

Don't hardcode secrets:
```javascript
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'api.db');
```

## Known Limitations & Future Improvements

### Current Limitations

1. **Development-focused**: Plugin runs in dev server, requires migration for production
2. **SQLite constraints**: Single writer, not ideal for high concurrency
3. **No built-in auth**: Authentication needs to be added manually
4. **File-based storage**: Database file can grow unbounded without cleanup
5. **No request validation library**: Manual validation only
6. **No rate limiting**: Endpoints can be spammed
7. **No request logging**: Manual console.log only

### Future Improvements

**v1.1.0 (Planned):**
- Add request/response logging middleware
- Include rate limiting example
- Add Zod schema validation
- Include database migration system

**v2.0.0 (Planned):**
- Support for multiple databases (PostgreSQL, MySQL)
- Built-in authentication patterns
- WebSocket support
- File upload handling
- Caching layer (Redis example)

**Community Contributions Welcome:**
- GraphQL endpoint example
- tRPC integration
- Prisma ORM integration
- Connection pooling for production

### Recommended Additions

If using in production-like scenarios, add:
1. **Helmet.js** - Security headers
2. **express-rate-limit** - Rate limiting
3. **Winston** - Structured logging
4. **Joi/Zod** - Schema validation
5. **passport.js** - Authentication
6. **node-cache** - In-memory caching

## Conflicting Patterns

### ⚠️ Incompatible Setups

**This template will NOT work with:**

1. **Vite in library mode** (`build.lib` configured)
   - Reason: Library mode doesn't run dev server
   - Alternative: Use standalone Express server

2. **Static site generation (SSG) only**
   - Reason: No server-side runtime
   - Alternative: Use serverless functions

3. **Cloudflare Pages (without Functions)**
   - Reason: No Node.js runtime
   - Alternative: Use Cloudflare Workers with D1

4. **Multiple Vite instances on same port**
   - Reason: Port conflicts, database locking
   - Alternative: Use different ports per instance

5. **Vite config in strict ESM + plugin in CommonJS**
   - Reason: Module system mismatch
   - Alternative: Keep plugin as ESM (.js not .cjs)

### ⚠️ Migration Conflicts

**If you have existing:**

1. **Backend on different port** (e.g., Express on 4000)
   - Issue: API calls need proxy configuration
   - Solution: Update vite.config.ts proxy settings

2. **Different SQLite library** (e.g., sqlite, sqlite3)
   - Issue: API differences, no prepared statements
   - Solution: Uninstall old library, follow Step 1

3. **API routes in separate server directory**
   - Issue: Duplicate endpoints, conflicts
   - Solution: Migrate endpoints one by one, test thoroughly

4. **Global middleware** (e.g., body-parser, cors)
   - Issue: May interfere with Vite's middleware chain
   - Solution: Apply middleware only to /api/* routes

## Common Troubleshooting

### Error: "Cannot find module 'better-sqlite3'"

**Solution**: Install the package:
```bash
bun add better-sqlite3
```

### Error: "Database is locked"

**Cause**: Multiple processes trying to write simultaneously

**Solution**:
- Only run one dev server at a time
- Close all terminal tabs running `bun run dev`
- Delete `api.db` and restart

### Error: "res.end is not a function"

**Cause**: Called `next()` before `res.end()`

**Solution**: Return after sending response:
```javascript
res.end(JSON.stringify(data));
return; // Important!
```

### Plugin not loading / API returns 404

**Checklist**:
1. Is plugin imported in `vite.config.ts`? ✓
2. Is plugin added to `plugins: []` array? ✓
3. Is plugin file named correctly? ✓
4. Did you restart dev server after adding plugin? ✓

**Try**: Stop server and run `bun run dev` again

### Database file not created

**Check**: File permissions in project directory
```bash
ls -la api.db
```

If missing, manually create:
```bash
touch api.db
chmod 644 api.db
```

### JSON parsing fails on POST

**Check request headers**:
```javascript
req.on('end', () => {
  console.log('Raw body:', body); // Debug
  try {
    const data = JSON.parse(body);
    // ...
  } catch (error) {
    console.error('JSON parse error:', error);
  }
});
```

**Common causes**:
- Client not sending `Content-Type: application/json`
- Body is empty (check if data is actually sent)
- Body contains invalid JSON

### CORS errors in browser console

**Solution**: Add CORS headers (see Customization section above)

Or disable CORS in Vite config:
```typescript
export default defineConfig({
  server: {
    cors: true
  }
})
```

### Changes not reflecting

1. Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. Clear browser cache
3. Check if HMR is working (look for Vite connected message)
4. Restart dev server

## Testing Your API

### Manual Testing Checklist

**Basic Functionality:**
- [ ] Health endpoint returns 200 OK
- [ ] GET /api/items returns array
- [ ] POST /api/items creates new item
- [ ] DELETE /api/items?id=X removes item
- [ ] Browser console shows no errors

**Expected Outputs:**

1. **GET /api/health**
```json
{
  "status": "ok",
  "timestamp": "2025-11-09T16:30:00.000Z"
}
```

2. **GET /api/items** (fresh database)
```json
[
  {
    "id": 1,
    "name": "Example Item",
    "description": "This is a sample item",
    "created_at": "2025-11-09 16:00:00"
  }
]
```

3. **POST /api/items** (success)
```json
{
  "id": 2,
  "name": "New Item",
  "description": "Test description",
  "created_at": "2025-11-09 16:01:00"
}
```

4. **POST /api/items** (validation error - empty name)
```json
{
  "error": "Name is required and must be a non-empty string"
}
```

**POST /api/items** (validation error - name too long)
```json
{
  "error": "Name must be less than 255 characters"
}
```

**POST /api/items** (validation error - body too large)
```json
{
  "error": "Request body too large"
}
```

5. **DELETE /api/items?id=1** (success)
```json
{
  "success": true,
  "deleted": 1
}
```

6. **DELETE /api/items?id=999** (not found)
```json
{
  "error": "Item not found"
}
```

### Edge Cases Testing

**1. Empty/Invalid Data:**
```bash
# Empty name
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":""}'
# Expected: 400 Bad Request - "Name is required and must be a non-empty string"

# Whitespace-only name
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"   "}'
# Expected: 400 Bad Request - "Name is required and must be a non-empty string"

# Missing name
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"description":"Only description"}'
# Expected: 400 Bad Request

# Name too long (>255 characters)
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$(printf 'A%.0s' {1..300})\"}"
# Expected: 400 Bad Request - "Name must be less than 255 characters"

# Invalid JSON
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{invalid json}'
# Expected: 400 Bad Request

# Body too large (>100KB)
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"test\",\"description\":\"$(printf 'A%.0s' {1..110000})\"}"
# Expected: 413 Payload Too Large - "Request body too large"
```

**2. SQL Injection Attempts:**
```bash
# Try SQL injection (should be blocked by prepared statements)
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"'; DROP TABLE items; --"}'
# Expected: Creates item with that literal name, table NOT dropped
```

**3. Large Datasets:**
```bash
# Create 100 items
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/items \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Item $i\"}" &
done
wait

# Verify all created
curl http://localhost:3000/api/items | jq '. | length'
# Expected: ~100 items (some may fail due to concurrent writes)
```

**4. Special Characters:**
```bash
# Unicode, emoji, special chars
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Test 测试 🚀 <script>alert(1)</script>"}'
# Expected: 201 Created (all characters preserved)
```

**5. Network Failures:**
```javascript
// Simulate network error
navigator.onLine = false;
await createItem('Test');
// Expected: Console error, returns null
```

### Using curl

```bash
# Health check
curl http://localhost:3000/api/health

# Get all items
curl http://localhost:3000/api/items

# Create item
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Item","description":"From curl"}'

# Delete item
curl -X DELETE "http://localhost:3000/api/items?id=1"

# Pretty print with jq
curl -s http://localhost:3000/api/items | jq '.'
```

### Using Browser DevTools

```javascript
// In browser console:

// GET
fetch('/api/items').then(r => r.json()).then(console.log);

// POST
fetch('/api/items', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Test', description: 'Hello' })
}).then(r => r.json()).then(console.log);

// DELETE
fetch('/api/items?id=1', { method: 'DELETE' })
  .then(r => r.json()).then(console.log);

// Test error handling
fetch('/api/items', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '' }) // Invalid
}).then(r => r.json()).then(console.log);
// Expected: {error: "Name is required and must be a non-empty string"}
```

### Visual Verification

**What you should see in the browser:**

1. **On page load:**
   - Clean UI with "Items Manager" header
   - One sample item displayed
   - Input field and "Add Item" button
   - No console errors
   - No error banner visible

2. **After adding an item:**
   - Button text changes to "Adding..." during submission
   - Input field becomes disabled during submission
   - New item appears at the top of the list
   - Input field clears automatically
   - Button returns to "Add Item"
   - No page refresh (SPA behavior)
   - Console shows: `POST /api/items 201`

3. **After trying to add empty item:**
   - Red error banner appears at top: "Please enter an item name"
   - Input remains focused
   - No API call made (client-side validation)

4. **After deleting an item:**
   - Delete button text changes to "Deleting..." for that specific item
   - Button becomes disabled during deletion
   - Item removed from list immediately
   - List re-renders without that item
   - Console shows: `DELETE /api/items?id=X 200`

5. **Error handling:**
   - If API call fails, error banner shows: "Failed to create/delete item. Please try again."
   - Error banner disappears on next successful operation
   - User can retry the operation

6. **Network tab verification:**
   - Requests to `/api/items` show 200/201 status
   - Response previews show JSON data
   - Request payloads show correct JSON structure
   - Validation errors return 400 status with error messages

## Migration Path to Production

### Option 1: Standalone Express Server

Create `server.js`:
```javascript
import express from 'express';
import Database from 'better-sqlite3';

const app = express();
const db = new Database('api.db');

app.use(express.json());
app.use(express.static('dist')); // Serve Vite build

app.get('/api/items', (req, res) => {
  const items = db.prepare('SELECT * FROM items').all();
  res.json(items);
});

// ... other endpoints

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Option 2: Serverless Functions

Split each endpoint into separate files:
```
api/
├── items.js        // GET /api/items
├── create-item.js  // POST /api/items
└── delete-item.js  // DELETE /api/items
```

Deploy to Vercel/Netlify/Cloudflare Workers.

### Option 3: Keep Plugin for SSR

If using Vite SSR mode, this plugin works in production with `vite preview`.

## Summary

You now have:
- ✅ Full backend API running inside Vite dev server
- ✅ SQLite database with CRUD operations
- ✅ Type-safe frontend API helpers
- ✅ Complete error handling and validation
- ✅ Example component using the API
- ✅ **Security features**: Body size limits, input validation, ID sanitization
- ✅ **Enhanced UX**: Loading states, error banners, disabled states
- ✅ **Production-ready code**: Better error handling, type safety, user feedback

**What's included for security:**
- Request body size limit (100KB) prevents DoS attacks
- Input trimming and validation prevents empty/malformed data
- ID validation ensures only positive integers accepted
- Prepared statements prevent SQL injection
- Consistent error responses with proper HTTP status codes

**What's included for UX:**
- Error banner shows user-friendly messages
- Loading states prevent double-clicks
- Disabled states during operations
- Visual feedback ("Adding...", "Deleting...")
- Automatic error clearing on success

**Next steps:**
1. Add more endpoints for your features
2. Expand database schema
3. Add authentication if needed
4. Plan migration strategy for production

Ready to build your full-stack Vite app!
