package middleware

import (
	"net/http"

	"shell-server-go/internal/httpx/response"
	"shell-server-go/internal/session"
)

const CookieName = "shell_session"

// Auth creates an authentication middleware
func Auth(sessions *session.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(CookieName)
			if err != nil || !sessions.Valid(cookie.Value) {
				http.Redirect(w, r, "/", http.StatusSeeOther)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// AuthAPI creates an authentication middleware for API endpoints
func AuthAPI(sessions *session.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(CookieName)
			if err != nil || !sessions.Valid(cookie.Value) {
				response.Unauthorized(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// GetSessionToken extracts session token from request
func GetSessionToken(r *http.Request) string {
	cookie, err := r.Cookie(CookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

// IsAuthenticated checks if request has valid session
func IsAuthenticated(r *http.Request, sessions *session.Store) bool {
	token := GetSessionToken(r)
	return token != "" && sessions.Valid(token)
}
