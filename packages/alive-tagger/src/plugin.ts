/**
 * Alive Tagger Vite Plugin
 *
 * Intercepts React's jsx-dev-runtime to inject source tracking into every element.
 * This enables click-to-select functionality in the Alive sandbox.
 */

import type { Plugin, ResolvedConfig } from "vite"
import type { AliveTaggerOptions } from "./types"

// Client script for element selection UI (Cmd+Click)
// This is injected into the page automatically
const CLIENT_SCRIPT = `
<script type="module">
(function() {
  // Don't run if not in iframe (not in sandbox)
  if (window.parent === window) return;

  // Check if already initialized
  if (window.__aliveTaggerInitialized) return;
  window.__aliveTaggerInitialized = true;

  // Brand colors
  var COLORS = {
    primary: "#d239c0",
    primaryMuted: "rgba(210, 57, 192, 0.4)",
    primaryBg: "rgba(210, 57, 192, 0.08)",
    success: "#10b981",
    labelBg: "#1a1a1a",
    labelText: "#ffffff",
    labelMuted: "#a0a0a0"
  };

  // CSS styles
  var style = document.createElement("style");
  style.id = "alive-tagger-styles";
  style.textContent = [
    "@keyframes alive-tagger-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }",
    "@keyframes alive-tagger-flash { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.02); opacity: 0.9; } 100% { transform: scale(1); opacity: 1; } }",
    "#alive-tagger-overlay { position: fixed; pointer-events: none; z-index: 2147483646; border: 2px solid " + COLORS.primary + "; border-radius: 4px; background: " + COLORS.primaryBg + "; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); display: none; will-change: transform, width, height; box-shadow: 0 0 0 1px " + COLORS.primaryMuted + "; }",
    "#alive-tagger-overlay.flash { animation: alive-tagger-flash 0.3s ease-out; border-color: " + COLORS.success + "; background: rgba(16, 185, 129, 0.15); box-shadow: 0 0 20px rgba(16, 185, 129, 0.3); }",
    "#alive-tagger-label { position: fixed; pointer-events: none; z-index: 2147483647; display: none; font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 1.4; filter: drop-shadow(0px 2px 8px rgba(0, 0, 0, 0.3)); }",
    "#alive-tagger-label-inner { background: " + COLORS.labelBg + "; color: " + COLORS.labelText + "; padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1); max-width: 400px; backdrop-filter: blur(8px); }",
    "#alive-tagger-label-arrow { position: absolute; left: 12px; bottom: -6px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid " + COLORS.labelBg + "; }",
    "#alive-tagger-label .component-name { color: " + COLORS.primary + "; font-weight: 600; }",
    "#alive-tagger-label .file-path { color: " + COLORS.labelMuted + "; margin-left: 6px; }",
    "#alive-tagger-label .line-number { color: " + COLORS.labelText + "; opacity: 0.7; }",
    "#alive-tagger-crosshair-h, #alive-tagger-crosshair-v { position: fixed; pointer-events: none; z-index: 2147483645; background: " + COLORS.primary + "; opacity: 0.3; display: none; }",
    "#alive-tagger-crosshair-h { height: 1px; left: 0; right: 0; }",
    "#alive-tagger-crosshair-v { width: 1px; top: 0; bottom: 0; }",
    "#alive-tagger-coords { position: fixed; pointer-events: none; z-index: 2147483647; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; color: " + COLORS.labelMuted + "; background: " + COLORS.labelBg + "; padding: 2px 6px; border-radius: 3px; display: none; opacity: 0.8; }",
    "body.alive-tagger-active { cursor: crosshair !important; }",
    "body.alive-tagger-active * { cursor: crosshair !important; }"
  ].join("\\n");
  document.head.appendChild(style);

  // Create UI elements
  var overlay = document.createElement("div");
  overlay.id = "alive-tagger-overlay";
  var label = document.createElement("div");
  label.id = "alive-tagger-label";
  label.innerHTML = '<div id="alive-tagger-label-inner"><span class="component-name"></span><span class="file-path"></span><span class="line-number"></span></div><div id="alive-tagger-label-arrow"></div>';
  var crosshairH = document.createElement("div");
  crosshairH.id = "alive-tagger-crosshair-h";
  var crosshairV = document.createElement("div");
  crosshairV.id = "alive-tagger-crosshair-v";
  var coords = document.createElement("div");
  coords.id = "alive-tagger-coords";
  document.body.appendChild(overlay);
  document.body.appendChild(label);
  document.body.appendChild(crosshairH);
  document.body.appendChild(crosshairV);
  document.body.appendChild(coords);

  var SOURCE_KEY = Symbol.for("__aliveSource__");
  var isActive = false;
  var hoveredElement = null;

  function getSourceInfo(element) {
    var current = element;
    var depth = 0;
    while (current && depth < 10) {
      var source = current[SOURCE_KEY];
      if (source) return source;
      current = current.parentElement;
      depth++;
    }
    return null;
  }

  function getParentComponents(element, maxDepth) {
    maxDepth = maxDepth || 5;
    var components = [];
    var current = element.parentElement;
    var depth = 0;
    while (current && depth < maxDepth) {
      var source = current[SOURCE_KEY];
      if (source && source.displayName) {
        var name = source.displayName;
        if (name[0] === name[0].toUpperCase() && !/^[a-z]+$/.test(name)) {
          components.push(name);
        }
      }
      current = current.parentElement;
      depth++;
    }
    return components;
  }

  function showUI(element, mouseX, mouseY) {
    var rect = element.getBoundingClientRect();
    var source = getSourceInfo(element);
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.style.display = "block";
    overlay.classList.remove("flash");
    crosshairH.style.top = mouseY + "px";
    crosshairH.style.display = "block";
    crosshairV.style.left = mouseX + "px";
    crosshairV.style.display = "block";
    coords.textContent = Math.round(mouseX) + ", " + Math.round(mouseY);
    coords.style.left = (mouseX + 15) + "px";
    coords.style.top = (mouseY + 15) + "px";
    coords.style.display = "block";
    if (source) {
      label.querySelector(".component-name").textContent = source.displayName;
      label.querySelector(".file-path").textContent = source.fileName;
      label.querySelector(".line-number").textContent = ":" + source.lineNumber;
      var labelTop = Math.max(8, rect.top - 40);
      label.style.left = Math.max(8, rect.left) + "px";
      label.style.top = labelTop + "px";
      label.style.display = "block";
    } else {
      label.style.display = "none";
    }
  }

  function hideUI() {
    overlay.style.display = "none";
    label.style.display = "none";
    crosshairH.style.display = "none";
    crosshairV.style.display = "none";
    coords.style.display = "none";
  }

  function flashUI() {
    overlay.classList.add("flash");
    setTimeout(function() { overlay.classList.remove("flash"); }, 300);
  }

  function sendToParent(element, source) {
    var context = {
      fileName: source.fileName,
      lineNumber: source.lineNumber,
      columnNumber: source.columnNumber,
      displayName: source.displayName,
      html: element.outerHTML.slice(0, 500),
      tagName: element.tagName.toLowerCase(),
      className: element.className || "",
      id: element.id || "",
      parentComponents: getParentComponents(element)
    };
    window.parent.postMessage({ type: "alive-element-selected", context: context }, "*");
    console.log("[alive-tagger] Selected:", context.displayName, "at", context.fileName + ":" + context.lineNumber);
  }

  document.addEventListener("keydown", function(e) {
    if ((e.metaKey || e.ctrlKey) && !isActive) {
      isActive = true;
      document.body.classList.add("alive-tagger-active");
    }
  }, true);

  document.addEventListener("keyup", function(e) {
    if (!e.metaKey && !e.ctrlKey && isActive) {
      isActive = false;
      document.body.classList.remove("alive-tagger-active");
      hideUI();
      hoveredElement = null;
    }
  }, true);

  document.addEventListener("mousemove", function(e) {
    if (!isActive) return;
    var target = e.target;
    if (hoveredElement === target) {
      crosshairH.style.top = e.clientY + "px";
      crosshairV.style.left = e.clientX + "px";
      coords.textContent = Math.round(e.clientX) + ", " + Math.round(e.clientY);
      coords.style.left = (e.clientX + 15) + "px";
      coords.style.top = (e.clientY + 15) + "px";
      return;
    }
    var source = getSourceInfo(target);
    if (source) {
      hoveredElement = target;
      showUI(target, e.clientX, e.clientY);
    } else {
      hoveredElement = null;
      hideUI();
    }
  }, true);

  document.addEventListener("click", function(e) {
    if (!isActive) return;
    var target = e.target;
    var source = getSourceInfo(target);
    if (source) {
      e.preventDefault();
      e.stopPropagation();
      flashUI();
      sendToParent(target, source);
    }
  }, true);

  window.addEventListener("blur", function() {
    isActive = false;
    document.body.classList.remove("alive-tagger-active");
    hideUI();
    hoveredElement = null;
  });

  // Listen for activation message from parent (button click)
  window.addEventListener("message", function(e) {
    if (e.data?.type === "alive-tagger-activate") {
      isActive = true;
      document.body.classList.add("alive-tagger-active");
      console.log("[alive-tagger] Activated via button");
    }
  });

  console.log("[alive-tagger] Ready! Hold Cmd/Ctrl or click the select button to select elements.");
})();
</script>
`

