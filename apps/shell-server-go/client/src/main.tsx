import "./styles/shell.css"
import hljs from "highlight.js/lib/core"
import bash from "highlight.js/lib/languages/bash"
import css from "highlight.js/lib/languages/css"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import markdown from "highlight.js/lib/languages/markdown"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import yaml from "highlight.js/lib/languages/yaml"
import { createRoot } from "react-dom/client"
import "highlight.js/styles/github-dark.css"
import { App } from "./App"

// Register languages for syntax highlighting
hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("css", css)
hljs.registerLanguage("html", xml)
hljs.registerLanguage("xml", xml)
hljs.registerLanguage("json", json)
hljs.registerLanguage("markdown", markdown)
hljs.registerLanguage("yaml", yaml)
hljs.registerLanguage("bash", bash)

// Expose globally for FilePreview
;(window as unknown as { hljs: typeof hljs }).hljs = hljs

const root = document.getElementById("app")
if (root) {
  createRoot(root).render(<App />)
}
