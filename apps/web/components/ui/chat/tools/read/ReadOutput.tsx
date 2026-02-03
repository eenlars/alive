type ReadOutputProps = TextFileOutputProps | ImageFileOutputProps | PDFFileOutputProps | NotebookFileOutputProps

interface TextFileOutputProps {
  content: string
  total_lines: number
  lines_returned: number
}

interface ImageFileOutputProps {
  image: string
  mime_type: string
  file_size: number
}

interface PDFFileOutputProps {
  pages: Array<{
    page_number: number
    text?: string
    images?: Array<{
      image: string
      mime_type: string
    }>
  }>
  total_pages: number
}

interface NotebookFileOutputProps {
  cells: Array<{
    cell_type: "code" | "markdown"
    source: string
    outputs?: any[]
    execution_count?: number
  }>
  metadata?: Record<string, any>
}

/**
 * Parse cat -n formatted content into lines with line numbers
 * Format: "     1\tcontent" (tab) or "     1→content" (arrow)
 */
function parseNumberedContent(content: string): Array<{ lineNum: number; text: string }> {
  return content.split("\n").map(line => {
    // Match: optional spaces, number, tab OR arrow, rest of line
    const match = line.match(/^\s*(\d+)[\t→](.*)$/)
    if (match) {
      return { lineNum: parseInt(match[1], 10), text: match[2] }
    }
    // Fallback for lines without proper formatting
    return { lineNum: 0, text: line }
  })
}

export function ReadOutput(props: ReadOutputProps) {
  // Text file
  if ("content" in props && "total_lines" in props) {
    const lines = parseNumberedContent(props.content)
    const maxLineNum = Math.max(...lines.map(l => l.lineNum))
    const lineNumWidth = String(maxLineNum).length

    return (
      <div className="space-y-1.5">
        <div className="text-xs text-black/40 dark:text-white/40 font-normal">
          {props.lines_returned} of {props.total_lines} lines
        </div>
        <div className="bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 max-h-60 overflow-auto">
          <div className="font-diatype-mono text-[11px] leading-relaxed">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span
                  className="text-black/25 dark:text-white/25 select-none pr-3 text-right shrink-0"
                  style={{ width: `${lineNumWidth + 2}ch` }}
                >
                  {line.lineNum || ""}
                </span>
                <span className="text-black/70 dark:text-white/70 whitespace-pre-wrap break-all">{line.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Image file
  if ("image" in props && "file_size" in props) {
    return (
      <div className="text-xs text-black/40 dark:text-white/40 font-normal">
        image • {Math.round(props.file_size / 1024)}KB
      </div>
    )
  }

  // PDF file
  if ("pages" in props && "total_pages" in props) {
    return <div className="text-xs text-black/40 dark:text-white/40 font-normal">pdf • {props.total_pages} pages</div>
  }

  // Notebook file
  if ("cells" in props) {
    return (
      <div className="text-xs text-black/40 dark:text-white/40 font-normal">notebook • {props.cells.length} cells</div>
    )
  }

  return null
}
