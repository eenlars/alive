package handlers

import (
	"path/filepath"
	"strings"
)

// BinaryExtensions contains file extensions that should not be previewed as text
var BinaryExtensions = map[string]bool{
	// Images
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".gif":  true,
	".ico":  true,
	".webp": true,
	".bmp":  true,
	".svg":  true,

	// Documents
	".pdf": true,

	// Archives
	".zip": true,
	".tar": true,
	".gz":  true,
	".rar": true,
	".7z":  true,

	// Audio
	".mp3": true,
	".wav": true,
	".ogg": true,
	".m4a": true,

	// Video
	".mp4": true,
	".avi": true,
	".mov": true,
	".mkv": true,
	".webm": true,

	// Executables
	".exe":  true,
	".dll":  true,
	".so":   true,
	".dylib": true,

	// Fonts
	".woff":  true,
	".woff2": true,
	".ttf":   true,
	".eot":   true,
	".otf":   true,

	// Other binary
	".node": true,
	".wasm": true,
}

// IsBinaryFile checks if a file path has a binary extension
func IsBinaryFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return BinaryExtensions[ext]
}

// MaxPreviewSize is the maximum file size for text preview (1MB)
const MaxPreviewSize = 1024 * 1024
