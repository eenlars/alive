package workspace

import (
	"net/http"
	"strings"

	"shell-server-go/internal/session"
)

const sessionCookieName = "shell_session"

func WorkspaceFromForm(r *http.Request, sessions *session.Store) string {
	if sessionWorkspace := SessionWorkspace(r, sessions); sessionWorkspace != "" {
		return sessionWorkspace
	}
	return WorkspaceFromRequestForm(r)
}

func WorkspaceFromQuery(r *http.Request, sessions *session.Store) string {
	if sessionWorkspace := SessionWorkspace(r, sessions); sessionWorkspace != "" {
		return sessionWorkspace
	}
	return WorkspaceFromRequestQuery(r)
}

func SessionWorkspace(r *http.Request, sessions *session.Store) string {
	if sessions == nil {
		return ""
	}

	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return ""
	}

	workspace, ok := sessions.GetWorkspace(cookie.Value)
	if !ok {
		return ""
	}
	return strings.TrimSpace(workspace)
}

func WorkspaceFromRequestForm(r *http.Request) string {
	workspace := r.FormValue("workspace")
	if workspace == "" {
		return "root"
	}
	return workspace
}

func WorkspaceFromRequestQuery(r *http.Request) string {
	workspace := r.URL.Query().Get("workspace")
	if workspace == "" {
		return "root"
	}
	return workspace
}
