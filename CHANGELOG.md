# Changelog

All notable changes to this project will be documented in this file.

## [1.1.1] - 2025-11-28

### Fixed

- Updated `@tijs/atproto-sessions` to 1.0.1 which fixes mobile token cookie
  compatibility. Mobile tokens now work correctly when iOS apps set them as
  cookies.

## [1.1.0] - 2025-11-28

### Added

- **Native mobile OAuth support via query parameters**: The `/login` endpoint
  now accepts mobile-specific query parameters for native app integration:
  - `mobile=true` - Enable mobile flow with server-configured mobileScheme
    redirect
  - `code_challenge` - PKCE code_challenge (stored for future external PKCE
    support)

### Example

```typescript
// Mobile app generates login URL:
const loginUrl = new URL("https://yourapp.com/login");
loginUrl.searchParams.set("handle", "user.bsky.social");
loginUrl.searchParams.set("mobile", "true");

// Open in WebView, callback redirects to configured mobileScheme with tokens
```

### Security

Mobile redirects always use the server-configured `mobileScheme` from
`createATProtoOAuth()` config. Client-specified redirect schemes are NOT allowed
to prevent OAuth redirect attacks.

This eliminates the need for appview workarounds that create fake "pending"
sessions - the library now handles mobile flows natively.

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
