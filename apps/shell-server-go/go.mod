// Module name determines the default binary name when running `go build .`
// Systemd service expects: shell-server-go (see ops/systemd/shell-server-go.service)
module shell-server-go

go 1.22

require (
	github.com/creack/pty v1.1.21
	github.com/gorilla/websocket v1.5.3
)
