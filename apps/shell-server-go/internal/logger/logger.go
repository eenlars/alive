package logger

import (
	"fmt"
	"io"
	"log"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Level represents log severity
type Level int

const (
	DEBUG Level = iota
	INFO
	WARN
	ERROR
)

func (l Level) String() string {
	switch l {
	case DEBUG:
		return "DEBUG"
	case INFO:
		return "INFO"
	case WARN:
		return "WARN"
	case ERROR:
		return "ERROR"
	default:
		return "UNKNOWN"
	}
}

// Colors for terminal output
const (
	colorReset = "\033[0m"
	colorDebug = "\033[36m" // Cyan
	colorInfo  = "\033[32m" // Green
	colorWarn  = "\033[33m" // Yellow
	colorError = "\033[31m" // Red
)

func (l Level) Color() string {
	switch l {
	case DEBUG:
		return colorDebug
	case INFO:
		return colorInfo
	case WARN:
		return colorWarn
	case ERROR:
		return colorError
	default:
		return colorReset
	}
}

// Logger provides structured logging
type Logger struct {
	mu        sync.Mutex
	output    io.Writer
	minLevel  Level
	component string
	fields    map[string]interface{}
	useColor  bool
}

// Config for creating a new logger
type Config struct {
	Output   io.Writer
	MinLevel Level
	UseColor bool
}

var (
	defaultLogger *Logger
	once          sync.Once
)

// Init initializes the default logger
func Init(cfg Config) {
	once.Do(func() {
		if cfg.Output == nil {
			cfg.Output = os.Stdout
		}
		defaultLogger = &Logger{
			output:   cfg.Output,
			minLevel: cfg.MinLevel,
			useColor: cfg.UseColor,
			fields:   make(map[string]interface{}),
		}
		// Redirect standard log to our logger
		log.SetOutput(&logAdapter{logger: defaultLogger})
		log.SetFlags(0)
	})
}

// logAdapter adapts standard log to our logger
type logAdapter struct {
	logger *Logger
}

func (a *logAdapter) Write(p []byte) (n int, err error) {
	msg := strings.TrimSpace(string(p))
	a.logger.Info(msg)
	return len(p), nil
}

// Default returns the default logger
func Default() *Logger {
	if defaultLogger == nil {
		Init(Config{
			Output:   os.Stdout,
			MinLevel: INFO,
			UseColor: true,
		})
	}
	return defaultLogger
}

// WithComponent creates a logger with a component name
func WithComponent(component string) *Logger {
	l := Default()
	return &Logger{
		output:    l.output,
		minLevel:  l.minLevel,
		component: component,
		fields:    make(map[string]interface{}),
		useColor:  l.useColor,
	}
}

// WithField returns a new logger with an additional field
func (l *Logger) WithField(key string, value interface{}) *Logger {
	newFields := make(map[string]interface{}, len(l.fields)+1)
	for k, v := range l.fields {
		newFields[k] = v
	}
	newFields[key] = value
	return &Logger{
		output:    l.output,
		minLevel:  l.minLevel,
		component: l.component,
		fields:    newFields,
		useColor:  l.useColor,
	}
}

// WithFields returns a new logger with additional fields
func (l *Logger) WithFields(fields map[string]interface{}) *Logger {
	newFields := make(map[string]interface{}, len(l.fields)+len(fields))
	for k, v := range l.fields {
		newFields[k] = v
	}
	for k, v := range fields {
		newFields[k] = v
	}
	return &Logger{
		output:    l.output,
		minLevel:  l.minLevel,
		component: l.component,
		fields:    newFields,
		useColor:  l.useColor,
	}
}

// log writes a log entry
func (l *Logger) log(level Level, msg string, args ...interface{}) {
	if level < l.minLevel {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	// Format message
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}

	// Build log line
	var sb strings.Builder
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")

	if l.useColor {
		sb.WriteString(fmt.Sprintf("%s[%s]%s ", level.Color(), level.String(), colorReset))
	} else {
		sb.WriteString(fmt.Sprintf("[%s] ", level.String()))
	}

	sb.WriteString(timestamp)

	if l.component != "" {
		sb.WriteString(fmt.Sprintf(" [%s]", l.component))
	}

	sb.WriteString(" ")
	sb.WriteString(msg)

	// Add fields
	if len(l.fields) > 0 {
		sb.WriteString(" |")
		for k, v := range l.fields {
			sb.WriteString(fmt.Sprintf(" %s=%v", k, v))
		}
	}

	sb.WriteString("\n")

	fmt.Fprint(l.output, sb.String())
}

// Debug logs a debug message
func (l *Logger) Debug(msg string, args ...interface{}) {
	l.log(DEBUG, msg, args...)
}

// Info logs an info message
func (l *Logger) Info(msg string, args ...interface{}) {
	l.log(INFO, msg, args...)
}

// Warn logs a warning message
func (l *Logger) Warn(msg string, args ...interface{}) {
	l.log(WARN, msg, args...)
}

// Error logs an error message
func (l *Logger) Error(msg string, args ...interface{}) {
	l.log(ERROR, msg, args...)
}

// ErrorWithStack logs an error with stack trace
func (l *Logger) ErrorWithStack(msg string, err error) {
	buf := make([]byte, 4096)
	n := runtime.Stack(buf, false)
	l.WithField("error", err.Error()).WithField("stack", string(buf[:n])).Error(msg)
}

// Package-level convenience functions

func Debug(msg string, args ...interface{}) { Default().Debug(msg, args...) }
func Info(msg string, args ...interface{})  { Default().Info(msg, args...) }
func Warn(msg string, args ...interface{})  { Default().Warn(msg, args...) }
func Error(msg string, args ...interface{}) { Default().Error(msg, args...) }
