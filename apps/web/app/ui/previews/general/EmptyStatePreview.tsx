"use client"

import { FileText, Image, Inbox, Search } from "lucide-react"
import { EmptyState } from "@/components/ui/EmptyState"

export function EmptyStatePreview() {
  return (
    <div className="space-y-8">
      {/* Basic */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Basic</h3>
        <div className="max-w-sm border border-black/10 dark:border-white/10 rounded-lg">
          <EmptyState icon={Inbox} message="No messages yet" />
        </div>
      </section>

      {/* With Action */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">With Action</h3>
        <div className="max-w-sm border border-black/10 dark:border-white/10 rounded-lg">
          <EmptyState
            icon={FileText}
            message="No documents found"
            action={{
              label: "Create Document",
              onClick: () => alert("Create clicked!"),
            }}
          />
        </div>
      </section>

      {/* Search Results */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Search Results</h3>
        <div className="max-w-sm border border-black/10 dark:border-white/10 rounded-lg">
          <EmptyState
            icon={Search}
            message="No results match your search"
            action={{
              label: "Clear Filters",
              onClick: () => alert("Clear clicked!"),
            }}
          />
        </div>
      </section>

      {/* Gallery */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Gallery</h3>
        <div className="max-w-sm border border-black/10 dark:border-white/10 rounded-lg">
          <EmptyState
            icon={Image}
            message="No images uploaded"
            action={{
              label: "Upload Image",
              onClick: () => alert("Upload clicked!"),
            }}
          />
        </div>
      </section>
    </div>
  )
}
