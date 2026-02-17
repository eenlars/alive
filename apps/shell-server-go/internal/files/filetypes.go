package files

import (
	"path/filepath"
	"strings"
)

// BinaryExtensions contains file extensions that should not be previewed as text.
var BinaryExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".ico": true,
	".webp": true, ".bmp": true, ".svg": true,
	".pdf": true,
	".zip": true, ".tar": true, ".gz": true, ".rar": true, ".7z": true,
	".mp3": true, ".wav": true, ".ogg": true, ".m4a": true,
	".mp4": true, ".avi": true, ".mov": true, ".mkv": true, ".webm": true,
	".exe": true, ".dll": true, ".so": true, ".dylib": true,
	".woff": true, ".woff2": true, ".ttf": true, ".eot": true, ".otf": true,
	".node": true, ".wasm": true,
}

// MaxPreviewSize is the maximum file size for text preview (1MB).
const MaxPreviewSize = 1024 * 1024

// IsBinaryFile checks if a file path has a binary extension.
func IsBinaryFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return BinaryExtensions[ext]
}
