"use client"

import { ReadOutput } from "@/components/ui/chat/tools/read/ReadOutput"

export function ReadOutputPreview() {
  return (
    <div className="space-y-8">
      {/* Text File */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Text File</h3>
        <div className="max-w-lg">
          <ReadOutput
            content={`     1→import { useState } from 'react'
     2→
     3→export function Counter() {
     4→  const [count, setCount] = useState(0)
     5→
     6→  return (
     7→    <button onClick={() => setCount(c => c + 1)}>
     8→      Count: {count}
     9→    </button>
    10→  )
    11→}`}
            total_lines={11}
            lines_returned={11}
          />
        </div>
      </section>

      {/* Partial File */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Partial File (Truncated)</h3>
        <div className="max-w-lg">
          <ReadOutput
            content={`    42→  const handleSubmit = async () => {
    43→    setLoading(true)
    44→    try {
    45→      await api.save(data)
    46→    } catch (err) {
    47→      setError(err.message)
    48→    } finally {
    49→      setLoading(false)
    50→    }
    51→  }`}
            total_lines={250}
            lines_returned={10}
          />
        </div>
      </section>

      {/* Image File */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Image File</h3>
        <div className="max-w-lg">
          <ReadOutput image="base64..." mime_type="image/png" file_size={45678} />
        </div>
      </section>

      {/* PDF File */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">PDF File</h3>
        <div className="max-w-lg">
          <ReadOutput
            pages={[
              { page_number: 1, text: "Page 1 content..." },
              { page_number: 2, text: "Page 2 content..." },
            ]}
            total_pages={15}
          />
        </div>
      </section>

      {/* Notebook File */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Jupyter Notebook</h3>
        <div className="max-w-lg">
          <ReadOutput
            cells={[
              { cell_type: "markdown", source: "# Analysis" },
              { cell_type: "code", source: "import pandas as pd", execution_count: 1 },
              { cell_type: "code", source: "df.head()", execution_count: 2 },
            ]}
          />
        </div>
      </section>
    </div>
  )
}
