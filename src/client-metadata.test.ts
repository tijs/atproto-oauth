import { assertEquals } from "@std/assert";
import { generateClientMetadata } from "./client-metadata.ts";
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
