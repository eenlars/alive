package handlers

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"shell-server-go/internal/config"
	"shell-server-go/internal/logger"
)

var templatesLog = logger.WithComponent("TEMPLATES")

// TemplateHandler handles super template operations
type TemplateHandler struct {
	config        *config.AppConfig
	templatesPath string
}

// NewTemplateHandler creates a new template handler
func NewTemplateHandler(cfg *config.AppConfig) *TemplateHandler {
	// Templates are in packages/tools/supertemplate/templates relative to alive repo root
	// Find the path based on common deployment patterns
	possiblePaths := []string{
		"/root/webalive/alive/packages/tools/supertemplate/templates",
		filepath.Join(cfg.WorkspaceBase, "../packages/tools/supertemplate/templates"),
	}

	var templatesPath string
	for _, p := range possiblePaths {
		if _, err := os.Stat(p); err == nil {
			templatesPath = p
			break
		}
	}

	if templatesPath == "" {
		templatesLog.Warn("Templates directory not found, tried: %v", possiblePaths)
	} else {
		templatesLog.Info("Templates directory: %s", templatesPath)
	}

	return &TemplateHandler{
		config:        cfg,
		templatesPath: templatesPath,
	}
}

// TemplateListItem represents a template for the UI
type TemplateListItem struct {
	ID              string   `json:"id"`
	TemplateID      string   `json:"templateId"`
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	Category        string   `json:"category"`
	Complexity      int      `json:"complexity"`
	FileCount       int      `json:"fileCount"`
	Dependencies    []string `json:"dependencies"`
	EstimatedTime   string   `json:"estimatedTime"`
	EstimatedTokens int      `json:"estimatedTokens"`
	Tags            []string `json:"tags"`
	Requires        []string `json:"requires"`
	PreviewImage    string   `json:"previewImage"`
}

// TemplateFrontmatter holds parsed frontmatter data
type TemplateFrontmatter struct {
	Name            string
	Description     string
	Category        string
	Complexity      int
	Files           int
	Dependencies    []string
	EstimatedTime   string
	EstimatedTokens int
	Tags            []string
	Requires        []string
	PreviewImage    string
	Enabled         bool // "enabled: true" in frontmatter
}

// ListTemplates handles GET /api/templates - returns all available templates
func (h *TemplateHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	if h.templatesPath == "" {
		jsonResponse(w, map[string]interface{}{
			"templates": []TemplateListItem{},
			"error":     "Templates directory not configured",
		})
		return
	}

	templates, err := h.scanTemplates()
	if err != nil {
		templatesLog.Error("Failed to scan templates: %v", err)
		jsonResponse(w, map[string]interface{}{
			"templates": []TemplateListItem{},
			"error":     err.Error(),
		})
		return
	}

	jsonResponse(w, map[string]interface{}{
		"templates": templates,
	})
}

// GetTemplate handles GET /api/templates/{id} - returns a specific template's content
func (h *TemplateHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	// Extract template ID from URL path
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, "Template ID required", http.StatusBadRequest)
		return
	}

	// Security: validate ID
	if !isValidTemplateID(id) {
		jsonError(w, "Invalid template ID", http.StatusBadRequest)
		return
	}

	if h.templatesPath == "" {
		jsonError(w, "Templates directory not configured", http.StatusInternalServerError)
		return
	}

	// Search for template across all category directories
	templateFile := strings.ToLower(id) + ".md"
	content, foundPath, err := h.findTemplate(templateFile)
	if err != nil {
		jsonError(w, "Template not found", http.StatusNotFound)
		return
	}

	// Parse frontmatter to check if enabled
	frontmatter := parseFrontmatter(content)
	if frontmatter != nil && !frontmatter.Enabled {
		jsonError(w, "Template not enabled", http.StatusNotFound)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"id":      id,
		"path":    foundPath,
		"content": content,
	})
}

