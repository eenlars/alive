/**
 * Alive Tagger Client
 *
 * Beautiful element selection UI for the Claude Bridge sandbox.
 * Inspired by React Grab's polished visual design.
 *
 * Usage:
 * - Hold Cmd (Mac) or Ctrl (Windows/Linux)
 * - Hover over elements to see highlights with crosshair
 * - Click to select and send context to Claude Bridge
 */

import {
  ELEMENT_SELECTED_MESSAGE_TYPE,
  type ElementSelectedContext,
  type ElementSelectedMessage,
  SOURCE_KEY,
  type SourceInfo,
} from "./types"

/** Maximum length for HTML snippet */
const MAX_HTML_LENGTH = 500

/** Brand colors - purple/pink gradient like React Grab */
const COLORS = {
  primary: "#d239c0", // Vibrant pink/purple
  primaryMuted: "rgba(210, 57, 192, 0.4)",
  primaryBg: "rgba(210, 57, 192, 0.08)",
  secondary: "#b21c8e", // Deeper purple
  success: "#10b981", // Emerald for selection confirmation
  labelBg: "#1a1a1a",
  labelText: "#ffffff",
  labelMuted: "#a0a0a0",
}

/** CSS styles injected into the page */
const STYLES = `
@keyframes alive-tagger-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes alive-tagger-flash {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.02); opacity: 0.9; }
  100% { transform: scale(1); opacity: 1; }
}

#alive-tagger-overlay {
  position: fixed;
  pointer-events: none;
  z-index: 2147483646;
  border: 2px solid ${COLORS.primary};
  border-radius: 4px;
  background: ${COLORS.primaryBg};
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  display: none;
  will-change: transform, width, height;
  box-shadow: 0 0 0 1px ${COLORS.primaryMuted};
}

#alive-tagger-overlay.flash {
  animation: alive-tagger-flash 0.3s ease-out;
  border-color: ${COLORS.success};
  background: rgba(16, 185, 129, 0.15);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
}

#alive-tagger-label {
  position: fixed;
  pointer-events: none;
  z-index: 2147483647;
  display: none;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  filter: drop-shadow(0px 2px 8px rgba(0, 0, 0, 0.3));
}

#alive-tagger-label-inner {
  background: ${COLORS.labelBg};
  color: ${COLORS.labelText};
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  max-width: 400px;
  backdrop-filter: blur(8px);
}

#alive-tagger-label-arrow {
  position: absolute;
  left: 12px;
  bottom: -6px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid ${COLORS.labelBg};
}

#alive-tagger-label .component-name {
  color: ${COLORS.primary};
  font-weight: 600;
}

#alive-tagger-label .file-path {
  color: ${COLORS.labelMuted};
  margin-left: 6px;
}

#alive-tagger-label .line-number {
  color: ${COLORS.labelText};
  opacity: 0.7;
}

#alive-tagger-crosshair-h,
#alive-tagger-crosshair-v {
  position: fixed;
  pointer-events: none;
  z-index: 2147483645;
  background: ${COLORS.primary};
  opacity: 0.3;
  display: none;
}

#alive-tagger-crosshair-h {
  height: 1px;
  left: 0;
  right: 0;
}

#alive-tagger-crosshair-v {
  width: 1px;
  top: 0;
  bottom: 0;
}

#alive-tagger-coords {
  position: fixed;
  pointer-events: none;
  z-index: 2147483647;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
  color: ${COLORS.labelMuted};
  background: ${COLORS.labelBg};
  padding: 2px 6px;
  border-radius: 3px;
  display: none;
  opacity: 0.8;
}

body.alive-tagger-active {
  cursor: crosshair !important;
}

body.alive-tagger-active * {
  cursor: crosshair !important;
}
`

/**
 * Get source info from an element, walking up the tree if needed
 */
function getSourceInfo(element: Element): SourceInfo | null {
  let current: Element | null = element
  let depth = 0
  const maxDepth = 10

  while (current && depth < maxDepth) {
    const source = (current as unknown as Record<symbol, SourceInfo>)[SOURCE_KEY]
    if (source) {
      return source
    }
    current = current.parentElement
    depth++
  }

  return null
}

/**
 * Get parent component stack for context
 */
function getParentComponents(element: Element, maxDepth = 5): string[] {
  const components: string[] = []
  let current: Element | null = element.parentElement
  let depth = 0

  while (current && depth < maxDepth) {
    const source = (current as unknown as Record<symbol, SourceInfo>)[SOURCE_KEY]
    if (source?.displayName) {
      // Only include React components (capitalized names), skip HTML tags
      if (source.displayName[0] === source.displayName[0].toUpperCase() && !/^[a-z]+$/.test(source.displayName)) {
        components.push(source.displayName)
      }
    }
    current = current.parentElement
    depth++
  }

  return components
}

