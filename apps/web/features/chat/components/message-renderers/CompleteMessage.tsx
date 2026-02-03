import type { BridgeCompleteMessage } from "@/features/chat/lib/streaming/ndjson"

interface CompleteMessageProps {
  data: BridgeCompleteMessage["data"]
}

export function CompleteMessage(_props: CompleteMessageProps) {
  // Don't show completion stats
  return null
}
