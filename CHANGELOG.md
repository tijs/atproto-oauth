# Changelog

All notable changes to this project will be documented in this file.

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
