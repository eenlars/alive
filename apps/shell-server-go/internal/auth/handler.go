package auth

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"

	"shell-server-go/internal/config"
	httpxmiddleware "shell-server-go/internal/httpx/middleware"
	"shell-server-go/internal/ratelimit"
	"shell-server-go/internal/session"
)

// Handler handles authentication routes.
type Handler struct {
	config   *config.AppConfig
	sessions *session.Store
	limiter  *ratelimit.Limiter
	service  *Service
}

// NewHandler creates a new auth handler.
func NewHandler(cfg *config.AppConfig, sessions *session.Store, limiter *ratelimit.Limiter) *Handler {
	return &Handler{
		config:   cfg,
		sessions: sessions,
		limiter:  limiter,
		service:  NewService(cfg),
	}
}

// Login handles login form submission.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
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

	h.limiter.Clear()

	scopedWorkspace, err := h.service.ResolveScopedWorkspace(r.FormValue("workspace"))
	if err != nil {
		http.Redirect(w, r, "/?error=invalid_workspace", http.StatusSeeOther)
		return
	}

	token := h.sessions.GenerateWithInfo(session.SessionInfo{
		UserAgent:  r.UserAgent(),
		RemoteAddr: r.RemoteAddr,
		Workspace:  scopedWorkspace,
	})

	secure := os.Getenv("NODE_ENV") == "production"
	http.SetCookie(w, &http.Cookie{
		Name:     httpxmiddleware.CookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   86400,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})

	if scopedWorkspace != "" {
		http.Redirect(w, r, "/shell?workspace="+url.QueryEscape(scopedWorkspace), http.StatusSeeOther)
		return
	}

	http.Redirect(w, r, "/dashboard", http.StatusSeeOther)
}

// Logout handles logout.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	token := httpxmiddleware.GetSessionToken(r)
	if token != "" {
		h.sessions.Delete(token)
	}

	secure := os.Getenv("NODE_ENV") == "production"
	http.SetCookie(w, &http.Cookie{
		Name:     httpxmiddleware.CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, r, "/?logged_out=1", http.StatusSeeOther)
}
