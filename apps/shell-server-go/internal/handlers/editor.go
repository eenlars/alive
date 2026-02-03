package handlers

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
)

// EditorHandler handles editor API endpoints
type EditorHandler struct {
	config   *config.AppConfig
	resolver *PathResolver
}

// NewEditorHandler creates a new editor handler
func NewEditorHandler(cfg *config.AppConfig) *EditorHandler {
	return &EditorHandler{
		config:   cfg,
		resolver: NewPathResolver(cfg),
	}
}

// EditTreeNode represents a file tree node for the editor
type EditTreeNode struct {
	Name     string         `json:"name"`
	Path     string         `json:"path"`
	Type     string         `json:"type"`
	Children []EditTreeNode `json:"children,omitempty"`
}

// Image file extensions that can be displayed
var imageExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".ico": true, ".webp": true, ".bmp": true, ".svg": true,
}

// Binary file extensions that cannot be edited
var editorBinaryExtensions = map[string]bool{
	".pdf": true, ".zip": true, ".tar": true, ".gz": true, ".rar": true,
	".7z": true, ".mp3": true, ".mp4": true, ".wav": true, ".avi": true,
	".mov": true, ".mkv": true, ".exe": true, ".dll": true, ".so": true,
	".dylib": true, ".woff": true, ".woff2": true, ".ttf": true,
	".eot": true, ".otf": true, ".node": true, ".wasm": true,
}

// getMimeType returns the MIME type for an image extension
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

