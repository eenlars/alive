interface StartMessageProps {
  data: {
    host: string
    cwd: string
    message: string
    messageLength: number
  }
  timestamp: string
}

export function StartMessage(_props: StartMessageProps) {
  // Don't show session initialization to users
  return null
}
