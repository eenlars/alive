package files

import (
	"archive/zip"
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
	httpxmiddleware "shell-server-go/internal/httpx/middleware"
	"shell-server-go/internal/httpx/response"
	"shell-server-go/internal/logger"
	"shell-server-go/internal/session"
	workspacepkg "shell-server-go/internal/workspace"
)

var filesLog = logger.WithComponent("FILES")

// Handler handles file operations.
type Handler struct {
	config   *config.AppConfig
	sessions *session.Store
	resolver *workspacepkg.Resolver
}

// NewHandler creates a new file handler.
func NewHandler(cfg *config.AppConfig, sessions *session.Store) *Handler {
	return &Handler{
		config:   cfg,
		sessions: sessions,
		resolver: workspacepkg.NewResolver(cfg),
	}
}

// TreeNode represents a file tree node.
type TreeNode struct {
	Text     string     `json:"text"`
	Icon     string     `json:"icon"`
	State    *NodeState `json:"state,omitempty"`
	Data     NodeData   `json:"data"`
	Children []TreeNode `json:"children,omitempty"`
}

// NodeState represents node state in tree.
type NodeState struct {
	Opened bool `json:"opened"`
}

// NodeData represents node data.
type NodeData struct {
	Path string `json:"path"`
	Type string `json:"type"`
}

// CheckDirectory handles POST /api/check-directory.
func (h *Handler) CheckDirectory(w http.ResponseWriter, r *http.Request) {
	if !httpxmiddleware.ParseFormRequest(w, r) {
		return
	}

	workspaceID := workspacepkg.WorkspaceFromForm(r, h.sessions)
	targetDir := r.FormValue("targetDir")
	if targetDir == "" {
		targetDir = "./"
	}

	_, resolvedTarget, err := h.resolver.ResolveForWorkspace(workspaceID, targetDir)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	_, statErr := os.Stat(resolvedTarget)
	exists := statErr == nil

	response.JSON(w, http.StatusOK, map[string]any{
		"exists":  exists,
		"path":    resolvedTarget,
		"message": fmt.Sprintf("Directory %s: %s", map[bool]string{true: "exists", false: "does not exist"}[exists], targetDir),
	})
}

// CreateDirectory handles POST /api/create-directory.
func (h *Handler) CreateDirectory(w http.ResponseWriter, r *http.Request) {
	if !httpxmiddleware.ParseFormRequest(w, r) {
		return
	}

	workspaceID := workspacepkg.WorkspaceFromForm(r, h.sessions)
	targetDir := r.FormValue("targetDir")
	if targetDir == "" {
		response.Error(w, http.StatusBadRequest, "No directory path provided")
		return
	}

	_, resolvedTarget, err := h.resolver.ResolveForWorkspace(workspaceID, targetDir)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	if info, err := os.Stat(resolvedTarget); err == nil {
		if info.IsDir() {
			response.JSON(w, http.StatusOK, map[string]any{
				"success": true,
				"message": fmt.Sprintf("Directory already exists: %s", targetDir),
				"path":    resolvedTarget,
				"created": false,
			})
			return
		}
		response.Error(w, http.StatusConflict, "A file with that name already exists")
		return
	}

	if err := os.MkdirAll(resolvedTarget, 0755); err != nil {
		filesLog.Error("Failed to create directory %s: %v", resolvedTarget, err)
		response.Error(w, http.StatusInternalServerError, "Failed to create directory")
		return
	}

	filesLog.Info("Created directory: %s", resolvedTarget)
	response.JSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": fmt.Sprintf("Created directory: %s", targetDir),
		"path":    resolvedTarget,
		"created": true,
	})
}

// Upload handles POST /api/upload.
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	if !httpxmiddleware.ParseFormRequestWithSize(w, r, httpxmiddleware.DefaultMaxUploadSize) {
		return
	}

	workspaceID := workspacepkg.WorkspaceFromForm(r, h.sessions)
	targetDir := r.FormValue("targetDir")
	if targetDir == "" {
		targetDir = "./"
	}
	customName := r.FormValue("name")

	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	originalFilename := header.Filename
	isZipFile := strings.HasSuffix(strings.ToLower(originalFilename), ".zip")

	basePath, resolvedTarget, err := h.resolver.ResolveForWorkspace(workspaceID, targetDir)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	tempExt := filepath.Ext(originalFilename)
	tempFile, err := os.CreateTemp("", "upload-*"+tempExt)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create temp file")
		return
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := io.Copy(tempFile, file); err != nil {
		tempFile.Close()
		response.Error(w, http.StatusInternalServerError, "Failed to save file")
		return
	}
	tempFile.Close()

	if !isZipFile {
		h.handleRegularUpload(w, basePath, resolvedTarget, targetDir, tempPath, originalFilename, customName)
		return
	}

	h.handleZipUpload(w, resolvedTarget, targetDir, tempPath)
}

