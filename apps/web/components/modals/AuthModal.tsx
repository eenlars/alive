"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Eye, EyeOff, Mail, User } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/primitives/Button"
import { Input } from "@/components/ui/primitives/Input"
import {
  identifyUser,
  trackAuthEmailChecked,
  trackAuthModalOpened,
  trackLoginFailed,
  trackLoginSubmitted,
  trackLoginSuccess,
  trackSignupFailed,
  trackSignupSubmitted,
  trackSignupSuccess,
} from "@/lib/analytics/events"
import {
  useAuthModalActions,
  useAuthModalDescription,
  useAuthModalEmail,
  useAuthModalIsOpen,
  useAuthModalMode,
  useAuthModalTitle,
} from "@/lib/stores/authModalStore"
import { authStore } from "@/lib/stores/authStore"
import { useCurrentWorkspace, useWorkspaceActions } from "@/lib/stores/workspaceStore"

/**
 * AuthModal - Email-first authentication modal
 *
 * Flow:
 * 1. User enters email
 * 2. API checks if email exists
 * 3. If exists → login mode (password only)
 * 4. If new → signup mode (password + optional name)
 *
 * This component reads from authModalStore and can be opened from anywhere
 * using authModalStore.open() or useAuthModalActions().open()
 */
export function AuthModal() {
  const isOpen = useAuthModalIsOpen()
  const mode = useAuthModalMode()
  const storedEmail = useAuthModalEmail()
  const customTitle = useAuthModalTitle()
  const customDescription = useAuthModalDescription()
  const { close, setMode, setEmail: setStoredEmail, handleSuccess } = useAuthModalActions()

  // Workspace validation after login
  const currentWorkspace = useCurrentWorkspace()
  const { setCurrentWorkspace } = useWorkspaceActions()

  // Form state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // UI state
  const [loading, setLoading] = useState(false)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [error, setError] = useState("")

  // Refs for focus management
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  // Sync email from store
  useEffect(() => {
    if (storedEmail) {
      setEmail(storedEmail)
    }
  }, [storedEmail])

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Reset form when opening
      if (!storedEmail) {
        setEmail("")
      }
      setPassword("")
      setName("")
      setError("")

      // Focus appropriate input
      setTimeout(() => {
        if (mode === "initial") {
          emailInputRef.current?.focus()
        } else {
          passwordInputRef.current?.focus()
        }
      }, 100)
    }
  }, [isOpen, mode, storedEmail])

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, close])

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  const handleCheckEmail = useCallback(async () => {
    if (!email.trim()) {
      setError("Please enter your email")
      return
    }

    setCheckingEmail(true)
    setError("")

    try {
      const response = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        setError(data.message || "Failed to check email")
        return
      }

      // Store email and transition to appropriate mode
      setStoredEmail(email.trim())
      trackAuthEmailChecked(data.exists)
      setMode(data.exists ? "login" : "signup")

      // Focus password input after mode change
      setTimeout(() => passwordInputRef.current?.focus(), 100)
    } catch (err) {
      console.error("[AuthModal] Check email error:", err)
      setError("Connection failed. Please try again.")
    } finally {
      setCheckingEmail(false)
    }
  }, [email, setStoredEmail, setMode])

  const handleLogin = useCallback(async () => {
    if (!password.trim()) {
      setError("Please enter your password")
      return
    }

    setLoading(true)
    setError("")
    trackLoginSubmitted()

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        trackLoginFailed(data.message || "invalid_credentials")
        setError(data.message || "Invalid email or password")
        return
      }

      // Update auth store
      authStore.setAuthenticated()
      trackLoginSuccess()
      identifyUser(data.userId ?? email, { email: email.trim() })

      // Validate current workspace against server-returned workspace access list
      // If the localStorage workspace isn't accessible, clear it to force re-selection
      if (currentWorkspace && data.workspaces && !data.workspaces.includes(currentWorkspace)) {
        console.log(`[AuthModal] Clearing invalid workspace: ${currentWorkspace} (not in accessible workspaces)`)
        setCurrentWorkspace(null)
      }

      // Call success callback
      handleSuccess({ id: data.userId, email: email.trim() })
    } catch (err) {
      console.error("[AuthModal] Login error:", err)
      setError("Connection failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [email, password, handleSuccess])

  const handleSignup = useCallback(async () => {
    if (!password.trim()) {
      setError("Please enter a password")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setLoading(true)
    setError("")
    trackSignupSubmitted()

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        }),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        trackSignupFailed(data.message || "signup_error")
        setError(data.message || "Failed to create account")
        return
      }

      // Update auth store
      authStore.setAuthenticated()
      trackSignupSuccess()
      identifyUser(data.userId ?? email, { email: email.trim() })

      // Call success callback
      handleSuccess({ id: data.userId, email: email.trim() })
    } catch (err) {
      console.error("[AuthModal] Signup error:", err)
      setError("Connection failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [email, password, name, handleSuccess])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      if (mode === "initial") {
        handleCheckEmail()
      } else if (mode === "login") {
        handleLogin()
      } else {
        handleSignup()
      }
    },
    [mode, handleCheckEmail, handleLogin, handleSignup],
  )

  const handleBack = useCallback(() => {
    setMode("initial")
    setPassword("")
    setName("")
    setError("")
    setTimeout(() => emailInputRef.current?.focus(), 100)
  }, [setMode])

  const getTitle = (): string => {
    if (customTitle) return customTitle
    switch (mode) {
      case "login":
        return "Welcome back"
      case "signup":
        return "Create your account"
      default:
        return "Continue with email"
    }
  }

  const getDescription = (): string => {
    if (customDescription) return customDescription
    switch (mode) {
      case "login":
        return "Enter your password to sign in"
      case "signup":
        return "Set a password to create your account"
      default:
        return "Enter your email to get started"
    }
  }

  const getButtonText = (): string => {
    if (loading) {
      return mode === "signup" ? "Creating account..." : "Signing in..."
    }
    if (checkingEmail) {
      return "Checking..."
    }
    switch (mode) {
      case "login":
        return "Sign in"
      case "signup":
        return "Create account"
      default:
        return "Continue"
    }
  }

  // Track modal open
  useEffect(() => {
    if (isOpen) trackAuthModalOpened()
  }, [isOpen])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={close}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-modal-title"
            >
              {/* Header */}
              <div className="p-6 pb-2">
                <div className="flex items-center gap-3 mb-1">
                  {mode !== "initial" && (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="p-1.5 -ml-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      aria-label="Go back"
                    >
                      <ArrowLeft size={20} className="text-black/60 dark:text-white/60" />
                    </button>
                  )}
                  <h2 id="auth-modal-title" className="text-xl font-semibold text-black dark:text-white">
                    {getTitle()}
                  </h2>
                </div>
                <p className="text-sm text-black/60 dark:text-white/60 ml-0">{getDescription()}</p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-4">
                {/* Email field - shown in all modes but disabled in login/signup */}
                <div className={mode !== "initial" ? "opacity-60" : ""}>
                  <Input
                    ref={emailInputRef}
                    id="auth-email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value)
                      if (error) setError("")
                    }}
                    placeholder="you@example.com"
                    disabled={mode !== "initial" || loading || checkingEmail}
                    autoComplete="email"
                    suffix={<Mail size={18} className="text-black/30 dark:text-white/30" />}
                  />
                </div>

                {/* Password field - shown in login/signup modes */}
                <AnimatePresence mode="wait">
                  {mode !== "initial" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Input
                        ref={passwordInputRef}
                        id="auth-password"
                        label="Password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={e => {
                          setPassword(e.target.value)
                          if (error) setError("")
                        }}
                        placeholder={mode === "signup" ? "Create a password (6+ chars)" : "Enter your password"}
                        disabled={loading}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        helperText={mode === "signup" ? "At least 6 characters" : undefined}
                        suffix={
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        }
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Name field - shown in signup mode only */}
                <AnimatePresence mode="wait">
                  {mode === "signup" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Input
                        id="auth-name"
                        label="Name (optional)"
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Your name"
                        disabled={loading}
                        autoComplete="name"
                        suffix={<User size={18} className="text-black/30 dark:text-white/30" />}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error message */}
                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/30 rounded-lg px-4 py-3"
                    >
                      <p className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit button */}
                <Button
                  type="submit"
                  fullWidth
                  loading={loading || checkingEmail}
                  disabled={!email.trim() || (mode !== "initial" && !password.trim())}
                  className="!bg-black dark:!bg-white !text-white dark:!text-black hover:!bg-black/90 dark:hover:!bg-white/90 !border-0 !font-medium !text-base !py-3 !rounded-xl !transition-all !normal-case !tracking-normal"
                >
                  {getButtonText()}
                </Button>

                {/* Footer links */}
                <div className="text-center pt-2">
                  {mode === "login" && (
                    <p className="text-sm text-black/50 dark:text-white/50">
                      Wrong account?{" "}
                      <button
                        type="button"
                        onClick={handleBack}
                        className="text-black dark:text-white font-medium hover:underline"
                      >
                        Use a different email
                      </button>
                    </p>
                  )}
                  {mode === "signup" && (
                    <p className="text-sm text-black/50 dark:text-white/50">
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={handleBack}
                        className="text-black dark:text-white font-medium hover:underline"
                      >
                        Sign in instead
                      </button>
                    </p>
                  )}
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
