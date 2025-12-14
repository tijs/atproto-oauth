# Changelog

All notable changes to this project will be documented in this file.

## [2.4.0] - 2025-12-14

### Added

- **Custom OAuth scopes**: The `scope` config option is now properly passed to
  the authorization request. Previously, the scope was only used in client
  metadata but not in the actual PAR (Pushed Authorization Request), causing
  OAuth to fail when using granular scopes instead of `transition:generic`.

## [2.3.0] - 2025-11-29

### Added

- **README improvements**: Added "Why Use This Library?" section explaining the
  BFF pattern, use cases, tradeoffs, and when to consider alternatives

## [2.2.1] - 2025-11-29

### Added

- **Documentation resources**: Added links to AT Protocol OAuth documentation
  and official example implementations in both guides

## [2.2.0] - 2025-11-29

### Added

- **Documentation**: Added comprehensive guides for web and mobile
  authentication:
  - [Web Authentication Guide](./docs/web-authentication.md) - Cookie-based auth
    for web apps
  - [Mobile Authentication Guide](./docs/mobile-authentication.md) - Secure
    WebView auth for iOS/Android

## [2.1.0] - 2025-11-29

### Added

- **Restored mobile OAuth redirect support**: Mobile apps using
  ASWebAuthenticationSession (iOS) or Custom Tabs (Android) need the callback to
  redirect to their URL scheme to complete the OAuth flow.

  - `mobileScheme` config option - URL scheme for app callback (e.g.,
    "myapp://auth-callback")
  - `mobile=true` query parameter on `/login` - Enables mobile flow
  - `mobile` field in `OAuthState` - Tracks mobile flow through OAuth
  - Mobile callback with `session_token`, `did`, and `handle` query params

### Example

```typescript
const oauth = createATProtoOAuth({
  // ... other config
  mobileScheme: "anchor-app://auth-callback",
});

// Mobile app opens: /login?handle=user.bsky.social&mobile=true
// After OAuth, redirects to: anchor-app://auth-callback?session_token=...&did=...&handle=...
```

### Security

- Mobile redirects always use the server-configured `mobileScheme`
- Client-specified redirect schemes are NOT allowed to prevent OAuth redirect
  attacks
- Session cookie is also set as fallback for cookie-based API auth

Note: This does NOT restore Bearer token authentication - mobile apps use
cookie-based auth for API calls after the initial OAuth redirect.

### Changed

- Updated `@tijs/atproto-sessions` dependency to 2.1.0

## [2.0.0] - 2025-11-29

### Breaking Changes

- **Removed mobile OAuth support**: The following features have been removed as
  they were unused (the Anchor iOS app uses cookie-based auth via a WebView):
  - `mobileScheme` config option - No longer needed
  - `mobile` query parameter on `/login` - Removed
  - `code_challenge` query parameter on `/login` - Removed
  - Mobile callback with `session_token` - Removed
  - Bearer token authentication in `getSessionFromRequest()` - Removed (now
    cookie-only)
- **Removed types**: `MobileOAuthStartRequest`, `MobileOAuthStartResponse`
- **Simplified `OAuthState`**: Removed `mobile` and `codeChallenge` fields

The library now focuses solely on cookie-based session management for web
applications. Mobile apps should use app-specific WebView flows with cookie
authentication.

### Changed

- Updated `@tijs/atproto-sessions` dependency to 2.0.0

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
