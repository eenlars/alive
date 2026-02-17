package editor

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"shell-server-go/internal/config"
	"shell-server-go/internal/httpx/response"
	"shell-server-go/internal/session"
	workspacepkg "shell-server-go/internal/workspace"
)

const MaxEditFileSize = 2 << 20

// Handler handles editor API endpoints.
type Handler struct {
	config   *config.AppConfig
	sessions *session.Store
	resolver *workspacepkg.Resolver
}

// NewHandler creates a new editor handler.
func NewHandler(cfg *config.AppConfig, sessions *session.Store) *Handler {
	return &Handler{
		config:   cfg,
		sessions: sessions,
		resolver: workspacepkg.NewResolver(cfg),
	}
}

// TreeNode represents a file tree node for the editor.
type TreeNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	Type     string     `json:"type"`
	Children []TreeNode `json:"children,omitempty"`
}

var imageExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".ico": true, ".webp": true, ".bmp": true, ".svg": true,
}

var binaryExtensions = map[string]bool{
	".pdf": true, ".zip": true, ".tar": true, ".gz": true, ".rar": true,
	".7z": true, ".mp3": true, ".mp4": true, ".wav": true, ".avi": true,
	".mov": true, ".mkv": true, ".exe": true, ".dll": true, ".so": true,
	".dylib": true, ".woff": true, ".woff2": true, ".ttf": true,
	".eot": true, ".otf": true, ".node": true, ".wasm": true,
}

func getMimeType(ext string) string {
	switch ext {
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	case ".jpg":
		return "image/jpeg"
	default:
		return "image/" + strings.TrimPrefix(ext, ".")
	}
}

