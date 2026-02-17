package terminal

import "errors"

var (
	ErrMissingLease       = errors.New("missing lease token")
	ErrInvalidLease       = errors.New("invalid lease token")
	ErrExpiredLease       = errors.New("expired lease token")
	ErrLeaseSessionDenied = errors.New("lease session mismatch")
)

// IsLeaseError checks if err is one of the known lease errors.
func IsLeaseError(err error) bool {
	return errors.Is(err, ErrMissingLease) ||
		errors.Is(err, ErrInvalidLease) ||
		errors.Is(err, ErrExpiredLease) ||
		errors.Is(err, ErrLeaseSessionDenied)
}
