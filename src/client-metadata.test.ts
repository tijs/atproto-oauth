import { assertEquals } from "@std/assert";
import {
  buildLoopbackClientId,
  buildLoopbackRedirectUri,
  generateClientMetadata,
  isLoopbackUrl,
} from "./client-metadata.ts";
import type { ATProtoOAuthConfig } from "./types.ts";
import { MemoryStorage } from "@tijs/atproto-storage";

Deno.test("generateClientMetadata - basic config", () => {
  const config: ATProtoOAuthConfig = {
    baseUrl: "https://myapp.example.com",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  };

  const metadata = generateClientMetadata(config);

  assertEquals(metadata.client_name, "Test App");
  assertEquals(
    metadata.client_id,
    "https://myapp.example.com/oauth-client-metadata.json",
  );
  assertEquals(metadata.client_uri, "https://myapp.example.com");
  assertEquals(metadata.redirect_uris, [
    "https://myapp.example.com/oauth/callback",
  ]);
  assertEquals(metadata.scope, "atproto transition:generic");
  assertEquals(metadata.grant_types, ["authorization_code", "refresh_token"]);
  assertEquals(metadata.response_types, ["code"]);
  assertEquals(metadata.application_type, "web");
  assertEquals(metadata.token_endpoint_auth_method, "none");
  assertEquals(metadata.dpop_bound_access_tokens, true);
  assertEquals(metadata.logo_uri, undefined);
  assertEquals(metadata.policy_uri, undefined);
});

Deno.test("generateClientMetadata - with optional fields", () => {
  const config: ATProtoOAuthConfig = {
    baseUrl: "https://myapp.example.com/",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
    logoUri: "https://myapp.example.com/logo.png",
    policyUri: "https://myapp.example.com/privacy",
    scope: "atproto transition:generic transition:chat.bsky",
  };

  const metadata = generateClientMetadata(config);

  assertEquals(metadata.client_uri, "https://myapp.example.com"); // trailing slash removed
  assertEquals(metadata.logo_uri, "https://myapp.example.com/logo.png");
  assertEquals(metadata.policy_uri, "https://myapp.example.com/privacy");
  assertEquals(
    metadata.scope,
    "atproto transition:generic transition:chat.bsky",
  );
});

Deno.test("generateClientMetadata - removes trailing slash from baseUrl", () => {
  const config: ATProtoOAuthConfig = {
    baseUrl: "https://myapp.example.com/",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  };

  const metadata = generateClientMetadata(config);

  assertEquals(metadata.client_uri, "https://myapp.example.com");
  assertEquals(
    metadata.client_id,
    "https://myapp.example.com/oauth-client-metadata.json",
  );
  assertEquals(metadata.redirect_uris, [
    "https://myapp.example.com/oauth/callback",
  ]);
});

// --- Loopback / localhost tests ---

Deno.test("isLoopbackUrl - detects localhost", () => {
  assertEquals(isLoopbackUrl("http://localhost:8000"), true);
  assertEquals(isLoopbackUrl("http://localhost"), true);
  assertEquals(isLoopbackUrl("http://127.0.0.1:3000"), true);
  assertEquals(isLoopbackUrl("http://[::1]:8080"), true);
  assertEquals(isLoopbackUrl("https://myapp.example.com"), false);
  assertEquals(isLoopbackUrl("not-a-url"), false);
});

Deno.test("buildLoopbackRedirectUri - replaces localhost with 127.0.0.1", () => {
  assertEquals(
    buildLoopbackRedirectUri("http://localhost:8000"),
    "http://127.0.0.1:8000/oauth/callback",
  );
  assertEquals(
    buildLoopbackRedirectUri("http://localhost:3000"),
    "http://127.0.0.1:3000/oauth/callback",
  );
});

Deno.test("buildLoopbackClientId - builds correct loopback client_id", () => {
  const redirectUri = "http://127.0.0.1:8000/oauth/callback";
  const scope = "atproto transition:generic";
  const clientId = buildLoopbackClientId(redirectUri, scope);

  assertEquals(clientId.startsWith("http://localhost?"), true);
  // Verify params are encoded in the client_id
  const url = new URL(clientId);
  assertEquals(url.searchParams.get("redirect_uri"), redirectUri);
  assertEquals(url.searchParams.get("scope"), scope);
});

Deno.test("generateClientMetadata - localhost uses loopback format", () => {
  const config: ATProtoOAuthConfig = {
    baseUrl: "http://localhost:8000",
    appName: "Dev App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  };

  const metadata = generateClientMetadata(config);

  // redirect_uris should use 127.0.0.1
  assertEquals(metadata.redirect_uris, [
    "http://127.0.0.1:8000/oauth/callback",
  ]);

  // client_id should be loopback format
  assertEquals(metadata.client_id.startsWith("http://localhost?"), true);
  const url = new URL(metadata.client_id);
  assertEquals(
    url.searchParams.get("redirect_uri"),
    "http://127.0.0.1:8000/oauth/callback",
  );
  assertEquals(
    url.searchParams.get("scope"),
    "atproto transition:generic",
  );

  // client_uri stays as provided
  assertEquals(metadata.client_uri, "http://localhost:8000");
});

Deno.test("generateClientMetadata - 127.0.0.1 uses loopback format", () => {
  const config: ATProtoOAuthConfig = {
    baseUrl: "http://127.0.0.1:3000",
    appName: "Dev App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  };

  const metadata = generateClientMetadata(config);

  assertEquals(metadata.redirect_uris, [
    "http://127.0.0.1:3000/oauth/callback",
  ]);
  assertEquals(metadata.client_id.startsWith("http://localhost?"), true);
});
