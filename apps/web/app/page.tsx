"use client"

import { FREE_CREDITS } from "@webalive/shared"
import { Eye, EyeOff, Rocket } from "lucide-react"
import { useRouter } from "next/navigation"
import { Suspense, useState } from "react"
import { Button } from "@/components/ui/primitives/Button"
import { Input } from "@/components/ui/primitives/Input"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { authStore } from "@/lib/stores/authStore"

function LoginPageContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const router = useRouter()

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const loginResponse = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })

      const data = await loginResponse.json()

      if (!loginResponse.ok || !data.ok) {
        setError("Invalid email or password")
        setLoading(false)
        return
      }

      // Reset auth state on successful login (clears any stale session_expired state)
      authStore.setAuthenticated()

      // Redirect to chat
      router.push("/chat")
    } catch (error) {
      console.error("Login error:", error)
      setError("Connection failed")
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center px-4 relative">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        {/* New User CTA */}
        <div className="mb-12 p-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800/30 rounded-2xl">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl">
              <Rocket className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100 mb-1">New here?</h2>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                Deploy your first website with {FREE_CREDITS} free credits.
              </p>
              <Button
                type="button"
                onClick={() => router.push("/deploy")}
                className="bg-emerald-600! hover:bg-emerald-700! text-white! border-0! font-medium! text-sm! py-2.5! px-5! rounded-lg! transition-all! normal-case! tracking-normal!"
              >
                Get Started Free
              </Button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
          <span className="text-sm text-black/40 dark:text-white/40 font-medium">or sign in</span>
          <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
        </div>

        {/* Login Form */}
        <form onSubmit={login} className="space-y-6" autoComplete="off">
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
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/30 rounded-lg px-4 py-3">
              <p className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            fullWidth
            loading={loading}
            disabled={!email.trim() || !password.trim()}
            className="!bg-black dark:!bg-white !text-white dark:!text-black hover:!bg-black/90 dark:hover:!bg-white/90 !border-0 !font-medium !text-base !py-3 !rounded-lg !transition-all"
            data-testid="login-button"
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </main>
  )
}

function LoadingFallback() {
  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md text-center">
        {/* Friendly breathing animation instead of spinner */}
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-400/20 alive-logo-outer" />
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-400/30 alive-logo-inner" />
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500" />
        </div>
        <p className="text-black/70 dark:text-white/70 text-base font-medium mb-1">Just a moment</p>
        <p className="text-black/40 dark:text-white/40 text-sm">Getting everything ready for you</p>
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