// ListFiles handles POST /api/edit/list-files
func (h *EditorHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Directory string `json:"directory"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if body.Directory == "" {
		jsonError(w, "No directory specified", http.StatusBadRequest)
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		jsonError(w, "Invalid directory", http.StatusBadRequest)
		return
	}

	if _, err := os.Stat(editableDir.Path); os.IsNotExist(err) {
		jsonResponse(w, map[string]interface{}{
			"error": "Directory not found",
			"path":  editableDir.Path,
		}, http.StatusNotFound)
		return
	}

	tree := buildEditTree(editableDir.Path, "", 0, 5)
	jsonResponse(w, map[string]interface{}{
		"path":  editableDir.Path,
		"label": editableDir.Label,
		"tree":  tree,
	})
}

func buildEditTree(dirPath, relativePath string, depth, maxDepth int) []EditTreeNode {
	if depth >= maxDepth {
		return nil
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil
	}

	var filtered []os.DirEntry
	for _, e := range entries {
		if !DefaultExcludedDirs[e.Name()] && !strings.HasPrefix(e.Name(), ".") {
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

	var nodes []EditTreeNode
	for _, entry := range filtered {
		entryRelPath := entry.Name()
		if relativePath != "" {
			entryRelPath = relativePath + "/" + entry.Name()
		}

		if entry.IsDir() {
			subPath := filepath.Join(dirPath, entry.Name())
			node := EditTreeNode{
				Name:     entry.Name(),
				Path:     entryRelPath,
				Type:     "directory",
				Children: buildEditTree(subPath, entryRelPath, depth+1, maxDepth),
			}
			nodes = append(nodes, node)
		} else {
			nodes = append(nodes, EditTreeNode{
				Name: entry.Name(),
				Path: entryRelPath,
				Type: "file",
			})
		}
	}
	return nodes
}

// ReadFile handles POST /api/edit/read-file
func (h *EditorHandler) ReadFile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Directory string `json:"directory"`
		Path      string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if body.Directory == "" {
		jsonError(w, "No directory specified", http.StatusBadRequest)
		return
	}
	if body.Path == "" {
		jsonError(w, "No file path provided", http.StatusBadRequest)
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		jsonError(w, "Invalid directory", http.StatusBadRequest)
		return
	}

	// Use centralized path resolution
	resolvedPath, err := h.resolver.ResolveSafePath(editableDir.Path, body.Path)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	info, err := os.Stat(resolvedPath)
	if os.IsNotExist(err) {
		jsonError(w, "File not found", http.StatusNotFound)
		return
	}

	// Size limit 2MB
	if info.Size() > MaxEditFileSize {
		jsonResponse(w, map[string]interface{}{
			"error": "File too large for editing (max 2MB)",
			"size":  info.Size(),
		}, http.StatusRequestEntityTooLarge)
		return
	}

	ext := strings.ToLower(filepath.Ext(body.Path))

	// Handle images
	if imageExtensions[ext] {
		data, err := os.ReadFile(resolvedPath)
		if err != nil {
			jsonError(w, "Failed to read file", http.StatusInternalServerError)
			return
		}

		mimeType := getMimeType(ext)
		base64Data := base64.StdEncoding.EncodeToString(data)
		jsonResponse(w, map[string]interface{}{
			"image":    true,
			"dataUrl":  fmt.Sprintf("data:%s;base64,%s", mimeType, base64Data),
			"path":     resolvedPath,
			"filename": filepath.Base(body.Path),
			"size":     info.Size(),
			"mtime":    info.ModTime().UnixMilli(),
		})
		return
	}

	// Check binary
	if editorBinaryExtensions[ext] {
		jsonResponse(w, map[string]interface{}{
			"error":     "Binary file cannot be edited",
			"binary":    true,
			"extension": ext,
		}, http.StatusUnsupportedMediaType)
		return
	}

	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		jsonError(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"content":  string(content),
		"path":     resolvedPath,
		"filename": filepath.Base(body.Path),
		"size":     info.Size(),
		"mtime":    info.ModTime().UnixMilli(),
	})
}

// WriteFile handles POST /api/edit/write-file
func (h *EditorHandler) WriteFile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Directory string `json:"directory"`
		Path      string `json:"path"`
		Content   string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if body.Directory == "" {
		jsonError(w, "No directory specified", http.StatusBadRequest)
		return
	}
	if body.Path == "" {
		jsonError(w, "No file path provided", http.StatusBadRequest)
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		jsonError(w, "Invalid directory", http.StatusBadRequest)
		return
	}

	// Use centralized path resolution
	resolvedPath, err := h.resolver.ResolveSafePath(editableDir.Path, body.Path)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	// Size limit 2MB
	contentSize := len([]byte(body.Content))
	if contentSize > MaxEditFileSize {
		jsonResponse(w, map[string]interface{}{
			"error": "Content too large (max 2MB)",
			"size":  contentSize,
		}, http.StatusRequestEntityTooLarge)
		return
	}

	// Ensure parent directory exists
	parentDir := filepath.Dir(resolvedPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		jsonError(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	// Write file with 644 permissions
	if err := os.WriteFile(resolvedPath, []byte(body.Content), 0644); err != nil {
		jsonError(w, "Failed to write file", http.StatusInternalServerError)
		return
	}

	// Get new mtime
	info, _ := os.Stat(resolvedPath)

	jsonResponse(w, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Saved %s", body.Path),
		"path":    resolvedPath,
		"size":    contentSize,
		"mtime":   info.ModTime().UnixMilli(),
	})
}

// CheckMtimes handles POST /api/edit/check-mtimes
func (h *EditorHandler) CheckMtimes(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Directory string `json:"directory"`
		Files     []struct {
			Path  string `json:"path"`
			Mtime int64  `json:"mtime"`
		} `json:"files"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if body.Directory == "" {
		jsonError(w, "No directory specified", http.StatusBadRequest)
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		jsonError(w, "Invalid directory", http.StatusBadRequest)
		return
	}

	type FileResult struct {
		Path    string `json:"path"`
		Changed bool   `json:"changed"`
		Mtime   int64  `json:"mtime"`
		Deleted bool   `json:"deleted,omitempty"`
	}

	var results []FileResult
	for _, file := range body.Files {
		// Use centralized path resolution
		resolvedPath, err := h.resolver.ResolveSafePath(editableDir.Path, file.Path)
		if err != nil {
			// Skip files with invalid paths (security check failed)
			continue
		}

		info, err := os.Stat(resolvedPath)
		if os.IsNotExist(err) {
			results = append(results, FileResult{
				Path:    file.Path,
				Changed: true,
				Mtime:   0,
				Deleted: true,
			})
			continue
		}

		currentMtime := info.ModTime().UnixMilli()
		results = append(results, FileResult{
			Path:    file.Path,
			Changed: currentMtime != file.Mtime,
			Mtime:   currentMtime,
		})
	}

	jsonResponse(w, map[string]interface{}{"results": results})
}