// The JSX dev runtime code as a string (will be bundled inline)
// We use React.createElement instead of jsxDEV because Vite pre-bundles
// react/jsx-dev-runtime in production mode where jsxDEV is undefined.
// React.createElement works in both modes and provides the same functionality.
const JSX_DEV_RUNTIME_CODE = `
import * as React from "react"

// Use React.createElement as a fallback-safe jsxDEV implementation
// This works in both production and development builds
function _jsxDEV(type, props, key, isStatic, source, self) {
  // Extract children from props for createElement
  const { children, ...restProps } = props || {}
  if (key !== undefined) {
    restProps.key = key
  }
  // React.createElement handles children correctly
  if (children !== undefined) {
    if (Array.isArray(children)) {
      return React.createElement(type, restProps, ...children)
    }
    return React.createElement(type, restProps, children)
  }
  return React.createElement(type, restProps)
}

export const Fragment = React.Fragment

const SOURCE_KEY = Symbol.for("__aliveSource__")
const sourceElementMap = new Map()
window.aliveSourceMap = sourceElementMap

// Periodically clean up dead WeakRefs (every 30 seconds)
setInterval(function() {
  for (const [key, refs] of sourceElementMap) {
    for (const ref of refs) {
      if (ref.deref() === undefined) {
        refs.delete(ref)
      }
    }
    if (refs.size === 0) {
      sourceElementMap.delete(key)
    }
  }
}, 30000)

function cleanFileName(fileName) {
  if (!fileName) return ""
  let clean = fileName
  if (clean.includes("?")) clean = clean.split("?")[0]
  clean = clean.replace(/^\\/+/, "")
  if (clean.includes("node_modules")) return ""
  return clean
}

function getSourceKey(fileName, lineNumber, columnNumber) {
  return fileName + ":" + lineNumber + ":" + columnNumber
}

function registerElement(node, fileName, lineNumber, columnNumber) {
  const key = getSourceKey(fileName, lineNumber, columnNumber)
  if (!sourceElementMap.has(key)) {
    sourceElementMap.set(key, new Set())
  }
  sourceElementMap.get(key).add(new WeakRef(node))
}

function unregisterElement(node, fileName, lineNumber, columnNumber) {
  const key = getSourceKey(fileName, lineNumber, columnNumber)
  const refs = sourceElementMap.get(key)
  if (refs) {
    for (const ref of refs) {
      if (ref.deref() === node) {
        refs.delete(ref)
        break
      }
    }
    if (refs.size === 0) {
      sourceElementMap.delete(key)
    }
  }
}

function getTypeName(type) {
  if (typeof type === "string") return type
  if (typeof type === "function") return type.displayName || type.name || "Unknown"
  if (typeof type === "object" && type !== null) {
    return type.displayName || type.render?.displayName || type.render?.name || "Unknown"
  }
  return "Unknown"
}

export function jsxDEV(type, props, key, isStatic, source, self) {
  const fileName = cleanFileName(source?.fileName)
  if (!fileName || !source?.lineNumber) {
    return _jsxDEV(type, props, key, isStatic, source, self)
  }

  const lineNumber = source.lineNumber
  const columnNumber = source.columnNumber || 0
  const displayName = getTypeName(type)

  const sourceInfo = { fileName, lineNumber, columnNumber, displayName }
  const originalRef = props?.ref

  const enhancedProps = {
    ...props,
    ref: (node) => {
      if (node && node instanceof Element) {
        const existing = node[SOURCE_KEY]
        if (existing) {
          const existingKey = getSourceKey(existing.fileName, existing.lineNumber, existing.columnNumber)
          const newKey = getSourceKey(fileName, lineNumber, columnNumber)
          if (existingKey !== newKey) {
            unregisterElement(node, existing.fileName, existing.lineNumber, existing.columnNumber)
            node[SOURCE_KEY] = sourceInfo
            registerElement(node, fileName, lineNumber, columnNumber)
          }
        } else {
          node[SOURCE_KEY] = sourceInfo
          registerElement(node, fileName, lineNumber, columnNumber)
        }
      }
      if (typeof originalRef === "function") {
        originalRef(node)
      } else if (originalRef && typeof originalRef === "object" && "current" in originalRef) {
        originalRef.current = node
      }
    },
  }

  return _jsxDEV(type, enhancedProps, key, isStatic, source, self)
}
`

