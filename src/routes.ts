/**
 * OAuth route handlers for ATProto authentication
 * Framework-agnostic - works with standard Request/Response APIs
 */

import type { OAuthStorage } from "@tijs/atproto-storage";
import type { SessionManager } from "@tijs/atproto-sessions";
import { isValidHandle } from "@atproto/syntax";

import type {
  Logger,
  OAuthClientInterface,
  OAuthSessionFromRequestResult,
  OAuthSessionsInterface,
  OAuthState,
} from "./types.ts";
import type { OAuthSessions } from "./sessions.ts";

/**
 * Configuration for route handlers
 */
export interface RouteHandlersConfig {
  baseUrl: string;
  oauthClient: OAuthClientInterface;
  sessionManager: SessionManager;
  oauthSessions: OAuthSessions;
  storage: OAuthStorage;
  sessionTtl: number;
  logger: Logger;
}

/**
 * Create route handlers for OAuth authentication
 */
export function createRouteHandlers(config: RouteHandlersConfig): {
  handleLogin: (request: Request) => Promise<Response>;
  handleCallback: (request: Request) => Promise<Response>;
  handleLogout: (request: Request) => Promise<Response>;
  getSessionFromRequest: (
    request: Request,
  ) => Promise<OAuthSessionFromRequestResult>;
  sessions: OAuthSessionsInterface;
} {
  const {
    oauthClient,
    sessionManager,
    oauthSessions,
    storage,
    sessionTtl,
    logger,
  } = config;

  /**
   * Handle /login route - start OAuth flow
   *
   * Query parameters:
   * - handle: User's AT Protocol handle (required)
   * - redirect: Relative path to redirect after OAuth (optional)
   */
  async function handleLogin(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const handle = url.searchParams.get("handle");
    const redirect = url.searchParams.get("redirect");

    if (!handle || typeof handle !== "string") {
      return new Response("Invalid handle", { status: 400 });
    }

    if (!isValidHandle(handle)) {
      return new Response("Invalid handle format", { status: 400 });
    }

    try {
      const state: OAuthState = {
        handle,
        timestamp: Date.now(),
      };

      // Store redirect path (validate it's a relative path)
      if (redirect) {
        // Security: Only allow relative paths starting with /
        if (redirect.startsWith("/") && !redirect.startsWith("//")) {
          state.redirectPath = redirect;
        } else {
          logger.warn(`Invalid redirect path ignored: ${redirect}`);
        }
      }

      const authUrl = await oauthClient.authorize(handle, {
        state: JSON.stringify(state),
      });

      return new Response(null, {
        status: 302,
        headers: { Location: authUrl.toString() },
      });
    } catch (err) {
      logger.error("OAuth authorize failed:", err);
      return new Response(
        err instanceof Error ? err.message : "Couldn't initiate login",
        { status: 400 },
      );
    }
  }

  /**
   * Handle /oauth/callback route - complete OAuth flow
   */
  async function handleCallback(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const params = url.searchParams;

      const code = params.get("code");
      const stateParam = params.get("state");

      if (!code || !stateParam) {
        return new Response("Missing code or state parameters", {
          status: 400,
        });
      }

      // Parse state
      let state: OAuthState;
      try {
        state = JSON.parse(stateParam);
      } catch {
        return new Response("Invalid state parameter", { status: 400 });
      }

      // Complete OAuth callback
      const callbackResult = await oauthClient.callback(params);
      const { session: oauthSession } = callbackResult;
      const did = oauthSession.did;

      // Store OAuth session data with TTL
      await storage.set(`session:${did}`, oauthSession.toJSON(), {
        ttl: sessionTtl,
      });

      // Create session cookie
      const now = Date.now();
      const setCookieHeader = await sessionManager.createSession({
        did,
        createdAt: now,
        lastAccessed: now,
      });

      // Redirect to stored path or home
      const redirectPath = state.redirectPath || "/";

      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectPath,
          "Set-Cookie": setCookieHeader,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("OAuth callback failed:", error);
      return new Response(`OAuth callback failed: ${message}`, { status: 400 });
    }
  }

  /**
   * Handle /api/auth/logout route
   */
  async function handleLogout(request: Request): Promise<Response> {
    try {
      // Try to get current session to clean up OAuth data
      const sessionResult = await sessionManager.getSessionFromRequest(request);
      if (sessionResult.data?.did) {
        await storage.delete(`session:${sessionResult.data.did}`);
      }

      // Clear session cookie
      const clearCookie = sessionManager.getClearCookieHeader();

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": clearCookie,
        },
      });
    } catch (error) {
      logger.error("Logout failed:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Logout failed" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Get OAuth session from request (cookie-based)
   */
  async function getSessionFromRequest(
    request: Request,
  ): Promise<OAuthSessionFromRequestResult> {
    // Check for session cookie
    const sessionResult = await sessionManager.getSessionFromRequest(request);
    if (!sessionResult.data?.did) {
      return {
        session: null,
        error: sessionResult.error
          ? {
            type: sessionResult.error.type as
              | "NO_COOKIE"
              | "INVALID_COOKIE"
              | "SESSION_EXPIRED"
              | "UNKNOWN",
            message: sessionResult.error.message,
            details: sessionResult.error.details,
          }
          : { type: "NO_COOKIE", message: "No session found" },
      };
    }

    // Get OAuth session
    try {
      const oauthSession = await oauthSessions.getOAuthSession(
        sessionResult.data.did,
      );
      if (!oauthSession) {
        return {
          session: null,
          setCookieHeader: sessionResult.setCookieHeader,
          error: {
            type: "SESSION_EXPIRED",
            message: "OAuth session not found in storage",
          },
        };
      }

      return {
        session: oauthSession,
        setCookieHeader: sessionResult.setCookieHeader,
      };
    } catch (error) {
      return {
        session: null,
        setCookieHeader: sessionResult.setCookieHeader,
        error: {
          type: "OAUTH_ERROR",
          message: error instanceof Error
            ? error.message
            : "OAuth session restore failed",
          details: error,
        },
      };
    }
  }

  return {
    handleLogin,
    handleCallback,
    handleLogout,
    getSessionFromRequest,
    sessions: oauthSessions,
  };
}
