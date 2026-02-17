package app

import (
	"errors"
	"io/fs"
	"net/http"
	"strings"

	httpxmiddleware "shell-server-go/internal/httpx/middleware"
	"shell-server-go/internal/httpx/response"
)

// Router builds the full HTTP routing tree.
func (a *ServerApp) Router() (http.Handler, error) {
	if a == nil {
		return nil, errors.New("server app is nil")
	}
	if a.ClientFS == nil {
		return nil, errors.New("client filesystem is not configured")
	}

	mux := http.NewServeMux()
	authAPIMiddleware := httpxmiddleware.AuthAPI(a.Sessions)

	mux.HandleFunc("POST /login", a.AuthHandler.Login)
	mux.HandleFunc("/logout", a.AuthHandler.Logout)

	mux.Handle("GET /api/config", authAPIMiddleware(http.HandlerFunc(a.FileHandler.Config)))
	mux.HandleFunc("/health", a.FileHandler.Health)

	mux.HandleFunc("/ws", a.WSHandler.Handle)
	mux.Handle("POST /api/ws-lease", authAPIMiddleware(http.HandlerFunc(a.WSHandler.CreateLease)))
	mux.HandleFunc("POST /internal/lease", a.WSHandler.CreateInternalLease)

	mux.Handle("POST /api/check-directory", authAPIMiddleware(http.HandlerFunc(a.FileHandler.CheckDirectory)))
	mux.Handle("POST /api/create-directory", authAPIMiddleware(http.HandlerFunc(a.FileHandler.CreateDirectory)))
	mux.Handle("POST /api/upload", authAPIMiddleware(http.HandlerFunc(a.FileHandler.Upload)))
	mux.Handle("POST /api/list-files", authAPIMiddleware(http.HandlerFunc(a.FileHandler.ListFiles)))
	mux.Handle("POST /api/read-file", authAPIMiddleware(http.HandlerFunc(a.FileHandler.ReadFile)))
	mux.Handle("GET /api/download-file", authAPIMiddleware(http.HandlerFunc(a.FileHandler.DownloadFile)))
	mux.Handle("POST /api/delete-folder", authAPIMiddleware(http.HandlerFunc(a.FileHandler.DeleteFolder)))
	mux.Handle("GET /api/sites", authAPIMiddleware(http.HandlerFunc(a.FileHandler.ListSites)))

	mux.Handle("POST /api/edit/list-files", authAPIMiddleware(http.HandlerFunc(a.EditorHandler.ListFiles)))
	mux.Handle("POST /api/edit/read-file", authAPIMiddleware(http.HandlerFunc(a.EditorHandler.ReadFile)))
	mux.Handle("POST /api/edit/write-file", authAPIMiddleware(http.HandlerFunc(a.EditorHandler.WriteFile)))
	mux.Handle("POST /api/edit/check-mtimes", authAPIMiddleware(http.HandlerFunc(a.EditorHandler.CheckMtimes)))
	mux.Handle("POST /api/edit/delete", authAPIMiddleware(http.HandlerFunc(a.EditorHandler.Delete)))
	mux.Handle("POST /api/edit/copy", authAPIMiddleware(http.HandlerFunc(a.EditorHandler.Copy)))

	mux.Handle("GET /api/templates", authAPIMiddleware(http.HandlerFunc(a.TemplateHandler.ListTemplates)))
	mux.Handle("POST /api/templates", authAPIMiddleware(http.HandlerFunc(a.TemplateHandler.CreateTemplate)))
	mux.Handle("GET /api/templates/{id}", authAPIMiddleware(http.HandlerFunc(a.TemplateHandler.GetTemplate)))
	mux.Handle("PUT /api/templates/{id}", authAPIMiddleware(http.HandlerFunc(a.TemplateHandler.SaveTemplate)))

	mux.Handle("/", createSPAHandler(a.ClientFS))
	return mux, nil
}

func createSPAHandler(clientFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(clientFS))

	return httpxmiddleware.Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "" {
			path = "/"
		}

		if path != "/" {
			filePath := strings.TrimPrefix(path, "/")
			if f, err := clientFS.Open(filePath); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		indexFile, err := fs.ReadFile(clientFS, "index.html")
		if err != nil {
			response.InternalServerError(w)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(indexFile)
	}))
}
