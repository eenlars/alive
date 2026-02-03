---
name: revise-code
description: Comprehensive code review covering quality, bugs, security, performance, TypeScript safety, React patterns, testing, and documentation.
---

# Revise Code - Comprehensive Code Review

Perform a thorough code review to identify issues and improve code quality.

## Code Quality & Best Practices

- Are there any code smells or anti-patterns?
- Is the code following DRY (Don't Repeat Yourself) principles?
- Are functions and components properly decomposed (single responsibility)?
- Is the code readable and maintainable?
- Are there any overly complex functions that should be simplified?
- Is error handling implemented consistently and properly?

## Potential Bugs & Edge Cases

- Are there any logical errors or off-by-one errors?
- Are null/undefined values handled properly?
- Are there any potential race conditions or timing issues?
- Are array/object operations safe (checking length/existence)?
- Are there any unhandled promise rejections or async errors?
- Are type assertions/casts safe, or could they cause runtime errors?

## Security Vulnerabilities

- Are there any XSS (Cross-Site Scripting) vulnerabilities?
- Is user input properly sanitized and validated?
- Are sensitive data (API keys, passwords) properly handled?
- Are there any path traversal vulnerabilities in file operations?
- Is authentication/authorization implemented correctly?

## Performance Issues

- Are there any unnecessary re-renders (React)?
- Are expensive computations memoized when needed?
- Are there any memory leaks (event listeners not cleaned up)?
- Are there inefficient loops or algorithms?
- Are large data structures handled efficiently?
- Are there any blocking operations that should be async?

## TypeScript/Type Safety

- Are there any `any` types that should be properly typed?
- Are type definitions accurate and complete?
- Are there missing null checks where types allow null/undefined?
- Are discriminated unions used correctly?
- Are generic types properly constrained?
- Are there any type casting that bypass safety?

## React/Frontend Specific

- Are hooks used correctly (dependencies, rules of hooks)?
- Are components properly memoized when needed?
- Is state management appropriate (local vs global)?
- Are side effects properly handled in useEffect?
- Are refs used correctly?
- Is accessibility (a11y) considered?

## API/Backend Specific

- Are API responses properly validated?
- Are HTTP status codes used correctly?
- Is request/response data properly typed?

## Testing & Reliability

- Are there critical paths without tests?
- Are edge cases covered in tests?
- Are error scenarios tested?
- Are mocks/stubs used appropriately?
- Is the code testable (proper dependency injection)?

## Dependencies & Imports

- Are all imported dependencies actually used?
- Are there any deprecated dependencies or APIs?
- Are dependency versions compatible?
- Are there any circular dependencies?
- Should any dependencies be updated or replaced?

## Documentation & Comments

- Is complex logic properly commented?
- Are function/component purposes clear?
- Are there any misleading or outdated comments?
- Is documentation accurate and helpful?

---

Analyze the code thoroughly and provide specific issues found with file paths and line numbers where applicable.