// SaveTemplateRequest represents the request body for saving a template
type SaveTemplateRequest struct {
	Content string `json:"content"`
}

// CreateTemplateRequest represents the request body for creating a template
type CreateTemplateRequest struct {
	Name    string `json:"name"`    // Filename (without .md)
	Content string `json:"content"` // Full template content with frontmatter
}

// ValidationError represents a frontmatter validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Default Unsplash images by category for preview images
var defaultPreviewImages = map[string]string{
	"animations":         "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&h=600&fit=crop",
	"ui-components":      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=600&fit=crop",
	"components":         "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=600&fit=crop",
	"forms":              "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800&h=600&fit=crop",
	"forms-and-inputs":   "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800&h=600&fit=crop",
	"media":              "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800&h=600&fit=crop",
	"navigation":         "https://images.unsplash.com/photo-1512758017271-d7b84c2113f1?w=800&h=600&fit=crop",
	"landing":            "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop",
	"layout":             "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800&h=600&fit=crop",
	"data-display":       "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop",
	"integrations":       "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=600&fit=crop",
	"maps":               "https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&h=600&fit=crop",
	"backend":            "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=600&fit=crop",
	"setup":              "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&h=600&fit=crop",
	"frontend":           "https://images.unsplash.com/photo-1547658719-da2b51169166?w=800&h=600&fit=crop",
	"content-management": "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=600&fit=crop",
	"photo-sliders":      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop",
}

// Default tags by category
var defaultTagsByCategory = map[string][]string{
	"animations":         {"animation", "motion", "effects"},
	"ui-components":      {"ui", "component", "react"},
	"components":         {"ui", "component", "react"},
	"forms":              {"form", "input", "validation"},
	"forms-and-inputs":   {"form", "input", "upload"},
	"media":              {"media", "images", "video"},
	"navigation":         {"navigation", "menu", "routing"},
	"landing":            {"landing", "hero", "marketing"},
	"layout":             {"layout", "grid", "responsive"},
	"data-display":       {"data", "visualization", "charts"},
	"integrations":       {"integration", "api", "third-party"},
	"maps":               {"maps", "location", "leaflet"},
	"backend":            {"backend", "api", "server"},
	"setup":              {"setup", "config", "tooling"},
	"frontend":           {"frontend", "styling", "tailwind"},
	"content-management": {"content", "cms", "management"},
	"photo-sliders":      {"carousel", "slider", "gallery"},
}

// applyFrontmatterDefaults fills in missing required fields with sensible defaults
func applyFrontmatterDefaults(fm *TemplateFrontmatter) {
	if fm.Category == "" {
		fm.Category = "ui-components"
	}
	if fm.Complexity < 1 || fm.Complexity > 5 {
		fm.Complexity = 2
	}
	if fm.Files < 1 {
		fm.Files = 1
	}
	if fm.EstimatedTime == "" {
		fm.EstimatedTime = "10-15 min"
	}
	if fm.EstimatedTokens < 1 {
		fm.EstimatedTokens = 25
	}
	// Default tags based on category
	if len(fm.Tags) == 0 {
		if defaultTags, ok := defaultTagsByCategory[fm.Category]; ok {
			fm.Tags = defaultTags
		} else {
			fm.Tags = []string{"template", "react", "component"}
		}
	}
	// Default preview image based on category
	if fm.PreviewImage == "" {
		if defaultImg, ok := defaultPreviewImages[fm.Category]; ok {
			fm.PreviewImage = defaultImg
		} else {
			fm.PreviewImage = "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=600&fit=crop"
		}
	}
	// Default requires
	if len(fm.Requires) == 0 {
		fm.Requires = []string{"React 18+"}
	}
	// Note: Enabled already defaults to true in parseFrontmatter
	// Don't override here - respect explicit enabled: false
}

