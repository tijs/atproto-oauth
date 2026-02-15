/**
 * OAuth route handlers for ATProto authentication
 * Framework-agnostic - works with standard Request/Response APIs
 */

import type { OAuthStorage } from "@tijs/atproto-storage";
import type { SessionManager } from "@tijs/atproto-sessions";
import { isValidHandle } from "@atproto/syntax";
import { IssuerMismatchError } from "@tijs/oauth-client-deno";

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
  /** URL scheme for mobile app OAuth callback (e.g. "myapp://auth-callback") */
  mobileScheme?: string;
  /** OAuth scope to request (defaults to "atproto transition:generic") */
  scope?: string;
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
    mobileScheme,
    scope,
  } = config;

  /**
   * Handle /login route - start OAuth flow
   *
   * Query parameters:
   * - handle: User's AT Protocol handle or authorization server URL (required)
   * - redirect: Relative path to redirect after OAuth (optional)
   * - prompt: OAuth prompt value, e.g. "create" for account registration (optional)
   * - mobile: Set to "true" for mobile OAuth flow (redirects to mobileScheme)
   * - pwa: Set to "true" for PWA OAuth flow (returns HTML with postMessage)
   */
  async function handleLogin(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const handle = url.searchParams.get("handle");
    const redirect = url.searchParams.get("redirect");
    const mobile = url.searchParams.get("mobile") === "true";
    const pwa = url.searchParams.get("pwa") === "true";
    const prompt = url.searchParams.get("prompt");

    if (!handle || typeof handle !== "string") {
      return new Response("Invalid handle", { status: 400 });
    }

    // Accept AT Protocol handles and authorization server URLs (https://)
    const isUrl = handle.startsWith("https://");
    if (!isUrl && !isValidHandle(handle)) {
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

      // Track mobile flow for callback redirect
      if (mobile) {
        state.mobile = true;
      }

      // Track PWA flow for postMessage callback
      if (pwa) {
        state.pwa = true;
      }

      const authUrl = await oauthClient.authorize(handle, {
        state: JSON.stringify(state),
        scope,
        ...(prompt ? { prompt } : {}),
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
   *
   * For mobile OAuth (state.mobile=true):
   * - Redirects to mobileScheme with session_token, did, and handle
   * - Also sets cookie for fallback API auth
   *
   * For PWA OAuth (state.pwa=true):
   * - Returns HTML page that sends session via postMessage to opener
   * - Also sets cookie for API auth
   *
   * For web OAuth:
   * - Redirects to state.redirectPath or "/" with session cookie
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

      // Mobile OAuth: redirect to app's URL scheme
      if (state.mobile && mobileScheme) {
        const sealedToken = await sessionManager.sealToken({ did });
        const mobileCallbackUrl = new URL(mobileScheme);
        mobileCallbackUrl.searchParams.set("session_token", sealedToken);
        mobileCallbackUrl.searchParams.set("did", did);
        mobileCallbackUrl.searchParams.set("handle", state.handle);

        logger.info(`Mobile OAuth complete, redirecting to ${mobileScheme}`);

        return new Response(null, {
          status: 302,
          headers: {
            Location: mobileCallbackUrl.toString(),
            "Set-Cookie": setCookieHeader,
          },
        });
      }

      // PWA OAuth: return HTML page that signals completion via localStorage
      // We use localStorage instead of postMessage because window.opener
      // is lost after navigating through external OAuth providers
      if (state.pwa) {
        logger.info(`PWA OAuth complete for ${state.handle}`);

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login Complete</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .message {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .success-icon {
      width: 48px;
      height: 48px;
      background: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem;
    }
    .success-icon svg {
      width: 24px;
      height: 24px;
      fill: white;
    }
  </style>
</head>
<body>
  <div class="message">
    <div class="success-icon">
      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    </div>
    <p>Login successful!</p>
    <p style="color: #666; font-size: 14px;">You can close this window.</p>
  </div>
  <script>
    (function() {
      // Store success data in localStorage for the opener to read
      var data = {
        type: 'oauth-callback',
        success: true,
        did: ${JSON.stringify(did)},
        handle: ${JSON.stringify(state.handle)},
        timestamp: Date.now()
      };
      localStorage.setItem('pwa-oauth-result', JSON.stringify(data));

      // Try postMessage first (works if opener is still available)
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(data, '*');
        } catch (e) {
          // Ignore cross-origin errors
        }
      }

      // Close popup after a short delay
      setTimeout(function() {
        window.close();
      }, 1500);
    })();
  </script>
</body>
</html>`;

        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Set-Cookie": setCookieHeader,
          },
        });
      }

      // Web OAuth: redirect to stored path or home
      const redirectPath = state.redirectPath || "/";

      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectPath,
          "Set-Cookie": setCookieHeader,
        },
      });
    } catch (error) {
      // Issuer mismatch: the auth server used (e.g. bsky.social) is not
      // authoritative for this user's PDS. If we discovered the user's
      // handle, re-authorize through their correct auth server transparently.
      if (error instanceof IssuerMismatchError && error.handle) {
        logger.info(
          "Issuer mismatch — re-authorizing through correct auth server",
          {
            expected: error.expected,
            actual: error.actual,
            handle: error.handle,
          },
        );
        const loginUrl = `/login?handle=${encodeURIComponent(error.handle)}`;
        return new Response(null, {
          status: 302,
          headers: { Location: loginUrl },
        });
      }

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