// ListFiles handles POST /api/edit/list-files.
func (h *Handler) ListFiles(w http.ResponseWriter, r *http.Request) {
	if !h.ensureSessionCanUseEditor(w, r) {
		return
	}

	var body struct {
		Directory string `json:"directory"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if body.Directory == "" {
		response.Error(w, http.StatusBadRequest, "No directory specified")
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		response.Error(w, http.StatusBadRequest, "Invalid directory")
		return
	}

	if _, err := os.Stat(editableDir.Path); os.IsNotExist(err) {
		response.JSON(w, http.StatusNotFound, map[string]any{
			"error": "Directory not found",
			"path":  editableDir.Path,
		})
		return
	}

	tree := buildTree(editableDir.Path, "", 0, 5)
	response.JSON(w, http.StatusOK, map[string]any{
		"path":  editableDir.Path,
		"label": editableDir.Label,
		"tree":  tree,
	})
}

func buildTree(dirPath, relativePath string, depth, maxDepth int) []TreeNode {
	if depth >= maxDepth {
		return nil
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil
	}

	var filtered []os.DirEntry
	for _, e := range entries {
		if !workspacepkg.DefaultExcludedDirs[e.Name()] && !strings.HasPrefix(e.Name(), ".") {
			filtered = append(filtered, e)
		}
	}

	sort.Slice(filtered, func(i, j int) bool {
		iDir := filtered[i].IsDir()
		jDir := filtered[j].IsDir()
		if iDir != jDir {
			return iDir
		}
		return filtered[i].Name() < filtered[j].Name()
	})

	var nodes []TreeNode
	for _, entry := range filtered {
		entryRelPath := entry.Name()
		if relativePath != "" {
			entryRelPath = relativePath + "/" + entry.Name()
		}

		if entry.IsDir() {
			nodes = append(nodes, TreeNode{
				Name:     entry.Name(),
				Path:     entryRelPath,
				Type:     "directory",
				Children: buildTree(filepath.Join(dirPath, entry.Name()), entryRelPath, depth+1, maxDepth),
			})
			continue
		}

		nodes = append(nodes, TreeNode{Name: entry.Name(), Path: entryRelPath, Type: "file"})
	}

	return nodes
}

// ReadFile handles POST /api/edit/read-file.
func (h *Handler) ReadFile(w http.ResponseWriter, r *http.Request) {
	if !h.ensureSessionCanUseEditor(w, r) {
		return
	}

	var body struct {
		Directory string `json:"directory"`
		Path      string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if body.Directory == "" {
		response.Error(w, http.StatusBadRequest, "No directory specified")
		return
	}
	if body.Path == "" {
		response.Error(w, http.StatusBadRequest, "No file path provided")
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		response.Error(w, http.StatusBadRequest, "Invalid directory")
		return
	}

	resolvedPath, err := h.resolver.ResolveSafePath(editableDir.Path, body.Path)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	info, err := os.Stat(resolvedPath)
	if os.IsNotExist(err) {
		response.Error(w, http.StatusNotFound, "File not found")
		return
	}

	if info.Size() > MaxEditFileSize {
		response.JSON(w, http.StatusRequestEntityTooLarge, map[string]any{
			"error": "File too large for editing (max 2MB)",
			"size":  info.Size(),
		})
		return
	}

	ext := strings.ToLower(filepath.Ext(body.Path))
	if imageExtensions[ext] {
		data, err := os.ReadFile(resolvedPath)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "Failed to read file")
			return
		}
		base64Data := base64.StdEncoding.EncodeToString(data)
		response.JSON(w, http.StatusOK, map[string]any{
			"image":    true,
			"dataUrl":  fmt.Sprintf("data:%s;base64,%s", getMimeType(ext), base64Data),
			"path":     resolvedPath,
			"filename": filepath.Base(body.Path),
			"size":     info.Size(),
			"mtime":    info.ModTime().UnixMilli(),
		})
		return
	}

	if binaryExtensions[ext] {
		response.JSON(w, http.StatusUnsupportedMediaType, map[string]any{
			"error":     "Binary file cannot be edited",
			"binary":    true,
			"extension": ext,
		})
		return
	}

	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to read file")
		return
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"content":  string(content),
		"path":     resolvedPath,
		"filename": filepath.Base(body.Path),
		"size":     info.Size(),
		"mtime":    info.ModTime().UnixMilli(),
	})
}

// WriteFile handles POST /api/edit/write-file.
func (h *Handler) WriteFile(w http.ResponseWriter, r *http.Request) {
	if !h.ensureSessionCanUseEditor(w, r) {
		return
	}

	var body struct {
		Directory string `json:"directory"`
		Path      string `json:"path"`
		Content   string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if body.Directory == "" {
		response.Error(w, http.StatusBadRequest, "No directory specified")
		return
	}
	if body.Path == "" {
		response.Error(w, http.StatusBadRequest, "No file path provided")
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		response.Error(w, http.StatusBadRequest, "Invalid directory")
		return
	}

	resolvedPath, err := h.resolver.ResolveSafePath(editableDir.Path, body.Path)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	contentSize := len([]byte(body.Content))
	if contentSize > MaxEditFileSize {
		response.JSON(w, http.StatusRequestEntityTooLarge, map[string]any{
			"error": "Content too large (max 2MB)",
			"size":  contentSize,
		})
		return
	}

	if err := os.MkdirAll(filepath.Dir(resolvedPath), 0755); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create directory")
		return
	}

	if err := os.WriteFile(resolvedPath, []byte(body.Content), 0644); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to write file")
		return
	}

	info, _ := os.Stat(resolvedPath)
	response.JSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": fmt.Sprintf("Saved %s", body.Path),
		"path":    resolvedPath,
		"size":    contentSize,
		"mtime":   info.ModTime().UnixMilli(),
	})
}

// CheckMtimes handles POST /api/edit/check-mtimes.
func (h *Handler) CheckMtimes(w http.ResponseWriter, r *http.Request) {
	if !h.ensureSessionCanUseEditor(w, r) {
		return
	}

	var body struct {
		Directory string `json:"directory"`
		Files     []struct {
			Path  string `json:"path"`
			Mtime int64  `json:"mtime"`
		} `json:"files"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if body.Directory == "" {
		response.Error(w, http.StatusBadRequest, "No directory specified")
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		response.Error(w, http.StatusBadRequest, "Invalid directory")
		return
	}

	type fileResult struct {
		Path    string `json:"path"`
		Changed bool   `json:"changed"`
		Mtime   int64  `json:"mtime"`
		Deleted bool   `json:"deleted,omitempty"`
	}

	var results []fileResult
	for _, file := range body.Files {
		resolvedPath, err := h.resolver.ResolveSafePath(editableDir.Path, file.Path)
		if err != nil {
			continue
		}

		info, err := os.Stat(resolvedPath)
		if os.IsNotExist(err) {
			results = append(results, fileResult{Path: file.Path, Changed: true, Mtime: 0, Deleted: true})
			continue
		}

		currentMtime := info.ModTime().UnixMilli()
		results = append(results, fileResult{Path: file.Path, Changed: currentMtime != file.Mtime, Mtime: currentMtime})
	}

	response.JSON(w, http.StatusOK, map[string]any{"results": results})
}

// Delete handles POST /api/edit/delete.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	if !h.ensureSessionCanUseEditor(w, r) {
		return
	}

	var body struct {
		Directory string `json:"directory"`
		Path      string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if body.Directory == "" {
		response.Error(w, http.StatusBadRequest, "No directory specified")
		return
	}
	if body.Path == "" {
		response.Error(w, http.StatusBadRequest, "No path provided")
		return
	}
	if body.Path == "/" || body.Path == "." {
		response.Error(w, http.StatusBadRequest, "Cannot delete root directory")
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		response.Error(w, http.StatusBadRequest, "Invalid directory")
		return
	}

	resolvedPath, err := h.resolver.ResolveSafePath(editableDir.Path, body.Path)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	if err := h.resolver.ValidateNotRoot(editableDir.Path, resolvedPath); err != nil {
		h.handlePathError(w, err)
		return
	}

	info, err := os.Stat(resolvedPath)
	if os.IsNotExist(err) {
		response.Error(w, http.StatusNotFound, "Path not found")
		return
	}

	typeStr := "file"
	if info.IsDir() {
		typeStr = "directory"
	}

	if err := os.RemoveAll(resolvedPath); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to delete")
		return
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"success":     true,
		"message":     fmt.Sprintf("Deleted %s: %s", typeStr, body.Path),
		"deletedPath": body.Path,
		"type":        typeStr,
	})
}

