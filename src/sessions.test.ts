import { assertEquals, assertRejects } from "@std/assert";
import { MemoryStorage } from "@tijs/atproto-storage";
import { NetworkError, SessionError } from "@tijs/oauth-client-deno";
import { OAuthSessions } from "./sessions.ts";
import type { OAuthClientInterface, SessionInterface } from "./types.ts";
import { noopLogger } from "./types.ts";

/** Create a fake session for testing */
function fakeSession(did: string): SessionInterface {
  return {
    did,
    accessToken: "test-access-token",
    pdsUrl: "https://pds.example.com",
    timeUntilExpiry: 3600000,
    makeRequest: () => Promise.resolve(new Response()),
    toJSON: () => ({ did, accessToken: "test-access-token" }),
  };
}

/** Create a mock OAuth client */
function mockOAuthClient(
  restoreFn: (sessionId: string) => Promise<SessionInterface | null>,
): OAuthClientInterface {
  return {
    authorize: () => Promise.resolve(new URL("https://auth.example.com")),
    callback: () =>
      Promise.resolve({ session: fakeSession("did:plc:test"), state: null }),
    restore: restoreFn,
  };
}

Deno.test("getOAuthSession - returns session on success", async () => {
  const session = fakeSession("did:plc:abc");
  const sessions = new OAuthSessions({
    oauthClient: mockOAuthClient(() => Promise.resolve(session)),
    storage: new MemoryStorage(),
    sessionTtl: 3600,
    logger: noopLogger,
  });

  const result = await sessions.getOAuthSession("did:plc:abc");
  assertEquals(result?.did, "did:plc:abc");
});

Deno.test("getOAuthSession - returns null when restore returns null", async () => {
  const sessions = new OAuthSessions({
    oauthClient: mockOAuthClient(() => Promise.resolve(null)),
    storage: new MemoryStorage(),
    sessionTtl: 3600,
    logger: noopLogger,
  });

  const result = await sessions.getOAuthSession("did:plc:abc");
  assertEquals(result, null);
});

Deno.test("getOAuthSession - returns null on SessionError (corrupt session)", async () => {
  const storage = new MemoryStorage();
  await storage.set("session:did:plc:abc", { corrupt: "data" });

  const sessions = new OAuthSessions({
    oauthClient: mockOAuthClient(() => {
      throw new SessionError("Failed to restore session: did:plc:abc");
    }),
    storage,
    sessionTtl: 3600,
    logger: noopLogger,
  });

  const result = await sessions.getOAuthSession("did:plc:abc");
  assertEquals(result, null);

  // Should have cleaned up the dead session from storage
  const stored = await storage.get("session:did:plc:abc");
  assertEquals(stored, null);
});

Deno.test("getOAuthSession - returns null on token expiry errors", async () => {
  const storage = new MemoryStorage();
  await storage.set("session:did:plc:abc", { expired: true });

  const sessions = new OAuthSessions({
    oauthClient: mockOAuthClient(() => {
      throw new Error("Refresh token has expired");
    }),
    storage,
    sessionTtl: 3600,
    logger: noopLogger,
  });

  const result = await sessions.getOAuthSession("did:plc:abc");
  assertEquals(result, null);

  // Should have cleaned up the dead session from storage
  const stored = await storage.get("session:did:plc:abc");
  assertEquals(stored, null);
});

Deno.test("getOAuthSession - re-throws NetworkError (transient)", async () => {
  const sessions = new OAuthSessions({
    oauthClient: mockOAuthClient(() => {
      throw new NetworkError("Connection refused");
    }),
    storage: new MemoryStorage(),
    sessionTtl: 3600,
    logger: noopLogger,
  });

  await assertRejects(
    () => sessions.getOAuthSession("did:plc:abc"),
    NetworkError,
  );
});

Deno.test("getOAuthSession - cleanup failure does not prevent null return", async () => {
  // Storage that fails on delete
  const storage = new MemoryStorage();
  const originalDelete = storage.delete.bind(storage);
  storage.delete = () => {
    throw new Error("Storage delete failed");
  };

  const sessions = new OAuthSessions({
    oauthClient: mockOAuthClient(() => {
      throw new SessionError("Failed to restore session: did:plc:abc");
    }),
    storage,
    sessionTtl: 3600,
    logger: noopLogger,
  });

  // Should still return null even if cleanup fails
  const result = await sessions.getOAuthSession("did:plc:abc");
  assertEquals(result, null);

  // Restore delete for cleanup
  storage.delete = originalDelete;
});