/**
 * Build element context for sending to parent
 */
function buildContext(element: Element, source: SourceInfo): ElementSelectedContext {
  return {
    fileName: source.fileName,
    lineNumber: source.lineNumber,
    columnNumber: source.columnNumber,
    displayName: source.displayName,
    html: element.outerHTML.slice(0, MAX_HTML_LENGTH),
    tagName: element.tagName.toLowerCase(),
    className: element.className || "",
    id: element.id || "",
    parentComponents: getParentComponents(element),
  }
}

/**
 * Send element context to parent frame
 */
function sendToParent(context: ElementSelectedContext): void {
  const message: ElementSelectedMessage = {
    type: ELEMENT_SELECTED_MESSAGE_TYPE,
    context,
  }

  try {
    window.parent.postMessage(message, "*")
    console.log("[alive-tagger] Selected:", context.displayName, "at", `${context.fileName}:${context.lineNumber}`)
  } catch (error) {
    console.error("[alive-tagger] Failed to send message:", error)
  }
}

/**
 * Inject styles into the page
 */
function injectStyles(): HTMLStyleElement {
  const style = document.createElement("style")
  style.id = "alive-tagger-styles"
  style.textContent = STYLES
  document.head.appendChild(style)
  return style
}

/**
 * Create the UI elements
 */
function createUI(): {
  overlay: HTMLDivElement
  label: HTMLDivElement
  crosshairH: HTMLDivElement
  crosshairV: HTMLDivElement
  coords: HTMLDivElement
  show: (element: Element, mouseX: number, mouseY: number) => void
  hide: () => void
  flash: () => void
} {
  // Overlay box
  const overlay = document.createElement("div")
  overlay.id = "alive-tagger-overlay"

  // Label with component info
  const label = document.createElement("div")
  label.id = "alive-tagger-label"
  label.innerHTML = `
		<div id="alive-tagger-label-inner">
			<span class="component-name"></span>
			<span class="file-path"></span>
			<span class="line-number"></span>
		</div>
		<div id="alive-tagger-label-arrow"></div>
	`

  // Crosshair lines
  const crosshairH = document.createElement("div")
  crosshairH.id = "alive-tagger-crosshair-h"

  const crosshairV = document.createElement("div")
  crosshairV.id = "alive-tagger-crosshair-v"

  // Coordinate display
  const coords = document.createElement("div")
  coords.id = "alive-tagger-coords"

  // Add to DOM
  document.body.appendChild(overlay)
  document.body.appendChild(label)
  document.body.appendChild(crosshairH)
  document.body.appendChild(crosshairV)
  document.body.appendChild(coords)

  return {
    overlay,
    label,
    crosshairH,
    crosshairV,
    coords,

    show(element: Element, mouseX: number, mouseY: number) {
      const rect = element.getBoundingClientRect()
      const source = getSourceInfo(element)

      // Position overlay
      overlay.style.left = `${rect.left}px`
      overlay.style.top = `${rect.top}px`
      overlay.style.width = `${rect.width}px`
      overlay.style.height = `${rect.height}px`
      overlay.style.display = "block"
      overlay.classList.remove("flash")

      // Position crosshairs
      crosshairH.style.top = `${mouseY}px`
      crosshairH.style.display = "block"
      crosshairV.style.left = `${mouseX}px`
      crosshairV.style.display = "block"

      // Position coords
      coords.textContent = `${Math.round(mouseX)}, ${Math.round(mouseY)}`
      coords.style.left = `${mouseX + 15}px`
      coords.style.top = `${mouseY + 15}px`
      coords.style.display = "block"

      // Update label
      if (source) {
        const componentName = label.querySelector(".component-name") as HTMLElement
        const filePath = label.querySelector(".file-path") as HTMLElement
        const lineNumber = label.querySelector(".line-number") as HTMLElement

        componentName.textContent = source.displayName
        filePath.textContent = source.fileName
        lineNumber.textContent = `:${source.lineNumber}`

        // Position label above element
        const labelTop = Math.max(8, rect.top - 40)
        label.style.left = `${Math.max(8, rect.left)}px`
        label.style.top = `${labelTop}px`
        label.style.display = "block"
      } else {
        label.style.display = "none"
      }
    },

    hide() {
      overlay.style.display = "none"
      label.style.display = "none"
      crosshairH.style.display = "none"
      crosshairV.style.display = "none"
      coords.style.display = "none"
    },

    flash() {
      overlay.classList.add("flash")
      setTimeout(() => {
        overlay.classList.remove("flash")
      }, 300)
    },
  }
}

/**
 * Initialize the element selector
 */