/**
 * Create the alive-tagger Vite plugin
 */
export function aliveTagger(options: AliveTaggerOptions = {}): Plugin {
  const { enabled = true, debug = false } = options

  let config: ResolvedConfig

  const log = (...args: unknown[]) => {
    if (debug) {
      console.log("[alive-tagger]", ...args)
    }
  }

  return {
    name: "alive-tagger",
    enforce: "pre",

    config(userConfig, { mode }) {
      // Only modify config in development mode when enabled
      if (!enabled || mode !== "development") {
        return
      }

      // Exclude react/jsx-dev-runtime from pre-bundling so we can intercept it
      // This ensures Vite doesn't bundle it in production mode (where jsxDEV is undefined)
      return {
        optimizeDeps: {
          exclude: [...(userConfig.optimizeDeps?.exclude || []), "react/jsx-dev-runtime"],
        },
      }
    },

    configResolved(resolvedConfig) {
      config = resolvedConfig
      log("Config resolved, mode:", config.mode)
    },

    transformIndexHtml(html) {
      // Only inject in development mode and when enabled
      if (!enabled || config?.mode !== "development") {
        return html
      }
      log("Injecting client script into index.html")
      // Inject client script at end of body (after React has rendered)
      return html.replace("</body>", `${CLIENT_SCRIPT}</body>`)
    },

    resolveId(id, importer) {
      // Only intercept in development mode and when enabled
      if (!enabled || config?.mode !== "development") {
        return null
      }

      // Intercept react/jsx-dev-runtime imports
      // Don't intercept our own virtual module to avoid infinite loop
      if (id === "react/jsx-dev-runtime" && !importer?.includes("\0alive-jsx")) {
        log("Intercepting jsx-dev-runtime import from:", importer)
        return "\0alive-jsx/jsx-dev-runtime"
      }

      return null
    },

    load(id) {
      // Return our custom JSX dev runtime
      if (id === "\0alive-jsx/jsx-dev-runtime") {
        log("Loading custom jsx-dev-runtime")
        return JSX_DEV_RUNTIME_CODE
      }

      return null
    },
  }
}
