package sentryx

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/getsentry/sentry-go"
)

const defaultDSN = "https://84e50be97b3c02134ee7c1e4d60cf8c9@sentry.sonno.tech/2"

var (
	initOnce sync.Once
	enabled  bool
)

func Init(service string) {
	initOnce.Do(func() {
		dsn := os.Getenv("SENTRY_DSN")
		if dsn == "" {
			dsn = defaultDSN
		}

		if dsn == "" {
			return
		}

		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              dsn,
			Environment:      envOr("STREAM_ENV", "unknown"),
			ServerName:       service,
			AttachStacktrace: true,
		}); err != nil {
			return
		}
		enabled = true
	})
}

func CaptureError(err error, message string, args ...any) {
	if !enabled {
		return
	}
	if err == nil {
		return
	}

	msg := message
	if len(args) > 0 {
		msg = fmt.Sprintf(message, args...)
	}

	sentry.WithScope(func(scope *sentry.Scope) {
		if msg != "" {
			scope.SetTag("log_message", msg)
		}
		sentry.CaptureException(err)
	})
}

func CaptureMessage(level sentry.Level, message string, args ...any) {
	if !enabled {
		return
	}
	if len(args) > 0 {
		message = fmt.Sprintf(message, args...)
	}
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(level)
		sentry.CaptureMessage(message)
	})
}

func RecoverPanicAndCapture() {
	if !enabled {
		return
	}
	if rec := recover(); rec != nil {
		sentry.CurrentHub().Recover(rec)
		sentry.Flush(2 * time.Second)
		panic(rec)
	}
}

func Flush(timeout time.Duration) {
	if !enabled {
		return
	}
	sentry.Flush(timeout)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