export function initAliveTagger(): () => void {
  // Don't run if not in iframe
  if (window.parent === window) {
    console.log("[alive-tagger] Not in iframe, skipping initialization")
    return () => {}
  }

  // Check if already initialized
  if ((window as unknown as Record<string, boolean>).__aliveTaggerInitialized) {
    console.log("[alive-tagger] Already initialized")
    return () => {}
  }
  ;(window as unknown as Record<string, boolean>).__aliveTaggerInitialized = true

  console.log("[alive-tagger] Initializing element selector")

  // Inject styles
  const styleEl = injectStyles()

  // Create UI elements
  const ui = createUI()

  let isActive = false
  let hoveredElement: Element | null = null

  // Track modifier key state
  function handleKeyDown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && !isActive) {
      isActive = true
      document.body.classList.add("alive-tagger-active")
    }
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (!e.metaKey && !e.ctrlKey && isActive) {
      isActive = false
      document.body.classList.remove("alive-tagger-active")
      ui.hide()
      hoveredElement = null
    }
  }

  // Track mouse movement
  function handleMouseMove(e: MouseEvent): void {
    if (!isActive) return

    const target = e.target as Element

    // Update crosshair position even if same element
    if (hoveredElement === target) {
      // Just update crosshair and coords
      const crosshairH = document.getElementById("alive-tagger-crosshair-h")
      const crosshairV = document.getElementById("alive-tagger-crosshair-v")
      const coords = document.getElementById("alive-tagger-coords")

      if (crosshairH) crosshairH.style.top = `${e.clientY}px`
      if (crosshairV) crosshairV.style.left = `${e.clientX}px`
      if (coords) {
        coords.textContent = `${Math.round(e.clientX)}, ${Math.round(e.clientY)}`
        coords.style.left = `${e.clientX + 15}px`
        coords.style.top = `${e.clientY + 15}px`
      }
      return
    }

    // Check if element has source info
    const source = getSourceInfo(target)
    if (source) {
      hoveredElement = target
      ui.show(target, e.clientX, e.clientY)
    } else {
      hoveredElement = null
      ui.hide()
    }
  }

  // Handle clicks
  function handleClick(e: MouseEvent): void {
    if (!isActive) return

    const target = e.target as Element
    const source = getSourceInfo(target)

    if (source) {
      e.preventDefault()
      e.stopPropagation()

      // Flash effect
      ui.flash()

      // Build and send context
      const context = buildContext(target, source)
      sendToParent(context)
    }
  }

  // Handle window blur (deactivate when losing focus)
  function handleBlur(): void {
    isActive = false
    document.body.classList.remove("alive-tagger-active")
    ui.hide()
    hoveredElement = null
  }

  // Listen for activation/deactivation message from parent (button click)
  function handleMessage(e: MessageEvent): void {
    if (e.data?.type === "alive-tagger-activate") {
      isActive = true
      document.body.classList.add("alive-tagger-active")
      console.log("[alive-tagger] Activated via button")
    } else if (e.data?.type === "alive-tagger-deactivate") {
      isActive = false
      document.body.classList.remove("alive-tagger-active")
      ui.hide()
      hoveredElement = null
      console.log("[alive-tagger] Deactivated via button")
    }
  }

  // Add event listeners
  document.addEventListener("keydown", handleKeyDown, true)
  document.addEventListener("keyup", handleKeyUp, true)
  document.addEventListener("mousemove", handleMouseMove, true)
  document.addEventListener("click", handleClick, true)
  window.addEventListener("blur", handleBlur)
  window.addEventListener("message", handleMessage)

  console.log("[alive-tagger] Ready! Hold Cmd/Ctrl or click the select button to select elements.")

  // Return cleanup function
  return () => {
    document.removeEventListener("keydown", handleKeyDown, true)
    document.removeEventListener("keyup", handleKeyUp, true)
    document.removeEventListener("mousemove", handleMouseMove, true)
    document.removeEventListener("click", handleClick, true)
    window.removeEventListener("blur", handleBlur)
    window.removeEventListener("message", handleMessage)

    // Remove UI elements
    styleEl.remove()
    document.getElementById("alive-tagger-overlay")?.remove()
    document.getElementById("alive-tagger-label")?.remove()
    document.getElementById("alive-tagger-crosshair-h")?.remove()
    document.getElementById("alive-tagger-crosshair-v")?.remove()
    document.getElementById("alive-tagger-coords")?.remove()

    document.body.classList.remove("alive-tagger-active")
    ;(window as unknown as Record<string, boolean>).__aliveTaggerInitialized = false
    console.log("[alive-tagger] Cleaned up")
  }
}

// Auto-initialize when in browser
if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initAliveTagger())
  } else {
    // Small delay to ensure React has rendered
    setTimeout(() => initAliveTagger(), 100)
  }
}