func (h *Handler) handleRegularUpload(w http.ResponseWriter, basePath, resolvedTarget, targetDir, tempPath, originalFilename, customName string) {
	destFilename := originalFilename
	if customName != "" {
		destFilename = customName
	}

	if !workspacepkg.IsValidFilename(destFilename) {
		response.Error(w, http.StatusBadRequest, "Invalid filename")
		return
	}

	destPath, err := h.resolver.ResolveSafePath(basePath, filepath.Join(targetDir, destFilename))
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	if _, err := os.Stat(destPath); err == nil {
		response.JSON(w, http.StatusConflict, map[string]any{
			"error":         "File already exists",
			"existingItems": []string{destFilename},
			"targetDir":     resolvedTarget,
			"hint":          "Delete existing file first or use a different name",
		})
		return
	}

	if err := os.MkdirAll(resolvedTarget, 0755); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create directory")
		return
	}

	if err := copyFile(tempPath, destPath); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to save file")
		return
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"success":     true,
		"message":     fmt.Sprintf("Uploaded %s to %s", destFilename, targetDir),
		"extractedTo": resolvedTarget,
		"fileCount":   1,
		"filename":    destFilename,
	})
}

func (h *Handler) handleZipUpload(w http.ResponseWriter, resolvedTarget, targetDir, tempPath string) {
	zipReader, err := zip.OpenReader(tempPath)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid ZIP file")
		return
	}
	defer zipReader.Close()

	if len(zipReader.File) > MaxZipEntries {
		filesLog.Warn("ZIP rejected: too many entries (%d > %d)", len(zipReader.File), MaxZipEntries)
		response.Error(w, http.StatusBadRequest, fmt.Sprintf("ZIP has too many files (max %d)", MaxZipEntries))
		return
	}

	var totalUncompressedSize uint64
	rootItems := make(map[string]struct{})
	for _, f := range zipReader.File {
		if _, err := h.resolver.ResolveSafePath(resolvedTarget, f.Name); err != nil {
			filesLog.Warn("ZIP rejected: path security issue in archive: %s: %v", f.Name, err)
			response.Error(w, http.StatusBadRequest, "Malicious ZIP detected (path traversal in archive)")
			return
		}

		if f.CompressedSize64 > 0 {
			ratio := f.UncompressedSize64 / f.CompressedSize64
			if ratio > MaxZipCompressionRatio {
				filesLog.Warn("ZIP rejected: suspicious compression ratio (%d:1) for %s", ratio, f.Name)
				response.Error(w, http.StatusBadRequest, "Malicious ZIP detected (suspicious compression ratio)")
				return
			}
		}

		totalUncompressedSize += f.UncompressedSize64
		if totalUncompressedSize > MaxZipTotalSize {
			filesLog.Warn("ZIP rejected: total size exceeds limit (%d > %d)", totalUncompressedSize, MaxZipTotalSize)
			response.Error(w, http.StatusBadRequest, fmt.Sprintf("ZIP uncompressed size too large (max %dMB)", MaxZipTotalSize>>20))
			return
		}

		parts := strings.Split(f.Name, "/")
		if len(parts) > 0 && parts[0] != "" {
			rootItems[parts[0]] = struct{}{}
		}
	}

	var existingItems []string
	for item := range rootItems {
		itemPath := filepath.Join(resolvedTarget, item)
		if _, err := os.Stat(itemPath); err == nil {
			existingItems = append(existingItems, item)
		}
	}
	if len(existingItems) > 0 {
		response.JSON(w, http.StatusConflict, map[string]any{
			"error":         "Cannot extract - items already exist in target",
			"existingItems": existingItems,
			"targetDir":     resolvedTarget,
			"hint":          "Delete existing items first or remove them from ZIP",
		})
		return
	}

	if err := os.MkdirAll(resolvedTarget, 0755); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create directory")
		return
	}

	for _, f := range zipReader.File {
		destPath := filepath.Join(resolvedTarget, f.Name)

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(destPath, 0755); err != nil {
				response.Error(w, http.StatusInternalServerError, "Failed to create directory")
				return
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			response.Error(w, http.StatusInternalServerError, "Failed to create directory")
			return
		}

		srcFile, err := f.Open()
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "Failed to extract file")
			return
		}

		destFile, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			srcFile.Close()
			response.Error(w, http.StatusInternalServerError, "Failed to write file")
			return
		}

		_, err = io.Copy(destFile, srcFile)
		srcFile.Close()
		destFile.Close()
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "Failed to extract file")
			return
		}
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"success":     true,
		"message":     fmt.Sprintf("Extracted %d files to %s", len(zipReader.File), targetDir),
		"extractedTo": resolvedTarget,
		"fileCount":   len(zipReader.File),
	})
}

