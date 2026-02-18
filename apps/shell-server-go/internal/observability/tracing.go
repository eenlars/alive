package observability

import "context"

// Span is a no-op tracing span placeholder.
type Span struct{}

func StartSpan(ctx context.Context, _ string) (context.Context, *Span) {
	if ctx == nil {
		ctx = context.Background()
	}
	return ctx, &Span{}
}

func (s *Span) End() {}
