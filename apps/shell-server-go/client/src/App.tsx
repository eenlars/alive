import { useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { DashboardPage } from "./pages/DashboardPage"
import { EditPage } from "./pages/EditPage"
import { LoginPage } from "./pages/LoginPage"
import { ShellPage } from "./pages/ShellPage"
import { UploadPage } from "./pages/UploadPage"
import { useConfigStore } from "./store/config"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConfigStore()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="m-0 p-5 box-border font-sans bg-shell-bg min-h-screen flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, config } = useConfigStore()

  if (isLoading) {
    return (
      <div className="m-0 p-5 box-border font-sans bg-shell-bg min-h-screen flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    )
  }

  // If authenticated, redirect based on config
  if (isAuthenticated) {
    if (config?.allowWorkspaceSelection) {
      return <Navigate to="/dashboard" replace />
    }
    // No workspace selection - go directly to shell
    return <Navigate to={`/shell?workspace=${config?.shellDefaultPath || "root"}`} replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const fetchConfig = useConfigStore(s => s.fetchConfig)

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shell"
        element={
          <ProtectedRoute>
            <ShellPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <UploadPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/edit"
        element={
          <ProtectedRoute>
            <EditPage />
          </ProtectedRoute>
        }
      />
      {/* Fallback - redirect to login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