// ListFiles handles POST /api/list-files.
func (h *Handler) ListFiles(w http.ResponseWriter, r *http.Request) {
	if !httpxmiddleware.ParseFormRequest(w, r) {
		return
	}

	workspaceID := workspacepkg.WorkspaceFromForm(r, h.sessions)

	basePath, err := h.resolver.ResolveWorkspaceBase(workspaceID)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	if _, err := os.Stat(basePath); err != nil {
		if os.IsNotExist(err) {
			response.JSON(w, http.StatusNotFound, map[string]any{
				"error": "Directory not found",
				"path":  basePath,
			})
			return
		}
		filesLog.Error("Failed to stat workspace base %s: %v", basePath, err)
		response.Error(w, http.StatusInternalServerError, "Failed to access directory")
		return
	}

	tree := buildTree(basePath, "", 0, 4, workspacepkg.DefaultExcludedDirs)
	response.JSON(w, http.StatusOK, map[string]any{
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
			continue
		}

		nodes = append(nodes, TreeNode{
			Text: entry.Name(),
			Icon: "jstree-file",
			Data: NodeData{Path: entryRelPath, Type: "file"},
		})
	}

	return nodes
}

// DownloadFile handles GET /api/download-file?workspace=X&path=Y.
func (h *Handler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspacepkg.WorkspaceFromQuery(r, h.sessions)
	filePath := r.URL.Query().Get("path")

	if workspaceID == "" {
		response.Error(w, http.StatusBadRequest, "No workspace provided")
		return
	}
	if filePath == "" {
		response.Error(w, http.StatusBadRequest, "No file path provided")
		return
	}

	_, resolvedPath, err := h.resolver.ResolveForWorkspace(workspaceID, filePath)
	if err != nil {
		filesLog.Warn("Download path resolution failed for %s: %v", filePath, err)
		h.handlePathError(w, err)
		return
	}

	info, err := os.Stat(resolvedPath)
	if os.IsNotExist(err) {
		response.Error(w, http.StatusNotFound, "File not found")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to access file")
		return
	}
	if info.IsDir() {
		response.Error(w, http.StatusBadRequest, "Cannot download a directory")
		return
	}

	file, err := os.Open(resolvedPath)
	if err != nil {
		filesLog.Error("Failed to open file for download %s: %v", resolvedPath, err)
		response.Error(w, http.StatusInternalServerError, "Failed to open file")
		return
	}
	defer file.Close()

	filename := filepath.Base(filePath)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))

	if _, err := io.Copy(w, file); err != nil {
		filesLog.Error("Failed to stream file %s: %v", resolvedPath, err)
	}
}

// ReadFile handles POST /api/read-file.
func (h *Handler) ReadFile(w http.ResponseWriter, r *http.Request) {
	if !httpxmiddleware.ParseFormRequest(w, r) {
		return
	}

	workspaceID := workspacepkg.WorkspaceFromForm(r, h.sessions)
	filePath := r.FormValue("path")
	if filePath == "" {
		response.Error(w, http.StatusBadRequest, "No file path provided")
		return
	}

	_, resolvedPath, err := h.resolver.ResolveForWorkspace(workspaceID, filePath)
	if err != nil {
		filesLog.Warn("Path resolution failed for %s: %v", filePath, err)
		h.handlePathError(w, err)
		return
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			response.Error(w, http.StatusNotFound, "File not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "Failed to access file")
		return
	}

	if info.Size() > MaxPreviewSize {
		response.JSON(w, http.StatusRequestEntityTooLarge, map[string]any{
			"error": "File too large for preview (max 1MB)",
			"size":  info.Size(),
		})
		return
	}

	if IsBinaryFile(filePath) {
		response.JSON(w, http.StatusUnsupportedMediaType, map[string]any{
			"error":     "Binary file cannot be previewed",
			"binary":    true,
			"extension": strings.ToLower(filepath.Ext(filePath)),
		})
		return
	}

	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to read file")
		return
	}

	filename := filepath.Base(filePath)
	response.JSON(w, http.StatusOK, map[string]any{
		"content":  string(content),
		"path":     resolvedPath,
		"filename": filename,
		"size":     info.Size(),
	})
}

