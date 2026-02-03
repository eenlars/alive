"use client"

import { useState } from "react"
import { SearchInput } from "@/components/ui/SearchInput"

export function SearchInputPreview() {
  const [value1, setValue1] = useState("")
  const [value2, setValue2] = useState("existing search")

  return (
    <div className="space-y-8 max-w-md">
      {/* Empty State */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Empty</h3>
        <SearchInput value={value1} onChange={setValue1} placeholder="Search files..." />
      </section>

      {/* With Value */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">With Value (shows clear button)</h3>
        <SearchInput value={value2} onChange={setValue2} placeholder="Search..." />
      </section>

      {/* Custom Placeholder */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Custom Placeholder</h3>
        <SearchInput value="" onChange={() => {}} placeholder="Type to filter components..." />
      </section>
    </div>
  )
}