// Copy handles POST /api/edit/copy.
func (h *Handler) Copy(w http.ResponseWriter, r *http.Request) {
	if !h.ensureSessionCanUseEditor(w, r) {
		return
	}

	var body struct {
		Directory   string `json:"directory"`
		Source      string `json:"source"`
		Destination string `json:"destination"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if body.Directory == "" {
		response.Error(w, http.StatusBadRequest, "No directory specified")
		return
	}
	if body.Source == "" || body.Destination == "" {
		response.Error(w, http.StatusBadRequest, "Source and destination paths required")
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		response.Error(w, http.StatusBadRequest, "Invalid directory")
		return
	}

	resolvedSource, err := h.resolver.ResolveSafePath(editableDir.Path, body.Source)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid source path")
		return
	}

	resolvedDest, err := h.resolver.ResolveSafePath(editableDir.Path, body.Destination)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid destination path")
		return
	}

	if _, err := os.Stat(resolvedSource); os.IsNotExist(err) {
		response.Error(w, http.StatusNotFound, "Source file not found")
		return
	}
	if _, err := os.Stat(resolvedDest); err == nil {
		response.Error(w, http.StatusConflict, "Destination already exists")
		return
	}

	if err := os.MkdirAll(filepath.Dir(resolvedDest), 0755); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create directory")
		return
	}

	srcFile, err := os.Open(resolvedSource)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to open source file")
		return
	}
	defer srcFile.Close()

	dstFile, err := os.Create(resolvedDest)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create destination file")
		return
	}
	defer dstFile.Close()

	if _, err := io.Copy(dstFile, srcFile); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to copy file")
		return
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"success":    true,
		"message":    fmt.Sprintf("Copied to %s", body.Destination),
		"sourcePath": body.Source,
		"destPath":   body.Destination,
	})
}

func (h *Handler) handlePathError(w http.ResponseWriter, err error) {
	workspacepkg.HandlePathSecurityError(w, err)
}

func (h *Handler) ensureSessionCanUseEditor(w http.ResponseWriter, r *http.Request) bool {
	if scopedWorkspace := workspacepkg.SessionWorkspace(r, h.sessions); scopedWorkspace != "" {
		response.Error(w, http.StatusForbidden, "Editor is unavailable for workspace-scoped sessions")
		return false
	}
	return true
}
