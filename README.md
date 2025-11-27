# @tijs/atproto-oauth

Framework-agnostic OAuth integration for AT Protocol (Bluesky) applications.
Works with standard Web Request/Response APIs - no framework dependencies.

## Installation

```typescript
import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth";
import { SQLiteStorage, valTownAdapter } from "jsr:@tijs/atproto-storage";
```

## Usage

### Basic Setup

```typescript
import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth";
import { SQLiteStorage, valTownAdapter } from "jsr:@tijs/atproto-storage";
import { sqlite } from "https://esm.town/v/std/sqlite";

const oauth = createATProtoOAuth({
  baseUrl: "https://myapp.example.com",
  appName: "My App",
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  storage: new SQLiteStorage(valTownAdapter(sqlite)),
  sessionTtl: 60 * 60 * 24 * 14, // 14 days
});
```

### Hono Integration

```typescript
import { Hono } from "hono";

const app = new Hono();

// Mount OAuth routes
app.get("/login", (c) => oauth.handleLogin(c.req.raw));
app.get("/oauth/callback", (c) => oauth.handleCallback(c.req.raw));
app.get("/oauth-client-metadata.json", () => oauth.handleClientMetadata());
app.post("/api/auth/logout", (c) => oauth.handleLogout(c.req.raw));

// Protected route example
app.get("/api/profile", async (c) => {
  const { session, setCookieHeader, error } = await oauth.getSessionFromRequest(
    c.req.raw,
  );

  if (!session) {
    return c.json({ error: error?.message || "Not authenticated" }, 401);
  }

  // Make authenticated API call
  const response = await session.makeRequest(
    "GET",
    `${session.pdsUrl}/xrpc/app.bsky.actor.getProfile?actor=${session.did}`,
  );

  const profile = await response.json();

  const res = c.json(profile);
  if (setCookieHeader) {
    res.headers.set("Set-Cookie", setCookieHeader);
  }
  return res;
});
```

### Fresh (Deno) Integration

```typescript
// routes/login.ts
export const handler = async (req: Request) => {
  return oauth.handleLogin(req);
};

// routes/oauth/callback.ts
export const handler = async (req: Request) => {
  return oauth.handleCallback(req);
};
```

### Direct Access to Sessions

For advanced use cases, you can access the sessions manager directly:

```typescript
// Get session by DID
const session = await oauth.sessions.getOAuthSession(did);
if (session) {
  const response = await session.makeRequest("GET", url);
}

// Save session manually
await oauth.sessions.saveOAuthSession(session);

// Delete session
await oauth.sessions.deleteOAuthSession(did);
```

## Configuration

```typescript
interface ATProtoOAuthConfig {
  /** Base URL of your application */
  baseUrl: string;

  /** Display name for OAuth consent screen */
  appName: string;

  /** Cookie signing secret (at least 32 characters) */
  cookieSecret: string;

  /** Storage implementation for OAuth sessions */
  storage: OAuthStorage;

  /** Session TTL in seconds (default: 7 days) */
  sessionTtl?: number;

  /** URL to app logo for OAuth consent screen */
  logoUri?: string;

  /** URL to privacy policy */
  policyUri?: string;

  /** OAuth scope (default: "atproto transition:generic") */
  scope?: string;

  /** Mobile app callback scheme (default: "app://auth-callback") */
  mobileScheme?: string;

  /** Logger for debugging (default: no-op) */
  logger?: Logger;
}
```

## API

### `createATProtoOAuth(config)`

Creates an OAuth instance with the following methods:

- `handleLogin(request)` - Start OAuth flow (redirect to provider)
- `handleCallback(request)` - Complete OAuth flow (handle callback)
- `handleClientMetadata()` - Return OAuth client metadata JSON
- `handleLogout(request)` - Log out and clear session
- `getSessionFromRequest(request)` - Get authenticated session from request
- `getClientMetadata()` - Get client metadata object
- `sessions` - Access to session management interface

### Session Result

`getSessionFromRequest()` returns:

```typescript
{
  session: SessionInterface | null;
  setCookieHeader?: string;  // Set this on response to refresh session
  error?: {
    type: "NO_COOKIE" | "INVALID_COOKIE" | "SESSION_EXPIRED" | "OAUTH_ERROR" | "UNKNOWN";
    message: string;
    details?: unknown;
  };
}
```

### SessionInterface

The session object provides:

```typescript
interface SessionInterface {
  did: string; // User's DID
  handle?: string; // User's handle
  pdsUrl: string; // User's PDS URL
  accessToken: string;
  refreshToken?: string;

  // Make authenticated requests with automatic DPoP handling
  makeRequest(
    method: string,
    url: string,
    options?: RequestInit,
  ): Promise<Response>;
}
```

## Related Packages

- [@tijs/atproto-storage](https://jsr.io/@tijs/atproto-storage) - Storage
  implementations
- [@tijs/atproto-sessions](https://jsr.io/@tijs/atproto-sessions) - Session
  cookie management
- [@tijs/oauth-client-deno](https://jsr.io/@tijs/oauth-client-deno) - AT
  Protocol OAuth client

## License

MIT