// Delete handles POST /api/edit/delete
func (h *EditorHandler) Delete(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Directory string `json:"directory"`
		Path      string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if body.Directory == "" {
		jsonError(w, "No directory specified", http.StatusBadRequest)
		return
	}
	if body.Path == "" {
		jsonError(w, "No path provided", http.StatusBadRequest)
		return
	}

	// Prevent root deletion
	if body.Path == "/" || body.Path == "." {
		jsonError(w, "Cannot delete root directory", http.StatusBadRequest)
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		jsonError(w, "Invalid directory", http.StatusBadRequest)
		return
	}

	// Use centralized path resolution
	resolvedPath, err := h.resolver.ResolveSafePath(editableDir.Path, body.Path)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	// Additional check: cannot delete the editable directory root
	if err := h.resolver.ValidateNotRoot(editableDir.Path, resolvedPath); err != nil {
		h.handlePathError(w, err)
		return
	}

	info, err := os.Stat(resolvedPath)
	if os.IsNotExist(err) {
		jsonError(w, "Path not found", http.StatusNotFound)
		return
	}

	isDirectory := info.IsDir()
	typeStr := "file"
	if isDirectory {
		typeStr = "directory"
	}

	if err := os.RemoveAll(resolvedPath); err != nil {
		jsonError(w, "Failed to delete", http.StatusInternalServerError)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"success":     true,
		"message":     fmt.Sprintf("Deleted %s: %s", typeStr, body.Path),
		"deletedPath": body.Path,
		"type":        typeStr,
	})
}

// Copy handles POST /api/edit/copy
func (h *EditorHandler) Copy(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Directory   string `json:"directory"`
		Source      string `json:"source"`
		Destination string `json:"destination"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if body.Directory == "" {
		jsonError(w, "No directory specified", http.StatusBadRequest)
		return
	}
	if body.Source == "" || body.Destination == "" {
		jsonError(w, "Source and destination paths required", http.StatusBadRequest)
		return
	}

	editableDir := h.config.GetEditableDirectory(body.Directory)
	if editableDir == nil {
		jsonError(w, "Invalid directory", http.StatusBadRequest)
		return
	}

	// Use centralized path resolution for both paths
	resolvedSource, err := h.resolver.ResolveSafePath(editableDir.Path, body.Source)
	if err != nil {
		jsonError(w, "Invalid source path", http.StatusBadRequest)
		return
	}

	resolvedDest, err := h.resolver.ResolveSafePath(editableDir.Path, body.Destination)
	if err != nil {
		jsonError(w, "Invalid destination path", http.StatusBadRequest)
		return
	}

	if _, err := os.Stat(resolvedSource); os.IsNotExist(err) {
		jsonError(w, "Source file not found", http.StatusNotFound)
		return
	}

	if _, err := os.Stat(resolvedDest); err == nil {
		jsonError(w, "Destination already exists", http.StatusConflict)
		return
	}

	// Ensure parent directory exists
	parentDir := filepath.Dir(resolvedDest)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		jsonError(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	// Copy file
	srcFile, err := os.Open(resolvedSource)
	if err != nil {
		jsonError(w, "Failed to open source file", http.StatusInternalServerError)
		return
	}
	defer srcFile.Close()

	dstFile, err := os.Create(resolvedDest)
	if err != nil {
		jsonError(w, "Failed to create destination file", http.StatusInternalServerError)
		return
	}
	defer dstFile.Close()

	if _, err := io.Copy(dstFile, srcFile); err != nil {
		jsonError(w, "Failed to copy file", http.StatusInternalServerError)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"success":    true,
		"message":    fmt.Sprintf("Copied to %s", body.Destination),
		"sourcePath": body.Source,
		"destPath":   body.Destination,
	})
}

// handlePathError converts path security errors to appropriate HTTP responses
func (h *EditorHandler) handlePathError(w http.ResponseWriter, err error) {
	HandlePathSecurityError(w, err)
}