// buildCompleteFrontmatter rebuilds the content with a complete frontmatter section
func buildCompleteFrontmatter(fm *TemplateFrontmatter, originalContent string) string {
	// Extract the body (everything after the closing ---)
	body := ""
	if strings.HasPrefix(originalContent, "---") {
		endIndex := strings.Index(originalContent[3:], "---")
		if endIndex != -1 {
			body = strings.TrimSpace(originalContent[3+endIndex+3:])
		}
	}

	// Build new frontmatter with all fields
	var sb strings.Builder
	sb.WriteString("---\n")
	sb.WriteString("name: " + fm.Name + "\n")
	sb.WriteString("description: " + fm.Description + "\n")
	sb.WriteString("category: " + fm.Category + "\n")
	sb.WriteString("complexity: " + strconv.Itoa(fm.Complexity) + "\n")
	sb.WriteString("files: " + strconv.Itoa(fm.Files) + "\n")
	sb.WriteString("estimatedTime: \"" + fm.EstimatedTime + "\"\n")

	// Dependencies
	if len(fm.Dependencies) > 0 {
		sb.WriteString("dependencies:\n")
		for _, dep := range fm.Dependencies {
			sb.WriteString("  - " + dep + "\n")
		}
	} else {
		sb.WriteString("dependencies: []\n")
	}

	// Tags
	if len(fm.Tags) > 0 {
		sb.WriteString("tags:\n")
		for _, tag := range fm.Tags {
			sb.WriteString("  - " + tag + "\n")
		}
	}

	// Requires
	if len(fm.Requires) > 0 {
		sb.WriteString("requires:\n")
		for _, req := range fm.Requires {
			sb.WriteString("  - " + req + "\n")
		}
	}

	sb.WriteString("previewImage: " + fm.PreviewImage + "\n")
	sb.WriteString("enabled: " + strconv.FormatBool(fm.Enabled) + "\n")
	sb.WriteString("---\n\n")
	sb.WriteString(body)

	return sb.String()
}

// ValidateFrontmatter validates that frontmatter has all required fields with correct types
func validateFrontmatter(fm *TemplateFrontmatter) []ValidationError {
	var errors []ValidationError

	// Only name and description are truly required - everything else has defaults
	if fm.Name == "" {
		errors = append(errors, ValidationError{Field: "name", Message: "name is required"})
	} else {
		// Validate name length
		if len(fm.Name) < 3 {
			errors = append(errors, ValidationError{Field: "name", Message: "name must be at least 3 characters"})
		}
		if len(fm.Name) > 100 {
			errors = append(errors, ValidationError{Field: "name", Message: "name must be less than 100 characters"})
		}
	}

	if fm.Description == "" {
		errors = append(errors, ValidationError{Field: "description", Message: "description is required"})
	} else {
		// Validate description length
		if len(fm.Description) < 10 {
			errors = append(errors, ValidationError{Field: "description", Message: "description must be at least 10 characters"})
		}
		if len(fm.Description) > 500 {
			errors = append(errors, ValidationError{Field: "description", Message: "description must be less than 500 characters"})
		}
	}

	// Validate category format if provided
	categoryRegex := regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
	if fm.Category != "" && !categoryRegex.MatchString(fm.Category) {
		errors = append(errors, ValidationError{Field: "category", Message: "category must be lowercase with hyphens (e.g., 'ui-components')"})
	}

	// Validate complexity range
	if fm.Complexity < 0 || fm.Complexity > 5 {
		errors = append(errors, ValidationError{Field: "complexity", Message: "complexity must be between 1 and 5"})
	}

	return errors
}

// checkDuplicateName checks if a template with the same name already exists
func (h *TemplateHandler) checkDuplicateName(name string, excludeID string) bool {
	templates, err := h.scanTemplates()
	if err != nil {
		return false
	}

	normalizedName := strings.ToLower(strings.TrimSpace(name))
	for _, t := range templates {
		if strings.ToLower(t.Name) == normalizedName && t.ID != excludeID {
			return true
		}
	}
	return false
}

