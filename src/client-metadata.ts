/**
 * Generate ATProto OAuth client metadata
 */

import type { ATProtoOAuthConfig, ClientMetadata } from "./types.ts";

/**
 * Check if a URL is a loopback/localhost address for local development.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" ||
      host === "::1";
  } catch {
    return false;
  }
}

/**
 * Build a loopback redirect URI from a localhost base URL.
 * Replaces "localhost" with "127.0.0.1" per the AT Protocol OAuth spec.
 */
export function buildLoopbackRedirectUri(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  parsed.hostname = "127.0.0.1";
  const origin = parsed.origin; // includes port
  return `${origin}/oauth/callback`;
}

/**
 * Build a loopback client_id per the AT Protocol OAuth spec.
 * Format: http://localhost?redirect_uri=<encoded>&scope=<encoded>
 */
export function buildLoopbackClientId(
  redirectUri: string,
  scope: string,
): string {
  const params = new URLSearchParams();
  params.set("redirect_uri", redirectUri);
  params.set("scope", scope);
  return `http://localhost?${params.toString()}`;
}

/**
 * Generate ATProto OAuth client metadata for the /.well-known/oauth-client endpoint
 */
export function generateClientMetadata(
  config: ATProtoOAuthConfig,
): ClientMetadata {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const scope = config.scope || "atproto transition:generic";
  const loopback = isLoopbackUrl(baseUrl);

  const redirectUri = loopback
    ? buildLoopbackRedirectUri(baseUrl)
    : `${baseUrl}/oauth/callback`;

  const clientId = loopback
    ? buildLoopbackClientId(redirectUri, scope)
    : `${baseUrl}/oauth-client-metadata.json`;

  const metadata: ClientMetadata = {
    client_name: config.appName,
    client_id: clientId,
    client_uri: baseUrl,
    redirect_uris: [redirectUri],
    scope,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "web",
    token_endpoint_auth_method: "none",
    dpop_bound_access_tokens: true,
  };

  if (config.logoUri) {
    metadata.logo_uri = config.logoUri;
  }

  if (config.policyUri) {
    metadata.policy_uri = config.policyUri;
  }

  return metadata;
}
