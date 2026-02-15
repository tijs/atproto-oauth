import { assertEquals, assertThrows } from "@std/assert";
import { createATProtoOAuth } from "./oauth.ts";
import { MemoryStorage } from "@tijs/atproto-storage";

Deno.test("createATProtoOAuth - throws on missing baseUrl", () => {
  assertThrows(
    () => {
      createATProtoOAuth({
        baseUrl: "",
        appName: "Test App",
        cookieSecret: "a".repeat(32),
        storage: new MemoryStorage(),
      });
    },
    Error,
    "baseUrl is required",
  );
});

Deno.test("createATProtoOAuth - throws on missing appName", () => {
  assertThrows(
    () => {
      createATProtoOAuth({
        baseUrl: "https://myapp.example.com",
        appName: "",
        cookieSecret: "a".repeat(32),
        storage: new MemoryStorage(),
      });
    },
    Error,
    "appName is required",
  );
});

Deno.test("createATProtoOAuth - throws on missing cookieSecret", () => {
  assertThrows(
    () => {
      createATProtoOAuth({
        baseUrl: "https://myapp.example.com",
        appName: "Test App",
        cookieSecret: "",
        storage: new MemoryStorage(),
      });
    },
    Error,
    "cookieSecret is required",
  );
});

Deno.test("createATProtoOAuth - throws on short cookieSecret", () => {
  assertThrows(
    () => {
      createATProtoOAuth({
        baseUrl: "https://myapp.example.com",
        appName: "Test App",
        cookieSecret: "short",
        storage: new MemoryStorage(),
      });
    },
    Error,
    "cookieSecret must be at least 32 characters",
  );
});

Deno.test("createATProtoOAuth - throws on missing storage", () => {
  assertThrows(
    () => {
      createATProtoOAuth({
        baseUrl: "https://myapp.example.com",
        appName: "Test App",
        cookieSecret: "a".repeat(32),
        storage: undefined as unknown as MemoryStorage,
      });
    },
    Error,
    "storage is required",
  );
});

Deno.test("createATProtoOAuth - returns instance with all methods", () => {
  const oauth = createATProtoOAuth({
    baseUrl: "https://myapp.example.com",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  });

  // Check all methods exist
  assertEquals(typeof oauth.handleLogin, "function");
  assertEquals(typeof oauth.handleCallback, "function");
  assertEquals(typeof oauth.handleClientMetadata, "function");
  assertEquals(typeof oauth.handleLogout, "function");
  assertEquals(typeof oauth.getSessionFromRequest, "function");
  assertEquals(typeof oauth.getClientMetadata, "function");
  assertEquals(typeof oauth.sessions.getOAuthSession, "function");
  assertEquals(typeof oauth.sessions.saveOAuthSession, "function");
  assertEquals(typeof oauth.sessions.deleteOAuthSession, "function");
});

Deno.test("createATProtoOAuth - handleClientMetadata returns JSON response", () => {
  const oauth = createATProtoOAuth({
    baseUrl: "https://myapp.example.com",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  });

  const response = oauth.handleClientMetadata();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Content-Type"), "application/json");
});

Deno.test("createATProtoOAuth - getClientMetadata returns correct metadata", () => {
  const oauth = createATProtoOAuth({
    baseUrl: "https://myapp.example.com",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
    logoUri: "https://myapp.example.com/logo.png",
  });

  const metadata = oauth.getClientMetadata();

  assertEquals(metadata.client_name, "Test App");
  assertEquals(
    metadata.client_id,
    "https://myapp.example.com/oauth-client-metadata.json",
  );
  assertEquals(metadata.logo_uri, "https://myapp.example.com/logo.png");
});

Deno.test("createATProtoOAuth - handleLogin returns 400 on missing handle", async () => {
  const oauth = createATProtoOAuth({
    baseUrl: "https://myapp.example.com",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  });

  const request = new Request("https://myapp.example.com/login");
  const response = await oauth.handleLogin(request);

  assertEquals(response.status, 400);
  assertEquals(await response.text(), "Invalid handle");
});

Deno.test("createATProtoOAuth - handleLogin returns 400 on invalid handle format", async () => {
  const oauth = createATProtoOAuth({
    baseUrl: "https://myapp.example.com",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  });

  const request = new Request(
    "https://myapp.example.com/login?handle=invalid@@@handle",
  );
  const response = await oauth.handleLogin(request);

  assertEquals(response.status, 400);
  assertEquals(await response.text(), "Invalid handle format");
});

Deno.test("createATProtoOAuth - getSessionFromRequest returns error on no cookie", async () => {
  const oauth = createATProtoOAuth({
    baseUrl: "https://myapp.example.com",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  });

  const request = new Request("https://myapp.example.com/api/test");
  const result = await oauth.getSessionFromRequest(request);

  assertEquals(result.session, null);
  assertEquals(result.error?.type, "NO_COOKIE");
});

Deno.test("createATProtoOAuth - localhost uses loopback client metadata", () => {
  const oauth = createATProtoOAuth({
    baseUrl: "http://localhost:8000",
    appName: "Dev App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  });

  const metadata = oauth.getClientMetadata();

  // client_id should be loopback format
  assertEquals(metadata.client_id.startsWith("http://localhost?"), true);
  // redirect_uris should use 127.0.0.1
  assertEquals(metadata.redirect_uris, [
    "http://127.0.0.1:8000/oauth/callback",
  ]);
});

Deno.test("createATProtoOAuth - handleLogout clears session", async () => {
  const oauth = createATProtoOAuth({
    baseUrl: "https://myapp.example.com",
    appName: "Test App",
    cookieSecret: "a".repeat(32),
    storage: new MemoryStorage(),
  });

  const request = new Request("https://myapp.example.com/api/auth/logout", {
    method: "POST",
  });
  const response = await oauth.handleLogout(request);

  assertEquals(response.status, 200);

  const body = await response.json();
  assertEquals(body.success, true);

  // Should have Set-Cookie header to clear cookie
  const setCookie = response.headers.get("Set-Cookie");
  assertEquals(setCookie?.includes("Max-Age=0"), true);
});