// DeleteFolder handles POST /api/delete-folder.
func (h *Handler) DeleteFolder(w http.ResponseWriter, r *http.Request) {
	if !httpxmiddleware.ParseFormRequest(w, r) {
		return
	}

	workspaceID := workspacepkg.WorkspaceFromForm(r, h.sessions)
	folderPath := r.FormValue("path")
	if folderPath == "" {
		response.Error(w, http.StatusBadRequest, "No folder path provided")
		return
	}

	_, resolvedPath, err := h.resolver.ValidateForDeletion(workspaceID, folderPath)
	if err != nil {
		h.handlePathError(w, err)
		return
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			response.Error(w, http.StatusNotFound, "Path not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "Failed to stat path")
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
		"message":     fmt.Sprintf("Deleted %s: %s", typeStr, folderPath),
		"deletedPath": resolvedPath,
		"type":        typeStr,
	})
}

// ListSites handles GET /api/sites.
func (h *Handler) ListSites(w http.ResponseWriter, r *http.Request) {
	sitesPath := h.resolver.GetSitesPath()

	if scopedWorkspace := workspacepkg.SessionWorkspace(r, h.sessions); scopedWorkspace != "" {
		if strings.HasPrefix(scopedWorkspace, "site:") {
			site := strings.TrimPrefix(scopedWorkspace, "site:")
			userDir := filepath.Join(sitesPath, site, "user")

			sites := make([]string, 0, 1)
			if info, err := os.Stat(userDir); err == nil && info.IsDir() {
				sites = append(sites, site)
			}

			response.JSON(w, http.StatusOK, map[string]any{
				"sites":     sites,
				"sitesPath": "",
			})
			return
		}

		response.JSON(w, http.StatusOK, map[string]any{
			"sites":     []string{},
			"sitesPath": "",
		})
		return
	}

	entries, err := os.ReadDir(sitesPath)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to list sites")
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
	response.JSON(w, http.StatusOK, map[string]any{
		"sites":     sites,
		"sitesPath": sitesPath,
	})
}

// ServerStats holds server statistics for health checks.
type ServerStats struct {
	Status      string `json:"status"`
	Uptime      string `json:"uptime"`
	Goroutines  int    `json:"goroutines"`
	MemoryMB    uint64 `json:"memoryMB"`
	Environment string `json:"environment"`
}

var serverStartTime = time.Now()

// Health handles GET /health.
func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	stats := ServerStats{
		Status:      "ok",
		Uptime:      time.Since(serverStartTime).Round(time.Second).String(),
		Goroutines:  runtime.NumGoroutine(),
		MemoryMB:    memStats.Alloc / 1024 / 1024,
		Environment: h.config.Env,
	}

	response.JSON(w, http.StatusOK, stats)
}

// ConfigResponse represents the client configuration response.
type ConfigResponse struct {
	ShellDefaultPath        string      `json:"shellDefaultPath"`
	UploadPath              string      `json:"uploadPath"`
	SitesPath               string      `json:"sitesPath"`
	WorkspaceBase           string      `json:"workspaceBase"`
	DefaultWorkspace        string      `json:"defaultWorkspace"`
	AllowWorkspaceSelection bool        `json:"allowWorkspaceSelection"`
	EditableDirectories     []DirConfig `json:"editableDirectories"`
}

// DirConfig represents a directory config for editable directories.
type DirConfig struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Config handles GET /api/config.
func (h *Handler) Config(w http.ResponseWriter, r *http.Request) {
	var dirs []DirConfig
	for _, dir := range h.config.EditableDirectories {
		if _, err := os.Stat(dir.Path); err == nil {
			dirs = append(dirs, DirConfig{ID: dir.ID, Label: dir.Label})
		}
	}

	defaultWorkspace := h.config.DefaultWorkspace
	allowWorkspaceSelection := h.config.AllowWorkspaceSelection
	configDirs := dirs
	shellDefaultPath := h.config.ResolvedDefaultCwd
	uploadPath := h.config.ResolvedUploadCwd
	sitesPath := h.config.ResolvedSitesPath
	workspaceBase := h.config.WorkspaceBase
	if scopedWorkspace := workspacepkg.SessionWorkspace(r, h.sessions); scopedWorkspace != "" {
		defaultWorkspace = scopedWorkspace
		allowWorkspaceSelection = false
		configDirs = []DirConfig{}
		shellDefaultPath = ""
		uploadPath = ""
		sitesPath = ""
		workspaceBase = ""
	}

	cfg := ConfigResponse{
		ShellDefaultPath:        shellDefaultPath,
		UploadPath:              uploadPath,
		SitesPath:               sitesPath,
		WorkspaceBase:           workspaceBase,
		DefaultWorkspace:        defaultWorkspace,
		AllowWorkspaceSelection: allowWorkspaceSelection,
		EditableDirectories:     configDirs,
	}

	response.JSON(w, http.StatusOK, cfg)
}

func (h *Handler) handlePathError(w http.ResponseWriter, err error) {
	workspacepkg.HandlePathSecurityError(w, err)
}

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
