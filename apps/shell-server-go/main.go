package main

import (
	"fmt"
	"os"
	"time"

	"shell-server-go/internal/app"
	"shell-server-go/internal/sentryx"
)

func main() {
	sentryx.Init("shell-server-go")
	defer sentryx.Flush(2 * time.Second)

	clientFS, err := GetEmbeddedClientFS()
	if err != nil {
		sentryx.CaptureError(err, "failed to load embedded client files")
		fmt.Fprintf(os.Stderr, "failed to load embedded client files: %v\n", err)
		os.Exit(1)
	}

	if err := app.Run(clientFS, ""); err != nil {
		sentryx.CaptureError(err, "shell-server-go failed")
		fmt.Fprintf(os.Stderr, "server failed: %v\n", err)
		os.Exit(1)
	}
}
