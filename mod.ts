/**
 * @module atproto-oauth
 *
 * Framework-agnostic OAuth integration for AT Protocol applications.
 *
 * Provides complete OAuth flow handling for Bluesky/ATProto authentication
 * using standard Web Request/Response APIs. Works with any framework.
 *
 * @example
 * ```typescript
 * import { createATProtoOAuth } from "@tijs/atproto-oauth";
 * import { SQLiteStorage, valTownAdapter } from "@tijs/atproto-storage";
 *
 * const oauth = createATProtoOAuth({
 *   baseUrl: "https://myapp.example.com",
 *   appName: "My App",
 *   cookieSecret: Deno.env.get("COOKIE_SECRET")!,
 *   storage: new SQLiteStorage(valTownAdapter(sqlite)),
 * });
 *
 * // Mount routes in your framework
 * app.get("/login", (c) => oauth.handleLogin(c.req.raw));
 * app.get("/oauth/callback", (c) => oauth.handleCallback(c.req.raw));
 * app.get("/oauth-client-metadata.json", () => oauth.handleClientMetadata());
 *
 * // Get session in protected routes
 * const { session, setCookieHeader } = await oauth.getSessionFromRequest(request);
 * ```
 */

// Main factory function
export { createATProtoOAuth } from "./src/oauth.ts";

// Session management
export { OAuthSessions } from "./src/sessions.ts";

// Client metadata
export { generateClientMetadata } from "./src/client-metadata.ts";

// Types
export type {
  ATProtoOAuthConfig,
  ATProtoOAuthInstance,
  ClientMetadata,
  Logger,
  MobileOAuthStartRequest,
  MobileOAuthStartResponse,
  OAuthClientInterface,
  OAuthSessionFromRequestResult,
  OAuthSessionsInterface,
  OAuthState,
  OAuthStorage,
  SessionData,
  SessionInterface,
  SessionValidationResult,
  StoredOAuthSession,
} from "./src/types.ts";
