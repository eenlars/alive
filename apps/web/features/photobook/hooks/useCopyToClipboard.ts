import { useCallback, useState } from "react"

const COPY_FEEDBACK_DURATION = 2000

export function useCopyToClipboard() {
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set())

  const copyToClipboard = useCallback((text: string, itemId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedItems(prev => new Set(prev).add(itemId))

    setTimeout(() => {
      setCopiedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }, COPY_FEEDBACK_DURATION)
  }, [])

  const isCopied = useCallback(
    (itemId: string) => {
      return copiedItems.has(itemId)
    },
    [copiedItems],
  )

  return { copyToClipboard, isCopied }
}
