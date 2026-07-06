@CLAUDE.md

## Review Guidelines & Checklist

Review this PR against our team checklist:

### Style Guide

- [ ] Keep it simple; don't get clever.
- [ ] Give functions and files clear names and purposes.
- [ ] Avoid inline comments.
- [ ] Resist premature abstraction.
- [ ] Favor composition over inheritance.
- [ ] Avoid nesting the Happy Path.
- [ ] Write tests to enable confident refactoring.
- [ ] Leave the codebase better than you found it.
- [ ] Decide a distinction once.

### Code Quality
- [ ] Meaningful variable names
- [ ] DRY principle followed
- [ ] No cross-silo code; no game logic in the UI, no UI code in the game engine
- [ ] Game engine is pure
- [ ] No tech debt is introduced
- [ ] No unnecessary React hooks such as `useCallback` or `useMemo`. The React Compiler is enabled, making most of those unnecessary
- [ ] Code should use shadcn/ui primitives wherever possible. Flag code that should be a shadcn primitive unless it has a justifying JSDoc

### Testing
- [ ] Unit tests for new functions
- [ ] e2e tests for new UI
- [ ] Edge cases covered

### Security
- [ ] No hardcoded credentials
- [ ] Input validation implemented
- [ ] Proper error handling
- [ ] No sensitive data in logs

Do not attempt external MCP or API calls (except to GitHub), such as to Neon or Vercel, to verify deployment or database details. You also do not need to install dependencies, run tests, or lint.