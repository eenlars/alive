package middleware

import (
	"net/http"

	legacy "shell-server-go/internal/middleware"
	"shell-server-go/internal/session"
)

const CookieName = legacy.CookieName

func Auth(sessions *session.Store) func(http.Handler) http.Handler {
	return legacy.Auth(sessions)
}

func AuthAPI(sessions *session.Store) func(http.Handler) http.Handler {
	return legacy.AuthAPI(sessions)
}

func GetSessionToken(r *http.Request) string {
	return legacy.GetSessionToken(r)
}

func IsAuthenticated(r *http.Request, sessions *session.Store) bool {
	return legacy.IsAuthenticated(r, sessions)
}

func Gzip(next http.Handler) http.Handler {
	return legacy.Gzip(next)
}
