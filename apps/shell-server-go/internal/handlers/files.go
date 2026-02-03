package handlers

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"shell-server-go/internal/config"
	"shell-server-go/internal/logger"
)

// File operation constants
const (
	// MaxZipEntries is the maximum number of files in a ZIP archive
	MaxZipEntries = 10000
	// MaxZipTotalSize is the maximum total uncompressed size of a ZIP archive (500MB)
	MaxZipTotalSize = 500 << 20
	// MaxZipCompressionRatio is the maximum compression ratio to prevent zip bombs
	MaxZipCompressionRatio = 100
	// MaxEditFileSize is the maximum file size for editing (2MB)
	MaxEditFileSize = 2 << 20
)

var filesLog = logger.WithComponent("FILES")

// FileHandler handles file operations
type FileHandler struct {
	config   *config.AppConfig
	resolver *PathResolver
}

// NewFileHandler creates a new file handler
func NewFileHandler(cfg *config.AppConfig) *FileHandler {
	return &FileHandler{
		config:   cfg,
		resolver: NewPathResolver(cfg),
	}
}

// TreeNode represents a file tree node
type TreeNode struct {
	Text     string     `json:"text"`
	Icon     string     `json:"icon"`
	State    *NodeState `json:"state,omitempty"`
	Data     NodeData   `json:"data"`
	Children []TreeNode `json:"children,omitempty"`
}

// NodeState represents node state in tree
type NodeState struct {
	Opened bool `json:"opened"`
}

// NodeData represents node data
type NodeData struct {
	Path string `json:"path"`
	Type string `json:"type"`
}

// CheckDirectory handles POST /api/check-directory
func (h *FileHandler) CheckDirectory(w http.ResponseWriter, r *http.Request) {
	if !ParseFormRequest(w, r) {
		return
	}

	workspace := GetWorkspace(r)
	targetDir := r.FormValue("targetDir")
	if targetDir == "" {
		targetDir = "./"
	}

	_, resolvedTarget, err := h.resolver.ResolveForWorkspace(workspace, targetDir)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	_, statErr := os.Stat(resolvedTarget)
	exists := statErr == nil

	jsonResponse(w, map[string]interface{}{
		"exists":  exists,
		"path":    resolvedTarget,
		"message": fmt.Sprintf("Directory %s: %s", map[bool]string{true: "exists", false: "does not exist"}[exists], targetDir),
	})
}