// generateRandomID generates a short random hex string
func generateRandomID() string {
	bytes := make([]byte, 4)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// slugify converts a string to a URL-friendly slug
func slugify(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, " ", "-")
	s = regexp.MustCompile(`[^a-z0-9-]`).ReplaceAllString(s, "")
	s = regexp.MustCompile(`-+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 50 {
		s = s[:50]
	}
	return s
}

// CreateTemplate handles POST /api/templates - creates a new template
func (h *TemplateHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	if h.templatesPath == "" {
		jsonError(w, "Templates directory not configured", http.StatusInternalServerError)
		return
	}

	// Parse request body
	var req CreateTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Content is required
	if req.Content == "" {
		jsonError(w, "Content is required", http.StatusBadRequest)
		return
	}

	// Validate content starts with frontmatter
	if !strings.HasPrefix(req.Content, "---") {
		jsonError(w, "Content must start with YAML frontmatter (---)", http.StatusBadRequest)
		return
	}

	// Parse frontmatter
	fm := parseFrontmatter(req.Content)
	if fm == nil {
		jsonError(w, "Invalid frontmatter - must be valid YAML between --- markers", http.StatusBadRequest)
		return
	}

	// Apply defaults for missing fields
	applyFrontmatterDefaults(fm)

	// Validate frontmatter
	validationErrors := validateFrontmatter(fm)

	// Check for duplicate name
	if fm.Name != "" && h.checkDuplicateName(fm.Name, "") {
		validationErrors = append(validationErrors, ValidationError{
			Field:   "name",
			Message: "a template with this name already exists",
		})
	}

	if len(validationErrors) > 0 {
		var msgs []string
		for _, e := range validationErrors {
			msgs = append(msgs, e.Message)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":            "Validation failed",
			"validationErrors": validationErrors,
			"message":          strings.Join(msgs, "; "),
		})
		return
	}

	// Generate ID: use provided name, or slugify from frontmatter name, or random
	var id string
	if req.Name != "" {
		id = slugify(req.Name)
	} else if fm.Name != "" {
		id = slugify(fm.Name)
	}

	// If still empty or invalid, generate random
	if id == "" || !isValidTemplateID(id) {
		id = "template-" + generateRandomID()
	}

	// Ensure unique - append random suffix if exists
	baseID := id
	for attempt := 0; attempt < 10; attempt++ {
		templateFile := id + ".md"
		existingContent, _, err := h.findTemplate(templateFile)
		if err != nil || existingContent == "" {
			break // doesn't exist, we can use this ID
		}
		// Exists, try with random suffix
		id = baseID + "-" + generateRandomID()
	}

	category := fm.Category

	// Check if category directory exists, create if not
	categoryPath := filepath.Join(h.templatesPath, category)
	if _, err := os.Stat(categoryPath); os.IsNotExist(err) {
		if err := os.MkdirAll(categoryPath, 0755); err != nil {
			jsonError(w, "Failed to create category directory", http.StatusInternalServerError)
			return
		}
	}

	// Rebuild content with complete frontmatter (defaults applied)
	finalContent := buildCompleteFrontmatter(fm, req.Content)

	// Write the template file
	fullPath := filepath.Join(categoryPath, id+".md")
	if err := os.WriteFile(fullPath, []byte(finalContent), 0644); err != nil {
		templatesLog.Error("Failed to create template %s: %v", id, err)
		jsonError(w, "Failed to create template", http.StatusInternalServerError)
		return
	}

	templatesLog.Info("Template created: %s in category %s", id, category)
	jsonResponse(w, map[string]interface{}{
		"success":  true,
		"id":       id,
		"path":     fullPath,
		"category": category,
	})
}

// SaveTemplate handles PUT /api/templates/{id} - saves a template's content
func (h *TemplateHandler) SaveTemplate(w http.ResponseWriter, r *http.Request) {
	// Extract template ID from URL path
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, "Template ID required", http.StatusBadRequest)
		return
	}

	// Security: validate ID
	if !isValidTemplateID(id) {
		jsonError(w, "Invalid template ID", http.StatusBadRequest)
		return
	}

	if h.templatesPath == "" {
		jsonError(w, "Templates directory not configured", http.StatusInternalServerError)
		return
	}

	// Parse request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		jsonError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	var req SaveTemplateRequest
	if err := json.Unmarshal(body, &req); err != nil {
		jsonError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		jsonError(w, "Content is required", http.StatusBadRequest)
		return
	}

	// Find the template file path
	templateFile := strings.ToLower(id) + ".md"
	_, foundPath, err := h.findTemplate(templateFile)
	if err != nil {
		jsonError(w, "Template not found", http.StatusNotFound)
		return
	}

	// Write the content to the file
	if err := os.WriteFile(foundPath, []byte(req.Content), 0644); err != nil {
		templatesLog.Error("Failed to write template %s: %v", id, err)
		jsonError(w, "Failed to save template", http.StatusInternalServerError)
		return
	}

	templatesLog.Info("Template saved: %s", id)
	jsonResponse(w, map[string]interface{}{
		"success": true,
		"id":      id,
		"path":    foundPath,
	})
}

// scanTemplates reads all templates from the templates directory
func (h *TemplateHandler) scanTemplates() ([]TemplateListItem, error) {
	var templates []TemplateListItem

	// Read category directories
	entries, err := os.ReadDir(h.templatesPath)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		categoryPath := filepath.Join(h.templatesPath, entry.Name())
		files, err := os.ReadDir(categoryPath)
		if err != nil {
			continue
		}

		for _, file := range files {
			if !strings.HasSuffix(file.Name(), ".md") {
				continue
			}

			filePath := filepath.Join(categoryPath, file.Name())
			content, err := os.ReadFile(filePath)
			if err != nil {
				continue
			}

			frontmatter := parseFrontmatter(string(content))
			if frontmatter == nil {
				continue
			}

			// Skip disabled templates
			if !frontmatter.Enabled {
				continue
			}

			// Skip templates without required fields
			if frontmatter.Name == "" || frontmatter.Description == "" {
				continue
			}

			// Apply defaults for display purposes
			if frontmatter.Category == "" {
				frontmatter.Category = entry.Name() // Use directory name as category
			}
			if frontmatter.Complexity < 1 {
				frontmatter.Complexity = 2
			}
			if frontmatter.Files < 1 {
				frontmatter.Files = 1
			}
			if frontmatter.EstimatedTime == "" {
				frontmatter.EstimatedTime = "10-15 min"
			}
			if len(frontmatter.Tags) == 0 {
				if defaultTags, ok := defaultTagsByCategory[frontmatter.Category]; ok {
					frontmatter.Tags = defaultTags
				} else {
					frontmatter.Tags = []string{"template", "react"}
				}
			}
			if frontmatter.PreviewImage == "" {
				if defaultImg, ok := defaultPreviewImages[frontmatter.Category]; ok {
					frontmatter.PreviewImage = defaultImg
				} else {
					frontmatter.PreviewImage = "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=600&fit=crop"
				}
			}

			id := strings.TrimSuffix(file.Name(), ".md")
			templates = append(templates, TemplateListItem{
				ID:              id,
				TemplateID:      id,
				Name:            frontmatter.Name,
				Description:     frontmatter.Description,
				Category:        frontmatter.Category,
				Complexity:      frontmatter.Complexity,
				FileCount:       frontmatter.Files,
				Dependencies:    frontmatter.Dependencies,
				EstimatedTime:   frontmatter.EstimatedTime,
				EstimatedTokens: frontmatter.EstimatedTokens,
				Tags:            frontmatter.Tags,
				Requires:        frontmatter.Requires,
				PreviewImage:    frontmatter.PreviewImage,
			})
		}
	}

	return templates, nil
}

// findTemplate searches for a template file across all category directories
func (h *TemplateHandler) findTemplate(templateFile string) (string, string, error) {
	entries, err := os.ReadDir(h.templatesPath)
	if err != nil {
		return "", "", err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		candidatePath := filepath.Join(h.templatesPath, entry.Name(), templateFile)
		content, err := os.ReadFile(candidatePath)
		if err == nil {
			return string(content), candidatePath, nil
		}
	}

	return "", "", os.ErrNotExist
}

// isValidTemplateID validates a template ID
func isValidTemplateID(id string) bool {
	if len(id) == 0 || len(id) > 100 {
		return false
	}
	// Only allow alphanumeric and hyphens
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9-]+$`, id)
	return matched
}

