import { useEffect, useState } from "react"
import toast from "react-hot-toast"

/**
 * Hook to track browser online/offline status.
 * Shows toasts on state transitions and returns current status.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    // SSR-safe: default to true, will sync on mount
    if (typeof window === "undefined") return true
    return navigator.onLine
  })

  useEffect(() => {
    // Sync state on mount (in case SSR default differs)
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      toast.success("You're back online", { id: "online-status" })
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast("You're offline — messages can't be sent right now", {
        id: "online-status",
        icon: "📡",
        duration: 4000,
      })
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return isOnline
}
