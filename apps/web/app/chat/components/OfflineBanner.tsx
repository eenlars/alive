"use client"

import { AnimatePresence, motion } from "framer-motion"
import { WifiOff } from "lucide-react"

interface OfflineBannerProps {
  isOnline: boolean
}

/**
 * Subtle, non-invasive banner shown when the user loses internet connection.
 * Slides in from top, uses muted colors to avoid alarm.
 */
export function OfflineBanner({ isOnline }: OfflineBannerProps) {
  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-sm px-4 py-2 flex items-center justify-center gap-2 border-b border-amber-200 dark:border-amber-800/50">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>No internet connection — messages can't be sent right now</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
