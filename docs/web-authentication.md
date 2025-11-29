# Web Authentication Guide

This guide covers implementing AT Protocol OAuth for web applications using
`@tijs/atproto-oauth`.

## Overview

Web authentication uses a standard OAuth 2.0 flow with PKCE:

1. User clicks "Login" and enters their Bluesky handle
2. Your server redirects to the user's authorization server
3. User approves access
4. Authorization server redirects back with an authorization code
5. Your server exchanges the code for tokens
6. Session cookie is set for subsequent requests

## Setup

### Installation

```typescript
import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth";
import { SQLiteStorage, valTownAdapter } from "jsr:@tijs/atproto-storage";
```

### Configuration

```typescript
const oauth = createATProtoOAuth({
  baseUrl: "https://myapp.example.com",
  appName: "My App",
  cookieSecret: Deno.env.get("COOKIE_SECRET")!, // At least 32 characters
  storage: new SQLiteStorage(valTownAdapter(sqlite)),
  sessionTtl: 60 * 60 * 24 * 14, // 14 days (max for public clients)
  logoUri: "https://myapp.example.com/logo.png", // Optional
  policyUri: "https://myapp.example.com/privacy", // Optional
  logger: console, // Optional, for debugging
});
```

## Route Handlers

Mount these routes in your web framework. Examples shown for Hono:

### Login Route

Starts the OAuth flow. Accepts `handle` as a query parameter.

```typescript
app.get("/login", (c) => oauth.handleLogin(c.req.raw));
```

**Request:** `GET /login?handle=alice.bsky.social`

The user is redirected to their authorization server (e.g., bsky.social).

### Callback Route

Handles the OAuth callback after user authorization.

```typescript
app.get("/oauth/callback", (c) => oauth.handleCallback(c.req.raw));
```

On success, sets a session cookie and redirects to `/` (or a custom path).

### Client Metadata Route

Required by AT Protocol OAuth. Serves your app's OAuth client metadata.

```typescript
app.get("/oauth-client-metadata.json", () => oauth.handleClientMetadata());
```

### Logout Route

Clears the session cookie and OAuth tokens.

```typescript
app.post("/api/auth/logout", (c) => oauth.handleLogout(c.req.raw));
```

## Protecting Routes

Use `getSessionFromRequest()` to check authentication:

```typescript
app.get("/api/profile", async (c) => {
  const { session, setCookieHeader, error } = await oauth.getSessionFromRequest(
    c.req.raw,
  );

  if (!session) {
    return c.json({ error: error?.message || "Not authenticated" }, 401);
  }

  // Make authenticated API call to user's PDS
  const response = await session.makeRequest(
    "GET",
    `${session.pdsUrl}/xrpc/app.bsky.actor.getProfile?actor=${session.did}`,
  );

  const profile = await response.json();

  // Important: refresh the session cookie
  const res = c.json(profile);
  if (setCookieHeader) {
    res.headers.set("Set-Cookie", setCookieHeader);
  }
  return res;
});
```

### Session Object

The `session` object provides:

```typescript
interface SessionInterface {
  did: string; // User's DID (e.g., "did:plc:abc123")
  handle?: string; // User's handle (e.g., "alice.bsky.social")
  pdsUrl: string; // User's PDS URL
  accessToken: string; // Current access token
  refreshToken?: string; // Refresh token (if available)

  // Make authenticated requests with automatic DPoP handling
  makeRequest(
    method: string,
    url: string,
    options?: RequestInit,
  ): Promise<Response>;
}
```

### Error Handling

When `session` is null, check `error` for details:

```typescript
error?: {
  type: "NO_COOKIE" | "INVALID_COOKIE" | "SESSION_EXPIRED" | "OAUTH_ERROR" | "UNKNOWN";
  message: string;
  details?: unknown;
}
```

## Custom Redirect After Login

Pass a `redirect` query parameter to return users to a specific page:

```typescript
// Start login with redirect
const loginUrl = `/login?handle=${handle}&redirect=/dashboard`;
```

Only relative paths starting with `/` are allowed for security.

## Session Endpoint

You'll typically want a session check endpoint for your frontend:

```typescript
app.get("/api/auth/session", async (c) => {
  const { session, setCookieHeader } = await oauth.getSessionFromRequest(
    c.req.raw,
  );

  if (!session) {
    return c.json({ authenticated: false });
  }

  const res = c.json({
    authenticated: true,
    did: session.did,
    handle: session.handle,
  });

  if (setCookieHeader) {
    res.headers.set("Set-Cookie", setCookieHeader);
  }
  return res;
});
```

## Frontend Integration

### Login Form

```html
<form action="/login" method="get">
  <input type="text" name="handle" placeholder="alice.bsky.social" required />
  <button type="submit">Sign in with Bluesky</button>
</form>
```

### Check Authentication (JavaScript)

```javascript
async function checkAuth() {
  const response = await fetch("/api/auth/session", {
    credentials: "include",
  });
  const data = await response.json();

  if (data.authenticated) {
    console.log(`Logged in as ${data.handle}`);
  } else {
    console.log("Not logged in");
  }
}
```

### Logout

```javascript
async function logout() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  window.location.href = "/";
}
```

## Security Considerations

1. **Cookie Secret**: Use a strong, random secret of at least 32 characters.
   Store it securely (environment variable, secrets manager).

2. **HTTPS**: Always use HTTPS in production. The session cookie has `Secure`
   flag set.

3. **Session TTL**: AT Protocol spec limits public client sessions to 14 days
   maximum.

4. **CORS**: If your API is on a different domain, configure CORS appropriately.
   Session cookies require `credentials: "include"` on fetch requests.

## Complete Example

See the [Hono example](../README.md#hono-integration) in the main README for a
complete working setup.

## Resources

### AT Protocol Documentation

- [OAuth Specification](https://atproto.com/specs/oauth) - Full OAuth spec for
  AT Protocol
- [OAuth Introduction](https://atproto.com/guides/oauth) - Overview of OAuth
  patterns and app types
- [Building Applications Guide](https://atproto.com/guides/applications) - Quick
  start guide for AT Protocol apps

### Example Implementations

- [Go OAuth Web App](https://github.com/bluesky-social/cookbook/tree/main/go-oauth-web-app) -
  Official Bluesky web app example in Go
- [Python OAuth Web App](https://github.com/bluesky-social/cookbook/tree/main/python-oauth-web-app) -
  Official Bluesky web app example in Python
