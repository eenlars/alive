// Module name determines the default binary name when running `go build .`
// Systemd service expects: shell-server-go (see ops/systemd/shell-server-go.service)
module shell-server-go

go 1.22

require (
	github.com/creack/pty v1.1.21
	github.com/getsentry/sentry-go v0.35.3
	github.com/gorilla/websocket v1.5.3
)

require (
	golang.org/x/sys v0.18.0 // indirect
	golang.org/x/text v0.14.0 // indirect
)
