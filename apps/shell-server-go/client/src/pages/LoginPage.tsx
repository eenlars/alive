import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useConfigStore } from "../store/config"

export function LoginPage() {
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const _navigate = useNavigate()
  const fetchConfig = useConfigStore(s => s.fetchConfig)

  const errorType = searchParams.get("error")
  const wait = searchParams.get("wait")
  const remaining = searchParams.get("remaining")
  const loggedOut = searchParams.get("logged_out")

  let errorMessage = ""
  let successMessage = ""
  if (loggedOut) {
    successMessage = "You have been logged out."
  } else if (errorType === "rate_limit") {
    errorMessage = `Too many failed attempts. Please wait ${wait || "15"} minutes.`
  } else if (errorType === "invalid") {
    errorMessage = remaining ? `Invalid password (${remaining} attempts remaining)` : "Invalid password"
  } else if (errorType === "network") {
    errorMessage = "Network error. Please try again."
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)

    // Use URLSearchParams to properly encode special characters (+ = etc)
    const params = new URLSearchParams()
    params.append("password", password)

    try {
      const res = await fetch("/login", {
        method: "POST",
        body: params,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        redirect: "follow",
        credentials: "same-origin",
      })

      // If we got redirected to dashboard (success) or back to login (error)
      // The URL will tell us what happened
      if (res.url.includes("/dashboard") || res.ok) {
        // Success - refresh config store to update isAuthenticated
        await fetchConfig()
        // fetchConfig will set isAuthenticated=true, then PublicRoute will redirect
        return
      }

      // Check for error in the final URL
      const finalUrl = new URL(res.url)
      const error = finalUrl.searchParams.get("error")
      if (error) {
        window.location.href = res.url
      } else {
        // Fallback - reload to see server response
        window.location.reload()
      }
    } catch {
      setIsLoading(false)
      window.location.href = "/?error=network"
    }
  }

  return (
    <div className="m-0 p-5 box-border font-sans bg-shell-bg min-h-screen flex items-center justify-center">
      <div className="bg-shell-surface p-10 md:p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-white text-2xl md:text-xl font-semibold text-center mb-6">Shell Access</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="p-3.5 border border-shell-border bg-shell-bg text-white rounded text-base focus:outline-none focus:border-shell-accent"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="p-3.5 bg-shell-accent hover:bg-shell-accent-hover active:bg-emerald-700 disabled:opacity-50 text-white border-none rounded text-base font-semibold cursor-pointer touch-manipulation transition-colors"
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
          {successMessage && <p className="text-green-500 text-sm text-center mt-2">{successMessage}</p>}
          {errorMessage && <p className="text-red-500 text-sm text-center mt-2">{errorMessage}</p>}
        </form>
      </div>
    </div>
  )
}
