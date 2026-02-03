import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { css } from "@codemirror/lang-css"
import { html } from "@codemirror/lang-html"
import { javascript } from "@codemirror/lang-javascript"
import { markdown } from "@codemirror/lang-markdown"
import { yaml } from "@codemirror/lang-yaml"
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language"
import { highlightSelectionMatches } from "@codemirror/search"
import { EditorState } from "@codemirror/state"
import { oneDark } from "@codemirror/theme-one-dark"
import {
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view"
import mermaid from "mermaid"
import { useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { parseFrontmatter } from "../../lib/template-utils"
import { useActiveTab, useEditorStore, useIsActiveTabModified } from "../../store/editor"
import { FrontmatterCard } from "./FrontmatterCard"

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#0dbc79",
    primaryTextColor: "#fff",
    primaryBorderColor: "#444",
    lineColor: "#888",
    secondaryColor: "#2d2d2d",
    tertiaryColor: "#1e1e1e",
  },
})

// Mermaid diagram component
function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string>("")

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code.trim()) return

      try {
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`
        const { svg } = await mermaid.render(id, code)
        setSvg(svg)
        setError("")
      } catch (err) {
        setError((err as Error).message)
        setSvg("")
      }
    }

    renderDiagram()
  }, [code])

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded p-3 text-red-400 text-sm">
        <div className="font-semibold mb-1">Mermaid Error</div>
        <pre className="text-xs overflow-auto">{error}</pre>
      </div>
    )
  }

  if (!svg) {
    return <div className="text-shell-text-muted text-sm">Rendering diagram...</div>
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram bg-shell-surface rounded p-4 overflow-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

interface CodeEditorProps {
  onSave: () => void
}

function isMarkdownFile(filename: string, isTemplate?: boolean): boolean {
  // Templates are always markdown
  if (isTemplate) return true
  const ext = filename.toLowerCase().split(".").pop() || ""
  return ext === "md" || ext === "markdown"
}

function getLanguageExtension(filename: string) {
  const ext = filename.toLowerCase().split(".").pop() || ""

  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript()
    case "ts":
    case "tsx":
      return javascript({ typescript: true })
    case "json":
      return javascript({ jsx: false })
    case "md":
    case "markdown":
      return markdown()
    case "css":
    case "scss":
    case "less":
      return css()
    case "html":
    case "htm":
    case "vue":
    case "svelte":
      return html()
    case "yaml":
    case "yml":
      return yaml()
    default:
      return []
  }
}

function createBaseExtensions() {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    foldGutter(),
    dropCursor(),
    rectangularSelection(),
    highlightSelectionMatches(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap, ...completionKeymap, indentWithTab]),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
    oneDark,
    EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "14px",
      },
      ".cm-scroller": {
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      },
      ".cm-gutters": {
        backgroundColor: "#161b22",
        borderRight: "1px solid #30363d",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "#1f2428",
      },
      ".cm-activeLine": {
        backgroundColor: "#1f2428",
      },
    }),
  ]
}

export function CodeEditor({ onSave }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [showPreview, setShowPreview] = useState(true)

  const activeTab = useActiveTab()
  const fileLoading = useEditorStore(s => s.fileLoading)
  const fileError = useEditorStore(s => s.fileError)
  const updateTabContent = useEditorStore(s => s.updateTabContent)
  const isModified = useIsActiveTabModified()

  const isMarkdown = activeTab ? isMarkdownFile(activeTab.name, activeTab.isTemplate) : false
  const _isTemplate = activeTab?.isTemplate ?? false

  // Create/destroy editor based on active tab and preview mode
  useEffect(() => {
    // Don't create editor if showing preview or no active tab
    if (showPreview && isMarkdown) {
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
      return
    }

    if (!containerRef.current || !activeTab || fileLoading || fileError) {
      return
    }

    // Destroy existing editor
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    const langExt = getLanguageExtension(activeTab.name)
    const tabPath = activeTab.path

    const state = EditorState.create({
      doc: activeTab.content,
      extensions: [
        ...createBaseExtensions(),
        langExt,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            updateTabContent(tabPath, update.state.doc.toString())
          }
        }),
      ],
    })

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    })

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
    }
  }, [activeTab?.path, fileLoading, fileError, showPreview, isMarkdown])

  // Handle keyboard shortcuts (Ctrl/Cmd+S)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        if (isModified) {
          onSave()
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onSave, isModified])

  if (!activeTab) {
    return <div className="h-full flex items-center justify-center text-shell-text-muted">Select a file to edit</div>
  }

  if (fileLoading) {
    return <div className="h-full flex items-center justify-center text-shell-text-muted">Loading...</div>
  }

  if (fileError) {
    return <div className="h-full flex items-center justify-center text-shell-danger p-4 text-center">{fileError}</div>
  }

  // Non-markdown files: just show the editor
  if (!isMarkdown) {
    return <div ref={containerRef} className="h-full overflow-hidden [&_.cm-editor]:h-full" />
  }

  // Markdown files: toggle between editor and preview
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toggle bar */}
      <div className="bg-shell-surface border-b border-shell-border px-3 py-1.5 flex items-center justify-end gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setShowPreview(false)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            !showPreview
              ? "bg-shell-accent text-white"
              : "bg-shell-border text-shell-text-muted hover:bg-shell-border/80"
          }`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            showPreview
              ? "bg-shell-accent text-white"
              : "bg-shell-border text-shell-text-muted hover:bg-shell-border/80"
          }`}
        >
          Preview
        </button>
      </div>
      {/* Editor or preview */}
      <div className="flex-1 overflow-hidden">
        {showPreview ? (
          <div className="h-full overflow-auto bg-shell-bg p-6">
            <div className="markdown-preview max-w-4xl mx-auto">
              {(() => {
                const { frontmatter, body } = parseFrontmatter(activeTab.content)
                return (
                  <>
                    {frontmatter && <FrontmatterCard data={frontmatter} />}
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || "")
                          const lang = match ? match[1] : ""
                          const code = String(children).replace(/\n$/, "")

                          // Render mermaid diagrams
                          if (lang === "mermaid") {
                            return <MermaidDiagram code={code} />
                          }

                          // Inline code (no language)
                          if (!match) {
                            return (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            )
                          }

                          // Code blocks with language
                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          )
                        },
                      }}
                    >
                      {body}
                    </Markdown>
                  </>
                )
              })()}
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="h-full overflow-hidden [&_.cm-editor]:h-full" />
        )}
      </div>
    </div>
  )
}
