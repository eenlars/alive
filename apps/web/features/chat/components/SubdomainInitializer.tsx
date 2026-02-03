"use client"

import { useSearchParams } from "next/navigation"
import { useEffect } from "react"

interface SubdomainInitializerProps {
  onInitialize: (message: string, workspace: string) => void
  onInitialized: () => void
  isInitialized: boolean
  isMounted: boolean
}

export function SubdomainInitializer({
  onInitialize,
  onInitialized,
  isInitialized,
  isMounted,
}: SubdomainInitializerProps) {
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!isMounted || isInitialized) return

    const slug = searchParams.get("slug")
    const autoStart = searchParams.get("autoStart") === "true"

    if (!slug || !autoStart) return

    const initializeSubdomain = async () => {
      try {
        const metadataResponse = await fetch(`/api/sites/metadata?slug=${encodeURIComponent(slug)}`)
        if (!metadataResponse.ok) {
          console.error("Failed to fetch site metadata")
          return
        }

        const data = await metadataResponse.json()
        const metadata = data.metadata

        // Pre-fill message with site ideas
        const initialMessage = `I want to build a website with these ideas:\n\n${metadata.siteIdeas}\n\nCan you help me get started?`
        onInitialize(initialMessage, metadata.workspace || "")
        onInitialized()
      } catch (error) {
        console.error("Failed to initialize subdomain context:", error)
      }
    }

    initializeSubdomain()
  }, [searchParams, isMounted, isInitialized, onInitialize, onInitialized])

  return null
}