// parseFrontmatter parses YAML frontmatter from markdown content
func parseFrontmatter(content string) *TemplateFrontmatter {
	if !strings.HasPrefix(content, "---") {
		return nil
	}

	endIndex := strings.Index(content[3:], "---")
	if endIndex == -1 {
		return nil
	}

	frontmatterStr := content[3 : 3+endIndex]
	result := &TemplateFrontmatter{
		Enabled:      true, // Default to true
		Dependencies: []string{},
		Tags:         []string{},
		Requires:     []string{},
	}

	scanner := bufio.NewScanner(strings.NewReader(frontmatterStr))
	var currentArray string

	for scanner.Scan() {
		line := scanner.Text()

		// Check for array continuation
		if strings.HasPrefix(strings.TrimSpace(line), "- ") && currentArray != "" {
			value := strings.TrimPrefix(strings.TrimSpace(line), "- ")
			value = strings.Trim(value, "\"'")
			switch currentArray {
			case "dependencies":
				result.Dependencies = append(result.Dependencies, value)
			case "requires":
				result.Requires = append(result.Requires, value)
			case "tags":
				result.Tags = append(result.Tags, value)
			}
			continue
		}

		// Parse key: value pairs
		colonIdx := strings.Index(line, ":")
		if colonIdx == -1 {
			continue
		}

		key := strings.TrimSpace(line[:colonIdx])
		value := strings.TrimSpace(line[colonIdx+1:])

		// Reset array context for non-indented lines
		if !strings.HasPrefix(line, " ") && !strings.HasPrefix(line, "\t") {
			currentArray = ""
		}

		switch key {
		case "name":
			result.Name = value
		case "description":
			result.Description = value
		case "category":
			result.Category = value
		case "complexity":
			result.Complexity, _ = strconv.Atoi(value)
		case "files":
			result.Files, _ = strconv.Atoi(value)
		case "estimatedTime":
			result.EstimatedTime = value
		case "estimatedTokens":
			result.EstimatedTokens, _ = strconv.Atoi(value)
		case "previewImage":
			result.PreviewImage = value
		case "enabled":
			result.Enabled = strings.ToLower(value) == "true"
		case "dependencies":
			currentArray = "dependencies"
			if value != "" && strings.HasPrefix(value, "[") {
				result.Dependencies = parseInlineArray(value)
				currentArray = ""
			}
		case "requires":
			currentArray = "requires"
			if value != "" && strings.HasPrefix(value, "[") {
				result.Requires = parseInlineArray(value)
				currentArray = ""
			}
		case "tags":
			currentArray = "tags"
			if value != "" && strings.HasPrefix(value, "[") {
				result.Tags = parseInlineArray(value)
				currentArray = ""
			}
		}
	}

	return result
}

// parseInlineArray parses [a, b, c] format
func parseInlineArray(s string) []string {
	s = strings.TrimPrefix(s, "[")
	s = strings.TrimSuffix(s, "]")
	parts := strings.Split(s, ",")
	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		p = strings.Trim(p, "\"'")
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}
