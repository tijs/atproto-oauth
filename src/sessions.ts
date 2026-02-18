/**
 * OAuth session management
 * Framework-agnostic session storage and retrieval
 */

import type { OAuthStorage } from "@tijs/atproto-storage";
import { NetworkError } from "@tijs/oauth-client-deno";
import type {
  Logger,
  OAuthClientInterface,
  OAuthSessionsInterface,
  SessionInterface,
} from "./types.ts";
import { noopLogger } from "./types.ts";

/**
 * Configuration for OAuthSessions
 */
export interface OAuthSessionsConfig {
  /** OAuth client for session restoration */
  oauthClient: OAuthClientInterface;

  /** Storage for OAuth session data */
  storage: OAuthStorage;

  /** Session TTL in seconds */
  sessionTtl: number;

  /** Optional logger */
  logger?: Logger;
}

/**
 * OAuth session manager - handles storing and restoring OAuth sessions
 */
export class OAuthSessions implements OAuthSessionsInterface {
  private readonly oauthClient: OAuthClientInterface;
  private readonly storage: OAuthStorage;
  private readonly sessionTtl: number;
  private readonly logger: Logger;

  constructor(config: OAuthSessionsConfig) {
    this.oauthClient = config.oauthClient;
    this.storage = config.storage;
    this.sessionTtl = config.sessionTtl;
    this.logger = config.logger ?? noopLogger;
  }

  /**
   * Get OAuth session for a DID with automatic token refresh
   */
  async getOAuthSession(did: string): Promise<SessionInterface | null> {
    this.logger.debug(`Restoring OAuth session for DID: ${did}`);

    try {
      // The OAuth client's restore() method handles automatic token refresh
      const session = await this.oauthClient.restore(did);

      if (session) {
        this.logger.info(`OAuth session restored successfully for DID: ${did}`);

        // Log token expiration information if available
        if (session.timeUntilExpiry !== undefined) {
          const timeUntilExpiryMinutes = Math.round(
            session.timeUntilExpiry / 1000 / 60,
          );
          const wasLikelyRefreshed = session.timeUntilExpiry > (60 * 60 * 1000); // More than 1 hour
          const now = Date.now();
          const expiresAt = now + session.timeUntilExpiry;

          this.logger.debug(`Token status for DID ${did}:`, {
            expiresAt: new Date(expiresAt).toISOString(),
            currentTime: new Date(now).toISOString(),
            timeUntilExpiryMinutes,
            wasLikelyRefreshed,
            hasRefreshToken: !!session.refreshToken,
          });
        }
      } else {
        this.logger.debug(`OAuth session not found for DID: ${did}`);
      }

      return session;
    } catch (error) {
      // NetworkError is transient — re-throw so callers can retry or handle
      if (error instanceof NetworkError) {
        this.logger.warn(`Network error restoring session for DID ${did}:`, {
          error: error.message,
        });
        throw error;
      }

      // All other errors mean the session is unrecoverable (expired tokens,
      // revoked tokens, corrupt data, deserialization failures). Return null
      // per the method contract and clean up the dead session from storage.
      this.logger.warn(`Session unrecoverable for DID ${did}, removing:`, {
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.constructor.name : "Unknown",
      });

      try {
        await this.storage.delete(`session:${did}`);
      } catch (cleanupError) {
        this.logger.error(`Failed to clean up session for DID ${did}:`, {
          error: cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        });
      }

      return null;
    }
  }

  /**
   * Save OAuth session to storage
   */
  async saveOAuthSession(session: SessionInterface): Promise<void> {
    this.logger.debug(`Saving OAuth session for DID: ${session.did}`);

    await this.storage.set(`session:${session.did}`, session.toJSON(), {
      ttl: this.sessionTtl,
    });

    this.logger.info(`OAuth session saved for DID: ${session.did}`);
  }

  /**
   * Delete OAuth session from storage
   */
  async deleteOAuthSession(did: string): Promise<void> {
    this.logger.debug(`Deleting OAuth session for DID: ${did}`);

    await this.storage.delete(`session:${did}`);

    this.logger.info(`OAuth session deleted for DID: ${did}`);
  }
}
