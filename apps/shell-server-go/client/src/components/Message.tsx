import { useUIStore } from "../store/ui"

export function Message() {
  const message = useUIStore(s => s.message)
  const messageType = useUIStore(s => s.messageType)

  if (!message) return null

  const isSuccess = messageType === "success"
  const className = isSuccess
    ? "p-4 rounded mt-5 text-sm bg-shell-accent/10 border border-shell-accent text-shell-accent whitespace-pre-wrap font-mono"
    : "p-4 rounded mt-5 text-sm bg-shell-danger/10 border border-shell-danger text-shell-danger whitespace-pre-wrap font-mono"

  return <div className={className}>{message}</div>
}
