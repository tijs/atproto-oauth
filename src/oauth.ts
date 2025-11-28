/**
 * Main factory function for creating ATProto OAuth integration
 * Framework-agnostic - works with standard Request/Response APIs
 */

import { OAuthClient } from "@tijs/oauth-client-deno";
import { SessionManager } from "@tijs/atproto-sessions";

import type {
  ATProtoOAuthConfig,
  ATProtoOAuthInstance,
  Logger,
} from "./types.ts";
import { noopLogger } from "./types.ts";
import { generateClientMetadata } from "./client-metadata.ts";
import { OAuthSessions } from "./sessions.ts";
import { createRouteHandlers } from "./routes.ts";

/** Default session TTL: 7 days in seconds */
const DEFAULT_SESSION_TTL = 60 * 60 * 24 * 7;

/** Default mobile callback scheme */
const DEFAULT_MOBILE_SCHEME = "app://auth-callback";

/**
 * Create a complete ATProto OAuth integration for any framework.
 *
 * This function sets up everything needed for ATProto/Bluesky OAuth authentication,
 * with route handlers that work with standard Web Request/Response APIs.
 *
 * @param config - Configuration object for OAuth integration
 * @returns ATProto OAuth instance with route handlers and session management
 *
 * @example Basic setup
 * ```typescript
 * import { createATProtoOAuth } from "@tijs/atproto-oauth";
 * import { SQLiteStorage, valTownAdapter } from "@tijs/atproto-storage";
 *
 * const oauth = createATProtoOAuth({
 *   baseUrl: "https://myapp.example.com",
 *   appName: "My App",
 *   cookieSecret: Deno.env.get("COOKIE_SECRET")!,
 *   storage: new SQLiteStorage(valTownAdapter(sqlite)),
 *   sessionTtl: 60 * 60 * 24 * 14, // 14 days
 * });
 *
 * // Use route handlers in your framework
 * // Hono:
 * app.get("/login", (c) => oauth.handleLogin(c.req.raw));
 * app.get("/oauth/callback", (c) => oauth.handleCallback(c.req.raw));
 * app.get("/oauth-client-metadata.json", () => oauth.handleClientMetadata());
 * app.post("/api/auth/logout", (c) => oauth.handleLogout(c.req.raw));
 *
 * // Oak:
 * router.get("/login", (ctx) => ctx.respond = false; return oauth.handleLogin(ctx.request.originalRequest));
 *
 * // Fresh (Deno):
 * export const handler = async (req) => oauth.handleLogin(req);
 * ```
 *
 * @example Getting authenticated session in routes
 * ```typescript
 * app.get("/api/profile", async (c) => {
 *   const { session, setCookieHeader, error } = await oauth.getSessionFromRequest(c.req.raw);
 *
 *   if (!session) {
 *     return c.json({ error: error?.message || "Not authenticated" }, 401);
 *   }
 *
 *   // Make authenticated API call
 *   const response = await session.makeRequest(
 *     "GET",
 *     `${session.pdsUrl}/xrpc/app.bsky.actor.getProfile?actor=${session.did}`
 *   );
 *
 *   const profile = await response.json();
 *
 *   const res = c.json(profile);
 *   if (setCookieHeader) {
 *     res.headers.set("Set-Cookie", setCookieHeader);
 *   }
 *   return res;
 * });
 * ```
 */
export function createATProtoOAuth(
  config: ATProtoOAuthConfig,
): ATProtoOAuthInstance {
  // Validate required config
  if (!config.baseUrl) {
    throw new Error("baseUrl is required");
  }
  if (!config.appName) {
    throw new Error("appName is required");
  }
  if (!config.cookieSecret) {
    throw new Error("cookieSecret is required");
  }
  if (config.cookieSecret.length < 32) {
    throw new Error(
      "cookieSecret must be at least 32 characters for secure encryption",
    );
  }
  if (!config.storage) {
    throw new Error("storage is required");
  }

  // Normalize baseUrl
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const sessionTtl = config.sessionTtl ?? DEFAULT_SESSION_TTL;
  const mobileScheme = config.mobileScheme ?? DEFAULT_MOBILE_SCHEME;
  const logger: Logger = config.logger ?? noopLogger;

  // Create OAuth client
  const oauthClient = new OAuthClient({
    clientId: `${baseUrl}/oauth-client-metadata.json`,
    redirectUri: `${baseUrl}/oauth/callback`,
    storage: config.storage,
    logger: {
      debug: (msg: string, ...args: unknown[]) => {
        logger.log(`[DEBUG] ${msg}`, ...args);
      },
      info: (msg: string, ...args: unknown[]) => {
        logger.log(`[INFO] ${msg}`, ...args);
      },
      warn: (msg: string, ...args: unknown[]) => {
        logger.warn(msg, ...args);
      },
      error: (msg: string, ...args: unknown[]) => {
        logger.error(msg, ...args);
      },
    },
  });

  // Create session manager for cookie handling
  const sessionManager = new SessionManager({
    cookieSecret: config.cookieSecret,
    cookieName: "sid",
    sessionTtl,
    logger,
  });

  // Create OAuth sessions manager
  const oauthSessions = new OAuthSessions({
    oauthClient,
    storage: config.storage,
    sessionTtl,
    logger,
  });

  // Create route handlers
  const handlers = createRouteHandlers({
    baseUrl,
    oauthClient,
    sessionManager,
    oauthSessions,
    storage: config.storage,
    sessionTtl,
    mobileScheme,
    logger,
  });

  // Generate client metadata
  const clientMetadata = generateClientMetadata({
    ...config,
    baseUrl,
  });

  /**
   * Handle /oauth-client-metadata.json route
   */
  function handleClientMetadata(): Response {
    return new Response(JSON.stringify(clientMetadata), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  return {
    handleLogin: handlers.handleLogin,
    handleCallback: handlers.handleCallback,
    handleClientMetadata,
    handleLogout: handlers.handleLogout,
    getSessionFromRequest: handlers.getSessionFromRequest,
    getClientMetadata: () => clientMetadata,
    getClearCookieHeader: () => sessionManager.getClearCookieHeader(),
    sessions: handlers.sessions,
  };
}