// CreateDirectory handles POST /api/create-directory
func (h *FileHandler) CreateDirectory(w http.ResponseWriter, r *http.Request) {
	if !ParseFormRequest(w, r) {
		return
	}

	workspace := GetWorkspace(r)
	targetDir := r.FormValue("targetDir")
	if targetDir == "" {
		jsonError(w, "No directory path provided", http.StatusBadRequest)
		return
	}

	_, resolvedTarget, err := h.resolver.ResolveForWorkspace(workspace, targetDir)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	// Check if already exists
	if info, err := os.Stat(resolvedTarget); err == nil {
		if info.IsDir() {
			jsonResponse(w, map[string]interface{}{
				"success": true,
				"message": fmt.Sprintf("Directory already exists: %s", targetDir),
				"path":    resolvedTarget,
				"created": false,
			})
			return
		}
		jsonError(w, "A file with that name already exists", http.StatusConflict)
		return
	}

	// Create the directory
	if err := os.MkdirAll(resolvedTarget, 0755); err != nil {
		filesLog.Error("Failed to create directory %s: %v", resolvedTarget, err)
		jsonError(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	filesLog.Info("Created directory: %s", resolvedTarget)
	jsonResponse(w, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Created directory: %s", targetDir),
		"path":    resolvedTarget,
		"created": true,
	})
}

// Upload handles POST /api/upload
// Supports both ZIP files (extracted) and regular files (saved with optional custom name)
func (h *FileHandler) Upload(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form
	if !ParseFormRequestWithSize(w, r, DefaultMaxUploadSize) {
		return
	}

	workspace := GetWorkspace(r)
	targetDir := r.FormValue("targetDir")
	if targetDir == "" {
		targetDir = "./"
	}
	// Optional custom filename for non-ZIP files
	customName := r.FormValue("name")

	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "No file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	originalFilename := header.Filename
	isZipFile := strings.HasSuffix(strings.ToLower(originalFilename), ".zip")

	basePath, resolvedTarget, err := h.resolver.ResolveForWorkspace(workspace, targetDir)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	// Save to temp file
	tempExt := filepath.Ext(originalFilename)
	tempFile, err := os.CreateTemp("", "upload-*"+tempExt)
	if err != nil {
		jsonError(w, "Failed to create temp file", http.StatusInternalServerError)
		return
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := io.Copy(tempFile, file); err != nil {
		tempFile.Close()
		jsonError(w, "Failed to save file", http.StatusInternalServerError)
		return
	}
	tempFile.Close()

	// Handle non-ZIP files: save directly
	if !isZipFile {
		h.handleRegularUpload(w, basePath, resolvedTarget, targetDir, tempPath, originalFilename, customName)
		return
	}

	// Handle ZIP files: extract contents
	h.handleZipUpload(w, basePath, resolvedTarget, targetDir, tempPath)
}

// handleRegularUpload handles uploading a single non-ZIP file
func (h *FileHandler) handleRegularUpload(w http.ResponseWriter, basePath, resolvedTarget, targetDir, tempPath, originalFilename, customName string) {
	// Determine filename
	destFilename := originalFilename
	if customName != "" {
		destFilename = customName
	}

	// Validate filename
	if !IsValidFilename(destFilename) {
		jsonError(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	// Resolve destination path safely
	destPath, err := h.resolver.ResolveSafePath(basePath, filepath.Join(targetDir, destFilename))
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	// Check if file already exists
	if _, err := os.Stat(destPath); err == nil {
		jsonResponse(w, map[string]interface{}{
			"error":         "File already exists",
			"existingItems": []string{destFilename},
			"targetDir":     resolvedTarget,
			"hint":          "Delete existing file first or use a different name",
		}, http.StatusConflict)
		return
	}

	// Create target directory
	if err := os.MkdirAll(resolvedTarget, 0755); err != nil {
		jsonError(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	// Copy file to destination
	if err := copyFile(tempPath, destPath); err != nil {
		jsonError(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"success":     true,
		"message":     fmt.Sprintf("Uploaded %s to %s", destFilename, targetDir),
		"extractedTo": resolvedTarget,
		"fileCount":   1,
		"filename":    destFilename,
	})
}

// handleZipUpload handles extracting a ZIP file
func (h *FileHandler) handleZipUpload(w http.ResponseWriter, basePath, resolvedTarget, targetDir, tempPath string) {
	zipReader, err := zip.OpenReader(tempPath)
	if err != nil {
		jsonError(w, "Invalid ZIP file", http.StatusBadRequest)
		return
	}
	defer zipReader.Close()

	// Validate ZIP: check entry count, total size, and collect root items
	if len(zipReader.File) > MaxZipEntries {
		filesLog.Warn("ZIP rejected: too many entries (%d > %d)", len(zipReader.File), MaxZipEntries)
		jsonError(w, fmt.Sprintf("ZIP has too many files (max %d)", MaxZipEntries), http.StatusBadRequest)
		return
	}

	var totalUncompressedSize uint64
	rootItems := make(map[string]struct{})
	for _, f := range zipReader.File {
		// Check for path traversal in archive using our resolver
		_, err := h.resolver.ResolveSafePath(resolvedTarget, f.Name)
		if err != nil {
			filesLog.Warn("ZIP rejected: path security issue in archive: %s: %v", f.Name, err)
			jsonError(w, "Malicious ZIP detected (path traversal in archive)", http.StatusBadRequest)
			return
		}

		// Check compression ratio for zip bomb detection
		if f.CompressedSize64 > 0 {
			ratio := f.UncompressedSize64 / f.CompressedSize64
			if ratio > MaxZipCompressionRatio {
				filesLog.Warn("ZIP rejected: suspicious compression ratio (%d:1) for %s", ratio, f.Name)
				jsonError(w, "Malicious ZIP detected (suspicious compression ratio)", http.StatusBadRequest)
				return
			}
		}

		totalUncompressedSize += f.UncompressedSize64
		if totalUncompressedSize > MaxZipTotalSize {
			filesLog.Warn("ZIP rejected: total size exceeds limit (%d > %d)", totalUncompressedSize, MaxZipTotalSize)
			jsonError(w, fmt.Sprintf("ZIP uncompressed size too large (max %dMB)", MaxZipTotalSize>>20), http.StatusBadRequest)
			return
		}

		parts := strings.Split(f.Name, "/")
		if len(parts) > 0 && parts[0] != "" {
			rootItems[parts[0]] = struct{}{}
		}
	}

	// Check for conflicts
	var existingItems []string
	for item := range rootItems {
		itemPath := filepath.Join(resolvedTarget, item)
		if _, err := os.Stat(itemPath); err == nil {
			existingItems = append(existingItems, item)
		}
	}

	if len(existingItems) > 0 {
		jsonResponse(w, map[string]interface{}{
			"error":         "Cannot extract - items already exist in target",
			"existingItems": existingItems,
			"targetDir":     resolvedTarget,
			"hint":          "Delete existing items first or remove them from ZIP",
		}, http.StatusConflict)
		return
	}

	// Create target directory
	if err := os.MkdirAll(resolvedTarget, 0755); err != nil {
		jsonError(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	// Extract files
	for _, f := range zipReader.File {
		destPath := filepath.Join(resolvedTarget, f.Name)

		if f.FileInfo().IsDir() {
			os.MkdirAll(destPath, 0755)
			continue
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			jsonError(w, "Failed to create directory", http.StatusInternalServerError)
			return
		}

		srcFile, err := f.Open()
		if err != nil {
			jsonError(w, "Failed to extract file", http.StatusInternalServerError)
			return
		}

		destFile, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			srcFile.Close()
			jsonError(w, "Failed to write file", http.StatusInternalServerError)
			return
		}

		_, err = io.Copy(destFile, srcFile)
		srcFile.Close()
		destFile.Close()
		if err != nil {
			jsonError(w, "Failed to extract file", http.StatusInternalServerError)
			return
		}
	}

	jsonResponse(w, map[string]interface{}{
		"success":     true,
		"message":     fmt.Sprintf("Extracted %d files to %s", len(zipReader.File), targetDir),
		"extractedTo": resolvedTarget,
		"fileCount":   len(zipReader.File),
	})
}

// ListFiles handles POST /api/list-files
func (h *FileHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	if !ParseFormRequest(w, r) {
		return
	}

	workspace := GetWorkspace(r)

	basePath, err := h.resolver.ResolveWorkspaceBase(workspace)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	if _, err := os.Stat(basePath); os.IsNotExist(err) {
		jsonResponse(w, map[string]interface{}{
			"error": "Directory not found",
			"path":  basePath,
		}, http.StatusNotFound)
		return
	}

	tree := buildTree(basePath, "", 0, 4, DefaultExcludedDirs)
	jsonResponse(w, map[string]interface{}{
		"path": basePath,
		"tree": tree,
	})
}

func buildTree(dirPath, relativePath string, depth, maxDepth int, excludeDirs map[string]bool) []TreeNode {
	if depth >= maxDepth {
		return nil
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil
	}

	// Filter and sort entries
	var filtered []os.DirEntry
	for _, e := range entries {
		if !excludeDirs[e.Name()] {
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
			subPath := filepath.Join(dirPath, entry.Name())
			node := TreeNode{
				Text: entry.Name(),
				Icon: "jstree-folder",
				Data: NodeData{Path: entryRelPath, Type: "directory"},
			}
			if depth < 2 {
				node.State = &NodeState{Opened: true}
			}
			node.Children = buildTree(subPath, entryRelPath, depth+1, maxDepth, excludeDirs)
			nodes = append(nodes, node)
		} else {
			nodes = append(nodes, TreeNode{
				Text: entry.Name(),
				Icon: "jstree-file",
				Data: NodeData{Path: entryRelPath, Type: "file"},
			})
		}
	}
	return nodes
}

// DownloadFile handles GET /api/download-file?workspace=X&path=Y
// Streams the file with Content-Disposition header for download
func (h *FileHandler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	workspace := r.URL.Query().Get("workspace")
	filePath := r.URL.Query().Get("path")

	if workspace == "" {
		jsonError(w, "No workspace provided", http.StatusBadRequest)
		return
	}
	if filePath == "" {
		jsonError(w, "No file path provided", http.StatusBadRequest)
		return
	}

	_, resolvedPath, err := h.resolver.ResolveForWorkspace(workspace, filePath)
	if err != nil {
		filesLog.Warn("Download path resolution failed for %s: %v", filePath, err)
		h.handlePathError(w, err)
		return
	}

	info, err := os.Stat(resolvedPath)
	if os.IsNotExist(err) {
		jsonError(w, "File not found", http.StatusNotFound)
		return
	}
	if err != nil {
		jsonError(w, "Failed to access file", http.StatusInternalServerError)
		return
	}
	if info.IsDir() {
		jsonError(w, "Cannot download a directory", http.StatusBadRequest)
		return
	}

	// Open the file
	file, err := os.Open(resolvedPath)
	if err != nil {
		filesLog.Error("Failed to open file for download %s: %v", resolvedPath, err)
		jsonError(w, "Failed to open file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	// Set headers for download
	filename := filepath.Base(filePath)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))

	// Stream the file
	if _, err := io.Copy(w, file); err != nil {
		filesLog.Error("Failed to stream file %s: %v", resolvedPath, err)
		// Can't send error response as headers already sent
	}
}

// ReadFile handles POST /api/read-file
func (h *FileHandler) ReadFile(w http.ResponseWriter, r *http.Request) {
	if !ParseFormRequest(w, r) {
		return
	}

	workspace := GetWorkspace(r)
	filePath := r.FormValue("path")
	if filePath == "" {
		jsonError(w, "No file path provided", http.StatusBadRequest)
		return
	}

	_, resolvedPath, err := h.resolver.ResolveForWorkspace(workspace, filePath)
	if err != nil {
		filesLog.Warn("Path resolution failed for %s: %v", filePath, err)
		h.handlePathError(w, err)
		return
	}

	info, err := os.Stat(resolvedPath)
	if os.IsNotExist(err) {
		jsonError(w, "File not found", http.StatusNotFound)
		return
	}

	// Size limit
	if info.Size() > MaxPreviewSize {
		jsonResponse(w, map[string]interface{}{
			"error": "File too large for preview (max 1MB)",
			"size":  info.Size(),
		}, http.StatusRequestEntityTooLarge)
		return
	}

	// Check binary file type
	if IsBinaryFile(filePath) {
		jsonResponse(w, map[string]interface{}{
			"error":     "Binary file cannot be previewed",
			"binary":    true,
			"extension": strings.ToLower(filepath.Ext(filePath)),
		}, http.StatusUnsupportedMediaType)
		return
	}

	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		jsonError(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	filename := filepath.Base(filePath)
	jsonResponse(w, map[string]interface{}{
		"content":  string(content),
		"path":     resolvedPath,
		"filename": filename,
		"size":     info.Size(),
	})
}

// DeleteFolder handles POST /api/delete-folder
func (h *FileHandler) DeleteFolder(w http.ResponseWriter, r *http.Request) {
	if !ParseFormRequest(w, r) {
		return
	}

	workspace := GetWorkspace(r)
	folderPath := r.FormValue("path")
	if folderPath == "" {
		jsonError(w, "No folder path provided", http.StatusBadRequest)
		return
	}

	// Use centralized validation for deletion
	_, resolvedPath, err := h.resolver.ValidateForDeletion(workspace, folderPath)
	if err != nil {
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
		"message":     fmt.Sprintf("Deleted %s: %s", typeStr, folderPath),
		"deletedPath": resolvedPath,
		"type":        typeStr,
	})
}

// ListSites handles GET /api/sites
func (h *FileHandler) ListSites(w http.ResponseWriter, r *http.Request) {
	sitesPath := h.resolver.GetSitesPath()
	entries, err := os.ReadDir(sitesPath)
	if err != nil {
		jsonError(w, "Failed to list sites", http.StatusInternalServerError)
		return
	}

	var sites []string
	for _, entry := range entries {
		if entry.IsDir() {
			userDir := filepath.Join(sitesPath, entry.Name(), "user")
			if _, err := os.Stat(userDir); err == nil {
				sites = append(sites, entry.Name())
			}
		}
	}

	sort.Strings(sites)
	jsonResponse(w, map[string]interface{}{
		"sites":     sites,
		"sitesPath": sitesPath,
	})
}

// ServerStats holds server statistics for health checks
type ServerStats struct {
	Status      string `json:"status"`
	Uptime      string `json:"uptime"`
	Goroutines  int    `json:"goroutines"`
	MemoryMB    uint64 `json:"memoryMB"`
	Environment string `json:"environment"`
}

var serverStartTime = time.Now()

// Health handles GET /health
func (h *FileHandler) Health(w http.ResponseWriter, r *http.Request) {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	stats := ServerStats{
		Status:      "ok",
		Uptime:      time.Since(serverStartTime).Round(time.Second).String(),
		Goroutines:  runtime.NumGoroutine(),
		MemoryMB:    memStats.Alloc / 1024 / 1024,
		Environment: h.config.Env,
	}

	jsonResponse(w, stats)
}

// handlePathError converts path security errors to appropriate HTTP responses
func (h *FileHandler) handlePathError(w http.ResponseWriter, err error) {
	HandlePathSecurityError(w, err)
}

// ConfigResponse represents the client configuration response
type ConfigResponse struct {
	ShellDefaultPath        string      `json:"shellDefaultPath"`
	UploadPath              string      `json:"uploadPath"`
	SitesPath               string      `json:"sitesPath"`
	WorkspaceBase           string      `json:"workspaceBase"`
	AllowWorkspaceSelection bool        `json:"allowWorkspaceSelection"`
	EditableDirectories     []DirConfig `json:"editableDirectories"`
}

// DirConfig represents a directory config for editable directories
type DirConfig struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Config handles GET /api/config - returns client configuration
func (h *FileHandler) Config(w http.ResponseWriter, r *http.Request) {
	// Build editable directories list (only include those that exist)
	var dirs []DirConfig
	for _, dir := range h.config.EditableDirectories {
		if _, err := os.Stat(dir.Path); err == nil {
			dirs = append(dirs, DirConfig{ID: dir.ID, Label: dir.Label})
		}
	}

	config := ConfigResponse{
		ShellDefaultPath:        h.config.ResolvedDefaultCwd,
		UploadPath:              h.config.ResolvedUploadCwd,
		SitesPath:               h.config.ResolvedSitesPath,
		WorkspaceBase:           h.config.WorkspaceBase,
		AllowWorkspaceSelection: h.config.AllowWorkspaceSelection,
		EditableDirectories:     dirs,
	}

	jsonResponse(w, config)
}

// Helper functions
func jsonResponse(w http.ResponseWriter, data interface{}, statusCodes ...int) {
	statusCode := http.StatusOK
	if len(statusCodes) > 0 {
		statusCode = statusCodes[0]
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, message string, statusCode int) {
	jsonResponse(w, map[string]string{"error": message}, statusCode)
}

// copyFile copies a file from src to dst
func copyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}
