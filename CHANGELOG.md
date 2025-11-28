# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-11-28

### Breaking Changes

- **Logger interface**: Changed from 3 methods (`log`, `warn`, `error`) to 4
  methods (`debug`, `info`, `warn`, `error`) for compatibility with
  oauth-client-deno. This allows unified logging across all AT Protocol OAuth
  libraries.

### Migration Guide

**Logger interface:**

```typescript
// Before
const oauth = createATProtoOAuth({
  // ...
  logger: {
    log: console.log,
    warn: console.warn,
    error: console.error,
  },
});

// After
const oauth = createATProtoOAuth({
  // ...
  logger: {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  },
});

// Or simply pass console (which has all 4 methods):
const oauth = createATProtoOAuth({
  // ...
  logger: console,
});
```

### Changed

- Updated `@tijs/atproto-sessions` dependency to 1.0.0

## [0.1.1] - 2025-11-28

### Added

- `getClearCookieHeader()` method on `ATProtoOAuthInstance` for custom logout
  flows and error handling scenarios

## [0.1.0] - 2025-11-27

### Added

- Initial release
- `createATProtoOAuth()` factory function for complete OAuth integration
- Framework-agnostic route handlers using standard Request/Response APIs:
  - `handleLogin()` - Start OAuth flow
  - `handleCallback()` - Complete OAuth flow
  - `handleClientMetadata()` - Serve OAuth client metadata
  - `handleLogout()` - Log out and clear session
- `getSessionFromRequest()` for getting authenticated sessions with cookie
  refresh
- `OAuthSessions` class for direct session management
- Support for both web (cookie) and mobile (Bearer token) authentication
- Automatic token refresh via `@tijs/oauth-client-deno`
- Type exports for `SessionInterface`, `ATProtoOAuthConfig`, etc.
