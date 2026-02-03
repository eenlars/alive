"use client"

import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"

interface SubmitButtonProps {
  isDeploying: boolean
  isValid: boolean
  label: string
  countdown?: number
}

export function SubmitButton({ isDeploying, isValid, label, countdown = 0 }: SubmitButtonProps) {
  return (
    <motion.button
      whileHover={!isDeploying && isValid ? { scale: 1.02 } : {}}
      whileTap={!isDeploying && isValid ? { scale: 0.98 } : {}}
      animate={
        !isDeploying && isValid
          ? {
              boxShadow: [
                "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                "0 1px 2px 0 rgb(0 0 0 / 0.05)",
              ],
            }
          : {}
      }
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      type="submit"
      disabled={isDeploying || !isValid}
      data-testid="submit-button"
      className={`w-full py-4 px-6 rounded-xl font-bold text-base transition-all duration-300 flex items-center justify-center gap-2 ${
        isDeploying || !isValid
          ? "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40 cursor-not-allowed"
          : "bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80"
      }`}
    >
      {isDeploying ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Launching{countdown > 0 ? ` (${countdown}s)` : "..."}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </motion.button>
  )
}
