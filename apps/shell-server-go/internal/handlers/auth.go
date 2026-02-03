package handlers

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"shell-server-go/internal/config"
	"shell-server-go/internal/middleware"
	"shell-server-go/internal/ratelimit"
	"shell-server-go/internal/session"
)

// AuthHandler handles authentication routes
type AuthHandler struct {
	config   *config.AppConfig
	sessions *session.Store
	limiter  *ratelimit.Limiter
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(cfg *config.AppConfig, sessions *session.Store, limiter *ratelimit.Limiter) *AuthHandler {
	return &AuthHandler{
		config:   cfg,
		sessions: sessions,
		limiter:  limiter,
	}
}

// Login handles login form submission
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	// Check rate limiting
	result := h.limiter.Check()
	if result.Limited {
		http.Redirect(w, r, fmt.Sprintf("/?error=rate_limit&wait=%d", result.WaitMinutes), http.StatusSeeOther)
		return
	}

	if err := r.ParseForm(); err != nil {
		http.Redirect(w, r, "/?error=invalid", http.StatusSeeOther)
		return
	}

	password := r.FormValue("password")
	if password != h.config.ShellPassword {
		remaining := h.limiter.RecordFailure()
		http.Redirect(w, r, fmt.Sprintf("/?error=invalid&remaining=%d", remaining), http.StatusSeeOther)
		return
	}

	// Clear failed attempts on success
	h.limiter.Clear()

	// Create session
	token := h.sessions.Generate()

	// Set cookie
	secure := os.Getenv("NODE_ENV") == "production"
	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, r, "/dashboard", http.StatusSeeOther)
}

// Logout handles logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	// Delete session
	token := middleware.GetSessionToken(r)
	if token != "" {
		h.sessions.Delete(token)
	}

	// Clear cookie - must match all attributes from login cookie
	secure := os.Getenv("NODE_ENV") == "production"
	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1, // Delete immediately
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, r, "/?logged_out=1", http.StatusSeeOther)
}
