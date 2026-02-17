package observability

import legacy "shell-server-go/internal/logger"

type Logger = legacy.Logger
type Level = legacy.Level
type Config = legacy.Config

const (
	DEBUG = legacy.DEBUG
	INFO  = legacy.INFO
	WARN  = legacy.WARN
	ERROR = legacy.ERROR
)

func Init(cfg Config) {
	legacy.Init(cfg)
}

func Default() *Logger {
	return legacy.Default()
}

func WithComponent(component string) *Logger {
	return legacy.WithComponent(component)
}
