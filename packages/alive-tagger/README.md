# @webalive/alive-tagger

Element selection and source tagging for Alive sandbox. Enables click-to-select UI elements with source file information, allowing Claude to know exactly which component and file the user is referring to.

## Features

- **JSX Source Tagging**: Attaches source file info (fileName, lineNumber, columnNumber) to every DOM element at build time
- **Element Selection**: Client script for Cmd/Ctrl+Click element selection with visual feedback
- **PostMessage Bridge**: Sends selected element context to parent frame for Claude integration

## Installation

```bash
# In your Vite React project
bun add @webalive/alive-tagger
```

## Usage

### Vite Plugin (Required)

Add the plugin to your `vite.config.ts`:

```typescript
import { aliveTagger } from "@webalive/alive-tagger"

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === "development" && aliveTagger()
  ].filter(Boolean),
}))
```

### Client Script (Optional - for iframe selection UI)

The client script provides Cmd/Ctrl+Click selection with visual feedback. It's automatically initialized when imported:

```typescript
// In your app entry point (only needed if in iframe)
import "@webalive/alive-tagger/client"
```

Or inject via HTML:

```html
<script type="module">
  import { initAliveTagger } from "@webalive/alive-tagger/client"
  initAliveTagger()
</script>
```

## How It Works

### 1. JSX Source Tagging (Vite Plugin)

The plugin intercepts React's `jsx-dev-runtime` and wraps the `jsxDEV` function to inject refs that store source information on DOM nodes:

```javascript
// Every DOM element gets this attached via Symbol:
element[Symbol.for("__aliveSource__")] = {
  fileName: "client/pages/Index.tsx",
  lineNumber: 42,
  columnNumber: 8,
  displayName: "Button"
}

// Global map for reverse lookups:
window.aliveSourceMap = Map<string, Set<WeakRef<Element>>>
```

### 2. Element Selection (Client Script)

When running in an iframe:

1. **Hold Cmd/Ctrl**: Activates selection mode, cursor becomes crosshair
2. **Hover**: Elements with source info get highlighted with green border and label showing `ComponentName · path/to/file.tsx:line`
3. **Click**: Captures element context and sends to parent frame via postMessage

### 3. PostMessage Communication

Selected element context is sent to the parent frame:

```typescript
window.parent.postMessage({
  type: "alive-element-selected",
  context: {
    fileName: "client/pages/Index.tsx",
    lineNumber: 42,
    columnNumber: 8,
    displayName: "Button",
    html: "<button class='...'>Click me</button>",
    tagName: "button",
    className: "btn-primary",
    id: "submit-btn",
    parentComponents: ["Form", "Page"]
  }
}, "*")
```

## API Reference

### Plugin Options

```typescript
interface AliveTaggerOptions {
  /** Enable source tagging (default: true in dev mode) */
  enabled?: boolean
  /** Enable debug logging */
  debug?: boolean
}

aliveTagger({ enabled: true, debug: false })
```

### Types

```typescript
import {
  SOURCE_KEY,                    // Symbol.for("__aliveSource__")
  ELEMENT_SELECTED_MESSAGE_TYPE, // "alive-element-selected"
  type SourceInfo,
  type ElementSelectedContext,
  type ElementSelectedMessage,
  type AliveTaggerOptions,
} from "@webalive/alive-tagger"
```

### Utility Functions

```typescript
import {
  getElementSource,      // Get source info from element
  hasSourceInfo,         // Check if element has source info
  formatSourceLocation,  // Format as "file.tsx:42:8"
  isElementSelectedMessage, // Type guard for messages
} from "@webalive/alive-tagger"

// Example usage
const source = getElementSource(document.querySelector("button"))
if (source) {
  console.log(formatSourceLocation(source)) // "client/pages/Index.tsx:42:8"
}
```

### Client Functions

```typescript
import { initAliveTagger } from "@webalive/alive-tagger/client"

// Initialize selector (auto-called on import, but can be manual)
const cleanup = initAliveTagger()

// Later: cleanup()
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Alive (terminal.alive.best)                                    │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │  Chat Interface      │  │  Sandbox Component                       │ │
│  │                      │  │  - Listens for 'alive-element-selected'  │ │
│  │  Shows selected      │◀─┤  - Displays source info to user          │ │
│  │  element context     │  │  - Injects into next Claude message      │ │
│  └──────────────────────┘  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                        ▲
                                        │ postMessage
┌─────────────────────────────────────────────────────────────────────────┐
│  User Site (in preview iframe)                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  alive-tagger plugin (Vite)                                       │  │
│  │  - Intercepts jsx-dev-runtime                                     │  │
│  │  - Attaches Symbol.for('__aliveSource__') to every DOM element    │  │
│  │  - Maintains window.aliveSourceMap for lookups                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  alive-tagger/client (optional)                                   │  │
│  │  - Handles Cmd/Ctrl+Click detection                               │  │
│  │  - Visual highlight on hover                                      │  │
│  │  - Posts context to parent frame                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Comparison: alive-tagger vs React Grab

| Feature | alive-tagger | React Grab |
|---------|-------------|------------|
| **Approach** | Vite plugin + client | Runtime fiber traversal |
| **Data attachment** | Build-time via refs | Runtime fiber inspection |
| **Symbol key** | `__aliveSource__` | `__jsxSource__` |
| **Selection UI** | Built-in (Cmd+Click) | Built-in |
| **Communication** | postMessage | HTTP localhost:4567 |
| **Env requirement** | None (dev mode auto) | None |
| **Designed for** | Alive iframe | Claude Code CLI |

## Integration with Alive

The alive-tagger is integrated with Alive's sandbox preview. When a user Cmd+Clicks an element:

1. **Sandbox receives postMessage**: `Sandbox.tsx` and `SandboxMobile.tsx` listen for `alive-element-selected` messages
2. **Context propagates via SandboxContext**: The selection is passed through `useSandboxContext()`
3. **Chat input auto-fills**: The selected element is formatted as `@ComponentName in src/path/file.tsx:lineNumber` and inserted into the chat input
4. **User can send to Claude**: The reference helps Claude understand exactly which element/component to modify

### Key files:
- `apps/web/features/chat/lib/sandbox-context.tsx` - Context with `setSelectedElement` and `registerElementSelectHandler`
- `apps/web/features/chat/components/Sandbox.tsx` - Listens for postMessage, calls `setSelectedElement`
- `apps/web/app/chat/page.tsx` - Registers handler to insert selection into chat input

### Caddy Configuration

For HMR to work properly in the sandbox iframe, the preview domain **must NOT** use `forward_auth`. The auth check interferes with WebSocket connections and causes the iframe to flash/reload every few seconds.

The site-controller at `packages/site-controller/scripts/05-caddy-inject.sh` generates preview domain configs WITHOUT `forward_auth` to avoid this issue.

## Development

```bash
# Build
bun run build

# Watch mode
bun run dev

# Type check
bun run type-check

# Run tests
bun run test
```

## Files

```
packages/alive-tagger/
├── src/
│   ├── index.ts      # Main exports (plugin + utilities)
│   ├── plugin.ts     # Vite plugin
│   ├── client.ts     # Client selection script
│   └── types.ts      # TypeScript types
├── dist/             # Built output
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## Security Considerations

1. **Development only**: Source tagging only active in dev mode
2. **No production impact**: Plugin does nothing in production builds
3. **File paths**: Relative paths exposed (not full system paths)
4. **node_modules filtered**: Library internals not tagged

## License

MIT
