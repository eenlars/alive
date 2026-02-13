"use client"

import { Eye, EyeOff } from "lucide-react"
import { useRouter } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { GlowCard } from "@/components/login/GlowCard"
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

      authStore.setAuthenticated()
      trackLoginSuccess()
      identifyUser(data.userId ?? email, { email })
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
    <main className="min-h-screen bg-gray-50 dark:bg-[#05060f] flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <GlowCard>
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-400/20 alive-logo-outer" />
              <div className="absolute inset-1.5 rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-400/30 alive-logo-inner" />
              <div className="absolute inset-2.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-6">Sign in to Alive</h1>

          {/* Form */}
          <form onSubmit={login} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-[13px] font-medium text-gray-600 dark:text-white/60 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value)
                  if (error) setError("")
                }}
                placeholder="you@example.com"
                disabled={loading}
                autoComplete="email"
                className="login-input"
                data-testid="email-input"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-[13px] font-medium text-gray-600 dark:text-white/60 mb-1.5"
              >
                Password
              </label>
              <div className="login-input-password-wrapper">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value)
                    if (error) setError("")
                  }}
                  placeholder="Enter your password"
                  disabled={loading}
                  autoComplete="current-password"
                  className="login-input"
                  data-testid="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-input-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 rounded-lg px-3.5 py-2.5">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Sign In */}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="login-btn-primary"
              data-testid="login-button"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-gray-500 dark:text-white/40 mt-6">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={handleCreateAccount}
              className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
              data-testid="create-account-button"
            >
              Sign up
            </button>
          </p>
        </GlowCard>
      </div>
    </main>
  )
}

function LoadingFallback() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#05060f] flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <GlowCard>
          <div className="text-center">
            <div className="relative w-10 h-10 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-400/20 alive-logo-outer" />
              <div className="absolute inset-1.5 rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-400/30 alive-logo-inner" />
              <div className="absolute inset-2.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500" />
            </div>
            <p className="text-gray-600 dark:text-white/70 text-sm font-medium">Just a moment...</p>
          </div>
        </GlowCard>
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
