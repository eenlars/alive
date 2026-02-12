"use client"

import { Eye, EyeOff } from "lucide-react"
import { useRouter } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { Button } from "@/components/ui/primitives/Button"
import { Input } from "@/components/ui/primitives/Input"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import {
  identifyUser,
  trackLandingPageView,
  trackLoginFailed,
  trackLoginSubmitted,
  trackLoginSuccess,
  trackSignupStarted,
} from "@/lib/analytics/events"
import { useAuthModalActions } from "@/lib/stores/authModalStore"
import { authStore } from "@/lib/stores/authStore"

function LoginPageContent() {
  useEffect(() => {
    trackLandingPageView()
  }, [])

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const router = useRouter()
  const { open: openAuthModal } = useAuthModalActions()

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    trackLoginSubmitted()

    try {
      const loginResponse = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })

      const data = await loginResponse.json()

      if (!loginResponse.ok || !data.ok) {
        trackLoginFailed("invalid_credentials")
        setError("Invalid email or password")
        setLoading(false)
        return
      }

      // Reset auth state on successful login (clears any stale session_expired state)
      authStore.setAuthenticated()
      trackLoginSuccess()
      identifyUser(data.userId ?? email, { email })

      // Redirect to chat
      router.push("/chat")
    } catch (error) {
      console.error("Login error:", error)
      setError("Connection failed")
      setLoading(false)
    }
  }

  function handleCreateAccount() {
    trackSignupStarted()
    openAuthModal({
      title: "Create your account",
      description: "Enter your email to get started",
      onSuccess: () => {
        router.push("/chat")
      },
    })
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-zinc-950 flex items-center justify-center px-4 relative">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Card Container with polish */}
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-lg border border-black/[0.08] dark:border-white/[0.08] ring-1 ring-black/[0.04] dark:ring-white/[0.04] p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-black dark:text-white mb-2">Welcome back</h1>
          <p className="text-black/50 dark:text-white/50">Sign in to continue to your workspace</p>
        </div>

        {/* Login Form */}
        <form onSubmit={login} className="space-y-5" autoComplete="off">
          <Input
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={e => {
              setEmail(e.target.value)
              if (error) setError("")
            }}
            onBlur={() => setEmailTouched(true)}
            placeholder="you@example.com"
            disabled={loading}
            autoComplete="email"
            state={emailTouched && !email.trim() ? "error" : "default"}
            errorMessage={emailTouched && !email.trim() ? "Please enter your email" : undefined}
            data-testid="email-input"
          />

          <Input
            id="password"
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={e => {
              setPassword(e.target.value)
              if (error) setError("")
            }}
            onBlur={() => setPasswordTouched(true)}
            placeholder="Enter your password"
            disabled={loading}
            autoComplete="current-password"
            state={passwordTouched && !password.trim() ? "error" : "default"}
            errorMessage={passwordTouched && !password.trim() ? "Please enter your password" : undefined}
            data-testid="password-input"
            suffix={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />

          {error && (
            <div className="bg-red-500/[0.08] dark:bg-red-500/[0.12] rounded-xl px-4 py-3">
              <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            fullWidth
            loading={loading}
            disabled={!email.trim() || !password.trim()}
            className="!bg-black dark:!bg-white !text-white dark:!text-black hover:!brightness-[0.85] active:!brightness-75 !border-0 !font-medium !text-base !py-3 !rounded-xl !transition-all !duration-150 disabled:!opacity-30 disabled:hover:!brightness-100"
            data-testid="login-button"
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
          <span className="text-sm text-black/40 dark:text-white/40">or</span>
          <div className="flex-1 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
        </div>

        {/* Create Account Section */}
        <button
          type="button"
          onClick={handleCreateAccount}
          className="w-full px-4 py-3 rounded-xl text-base font-medium bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] active:bg-black/[0.12] dark:active:bg-white/[0.14] text-black/80 dark:text-white/80 transition-all duration-150"
          data-testid="create-account-button"
        >
          Create Account
        </button>

        <p className="text-center text-sm text-black/40 dark:text-white/40 mt-4">
          New here? Create an account to get started.
        </p>
      </div>
    </main>
  )
}

function LoadingFallback() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-zinc-950 flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-lg border border-black/[0.08] dark:border-white/[0.08] ring-1 ring-black/[0.04] dark:ring-white/[0.04] p-8">
        <div className="text-center">
          {/* Friendly breathing animation */}
          <div className="relative w-14 h-14 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-400/20 alive-logo-outer" />
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-400/30 alive-logo-inner" />
            <div className="absolute inset-3 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500" />
          </div>
          <p className="text-black/70 dark:text-white/70 text-base font-medium mb-1">Just a moment</p>
          <p className="text-black/40 dark:text-white/40 text-sm">Getting everything ready</p>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginPageContent />
    </Suspense>
  )
}
