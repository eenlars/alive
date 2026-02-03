package main

import (
	"embed"
	"io/fs"
)

//go:embed dist/client/*
//go:embed dist/client/assets/*
var embeddedClientFS embed.FS

// GetEmbeddedClientFS returns the client files, stripped of dist/client prefix
func GetEmbeddedClientFS() (fs.FS, error) {
	return fs.Sub(embeddedClientFS, "dist/client")
}
