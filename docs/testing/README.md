# Testing Strategy (Claude Bridge)

This README is the top-level testing guide. It links to detailed docs and
captures the patterns we expect humans and AI to follow.

## Core principles (industry guidance)

1) Fast, reliable, isolating feedback loops
- Tests should be fast, reliable, and isolate failures so fixes are quick and
  scoped. Long, flaky suites erode trust and slow development.

2) Test pyramid, not ice-cream cone
- Keep many low-level tests, fewer integration tests, and very few end-to-end
  tests. The pyramid shape keeps suites fast and maintainable.

3) Size and scope matter
- Google categorizes tests by size (Small/Medium/Large) with explicit limits on
  network access, external dependencies, and time. Treat size as a contract,
  not a label.

4) Hermetic tests reduce flakiness
- Flakiness often comes from dependencies and environmental instability. Make
  tests hermetic (no external dependencies) to reduce non-determinism.

5) AI systems require continuous TEVV
- AI systems should be tested before deployment and regularly while in
  operation. The NIST AI RMF calls for objective, repeatable test, evaluation,
  verification, and validation (TEVV) processes with documented metrics and
  independent review.

6) Production AI needs explicit tests + monitoring
- The ML Test Score paper proposes 28 specific tests and monitoring needs to
  improve production readiness and reduce ML technical debt.

## Test size contract (Small/Medium/Large)

Use this as a default contract for speed, isolation, and reliability.

| Feature | Small | Medium | Large |
| --- | --- | --- | --- |
| Network access | No | localhost only | Yes |
| Database | No | Yes | Yes |
| File system access | No | Yes | Yes |
| Use external systems | No | Discouraged | Yes |
| Multiple threads | No | Yes | Yes |
| Sleep statements | No | Yes | Yes |
| System properties | No | Yes | Yes |
| Time limit (seconds) | 60 | 300 | 900+ |

Small ~= unit, Medium ~= integration, Large ~= end-to-end/system tests.

Also: tests should be able to run in any order and not depend on leftovers from
other tests.

## How this applies to Claude Bridge

Keep the shortest feedback loop possible:
- Prefer unit + integration tests for most changes, especially API routes and
  security boundaries.
- Use E2E tests sparingly, focused on critical user journeys.

Mandatory rules already documented in this repo still apply:
- Security-critical logic must be fully tested (path traversal, auth/session,
  workspace boundaries).
- New API routes must have auth, happy-path, and error-path tests.
- E2E tests must avoid real Claude API calls (use mocks).

See these guides for detail:
- docs/testing/UNIT_TESTING.md
- docs/testing/INTEGRATION_TESTING.md
- docs/testing/E2E_TESTING.md
- docs/testing/TEST_PATTERNS.md
- docs/testing/TESTING_FAILURE_MODES.md

## AI-heavy testing patterns (consultancy guidance)

When AI changes behavior, treat evals as tests:
- Maintain a regression eval set of real prompts and expected tool actions.
- Run evals before merge and on deploy; compare drift vs. last green baseline.
- Log eval inputs/outputs so failures are debuggable and reproducible.

Operationalize TEVV:
- Define metrics for correctness, safety, and reliability.
- Test pre-deploy and keep measuring post-deploy in production-like settings.
- Document metrics, assumptions, and known limitations; add independent review
  for high-risk changes.

Monitoring is part of testing:
- Add alerts for regressions in key metrics and for tool failures.
- Treat monitoring failures as test failures that block releases.

## References

- Martin Fowler, "The Practical Test Pyramid" (test pyramid, granularity).
  https://martinfowler.com/articles/practical-test-pyramid.html
- Google Testing Blog, "Just Say No to More End-to-End Tests" (feedback loop and pyramid).
  https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end.html
- Google Testing Blog, "Test Sizes" (Small/Medium/Large contract).
  https://testing.googleblog.com/2010/12/test-sizes.html
- Google Testing Blog, "Test Flakiness" (hermetic environments).
  https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how.html
- NIST AI RMF 1.0 (TEVV, pre/post-deploy testing).
  https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf
- Breck et al., "The ML Test Score" (tests + monitoring for production ML).
  https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/
