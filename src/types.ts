/**
 * Types for AT Protocol OAuth integration
 * Framework-agnostic - works with standard Request/Response APIs
 */

import type { OAuthStorage } from "@tijs/atproto-storage";

/**
 * Logger interface for custom logging implementations.
 * Compatible with oauth-client-deno's Logger interface.
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * No-op logger for production use
 */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Generic OAuth session interface
 *
 * Compatible with @tijs/oauth-client-deno Session class and similar implementations.
 * For AT Protocol applications, makeRequest() provides automatic DPoP authentication.
 */
export interface SessionInterface {
  /** User's DID */
  did: string;

  /** Access token for API calls */
  accessToken: string;

  /** Refresh token (optional) */
  refreshToken?: string;

  /** Handle/username (optional) */
  handle?: string;

  /** User's PDS URL */
  pdsUrl: string;

  /** Time until token expires in milliseconds (optional) */
  timeUntilExpiry?: number;

  /**
   * Make authenticated request with automatic DPoP handling.
   */
  makeRequest(
    method: string,
    url: string,
    options?: RequestInit,
  ): Promise<Response>;

  /**
   * Refresh tokens (optional)
   */
  refresh?(): Promise<SessionInterface>;

  /**
   * Serialize session data for storage
   */
  toJSON(): unknown;
}

/**
 * Generic OAuth client interface - bring your own client!
 * Compatible with @tijs/oauth-client-deno v1.0.0+
 */
export interface OAuthClientInterface {
  /**
   * Start OAuth authorization flow
   * @returns URL object for authorization redirect
   */
  authorize(
    handle: string,
    options?: { state?: string; scope?: string },
  ): Promise<URL>;

  /**
   * Handle OAuth callback and exchange code for tokens
   * @param params URLSearchParams from OAuth callback
   */
  callback(params: URLSearchParams): Promise<{
    session: SessionInterface;
    state?: string | null;
  }>;

  /**
   * Restore a session from storage by session ID.
   * The OAuth client should handle automatic token refresh during restore if needed.
   * @param sessionId - Session identifier to restore
   * @returns Promise resolving to restored session, or null if not found
   */
  restore(sessionId: string): Promise<SessionInterface | null>;
}

/**
 * Configuration options for ATProto OAuth integration.
 */
export interface ATProtoOAuthConfig {
  /** Base URL of your application (e.g. "https://myapp.example.com") */
  baseUrl: string;

  /** Display name for OAuth consent screen */
  appName: string;

  /** URL to app logo for OAuth consent screen */
  logoUri?: string;

  /** URL to privacy policy */
  policyUri?: string;

  /** Cookie signing secret (required, at least 32 characters) */
  cookieSecret: string;

  /** OAuth scope (default: "atproto transition:generic") */
  scope?: string;

  /**
   * Session TTL in seconds (default: 7 days).
   * For AT Protocol OAuth public clients, max is 14 days per spec.
   */
  sessionTtl?: number;

  /** Storage implementation for OAuth sessions */
  storage: OAuthStorage;

  /**
   * Optional logger for debugging and monitoring OAuth flows.
   * Defaults to a no-op logger (no console output).
   * Pass console for standard logging.
   */
  logger?: Logger;

  /**
   * URL scheme for mobile app OAuth callback.
   * When mobile=true is passed to /login, the callback will redirect to this
   * scheme with session_token and did as query params.
   * Example: "myapp://auth-callback" or "anchor-app://auth-callback"
   */
  mobileScheme?: string;
}

/**
 * ATProto OAuth client metadata for /.well-known/oauth-client
 */
export interface ClientMetadata {
  client_name: string;
  client_id: string;
  client_uri: string;
  redirect_uris: string[];
  scope: string;
  grant_types: string[];
  response_types: string[];
  application_type: string;
  token_endpoint_auth_method: string;
  dpop_bound_access_tokens: boolean;
  logo_uri?: string;
  policy_uri?: string;
}

/**
 * Session validation result.
 */
export interface SessionValidationResult {
  valid: boolean;
  did?: string;
  handle?: string;
}

/**
 * Stored OAuth session data
 */
export interface StoredOAuthSession {
  did: string;
  accessToken: string;
  refreshToken?: string;
  handle?: string;
  pdsUrl: string;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Iron Session data stored in encrypted cookie
 */
export interface SessionData {
  did: string;
  createdAt: number;
  lastAccessed: number;
}

/**
 * OAuth sessions manager interface
 */
export interface OAuthSessionsInterface {
  /**
   * Get an OAuth session for a specific DID
   * @param did - User's DID
   * @returns OAuth session or null if not found
   */
  getOAuthSession(did: string): Promise<SessionInterface | null>;

  /**
   * Save OAuth session to storage
   * @param session - Session to save
   */
  saveOAuthSession(session: SessionInterface): Promise<void>;

  /**
   * Delete OAuth session from storage
   * @param did - User's DID
   */
  deleteOAuthSession(did: string): Promise<void>;
}

/**
 * Result from getOAuthSessionFromRequest()
 */
export interface OAuthSessionFromRequestResult {
  /** The OAuth session, or null if not found/invalid */
  session: SessionInterface | null;

  /** Set-Cookie header to refresh the session (set when session is valid) */
  setCookieHeader?: string;

  /** Error information if session retrieval failed */
  error?: {
    type:
      | "NO_COOKIE"
      | "INVALID_COOKIE"
      | "SESSION_EXPIRED"
      | "OAUTH_ERROR"
      | "UNKNOWN";
    message: string;
    details?: unknown;
  };
}

/**
 * ATProto OAuth instance returned by createATProtoOAuth().
 */
export interface ATProtoOAuthInstance {
  /**
   * Handle /login route - start OAuth flow
   * @param request - HTTP request with ?handle= query param
   * @returns Response (redirect to OAuth provider)
   */
  handleLogin(request: Request): Promise<Response>;

  /**
   * Handle /oauth/callback route - complete OAuth flow
   * @param request - HTTP request from OAuth callback
   * @returns Response (redirect to app)
   */
  handleCallback(request: Request): Promise<Response>;

  /**
   * Handle /oauth-client-metadata.json route
   * @returns Response with client metadata JSON
   */
  handleClientMetadata(): Response;

  /**
   * Handle /api/auth/logout route
   * @param request - HTTP request
   * @returns Response
   */
  handleLogout(request: Request): Promise<Response>;

  /**
   * Get OAuth session from request (cookie or Bearer token)
   * @param request - HTTP request
   * @returns Session result with optional Set-Cookie header
   */
  getSessionFromRequest(
    request: Request,
  ): Promise<OAuthSessionFromRequestResult>;

  /**
   * Generate client metadata
   */
  getClientMetadata(): ClientMetadata;

  /**
   * Get a Set-Cookie header to clear the session cookie.
   * Useful for custom logout flows or error handling scenarios.
   * @returns Set-Cookie header string
   */
  getClearCookieHeader(): string;

  /** Direct access to sessions interface for advanced usage */
  sessions: OAuthSessionsInterface;
}

/**
 * OAuth state stored during authorization flow
 */
export interface OAuthState {
  handle: string;
  timestamp: number;
  /** Redirect path after successful web OAuth */
  redirectPath?: string;
  /** Flag for mobile OAuth flow - redirects to mobileScheme instead of web */
  mobile?: boolean;
  /** Flag for PWA OAuth flow - returns HTML page with postMessage instead of redirect */
  pwa?: boolean;
}

// Re-export OAuthStorage from atproto-storage for convenience
export type { OAuthStorage };
