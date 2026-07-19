import assert from "node:assert/strict";
import test from "node:test";

import sessionFunction, { handleSessionRequest } from "../api/session.ts";

const request = (method = "POST") => new Request("https://example.test/api/session", { method });

test("rejects non-POST requests without contacting Reactor", async () => {
  let called = false;
  const response = await handleSessionRequest(request("GET"), {
    apiKey: "server-secret",
    fetchImpl: async () => {
      called = true;
      return Response.json({ jwt: "unused" });
    },
  });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(called, false);
});

test("fails closed when the server key is missing", async () => {
  const response = await handleSessionRequest(request(), { apiKey: "" });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "REACTOR_API_KEY is not configured" });
});

test("mints a token with the key only in the upstream request", async () => {
  const response = await handleSessionRequest(request(), {
    apiKey: "server-secret",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.reactor.inc/tokens");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("Reactor-API-Key"), "server-secret");
      assert.equal(init?.body, "{}");
      return Response.json({ jwt: "short-lived-jwt" }, { status: 201 });
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { jwt: "short-lived-jwt" });
});

test("the deployed handler reads REACTOR_API_KEY from server environment", async () => {
  const originalKey = process.env.REACTOR_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.REACTOR_API_KEY = "server-env-secret";
  globalThis.fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("Reactor-API-Key"), "server-env-secret");
    return Response.json({ jwt: "environment-jwt" });
  };

  try {
    const response = await sessionFunction.fetch(request());
    assert.deepEqual(await response.json(), { jwt: "environment-jwt" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.REACTOR_API_KEY;
    else process.env.REACTOR_API_KEY = originalKey;
  }
});

test("preserves Reactor errors without leaking the server key", async () => {
  const response = await handleSessionRequest(request(), {
    apiKey: "server-secret",
    fetchImpl: async () => Response.json({ error: "quota exceeded" }, { status: 429 }),
  });

  assert.equal(response.status, 429);
  const body = await response.text();
  assert.equal(body, '{"error":"quota exceeded"}');
  assert.equal(body.includes("server-secret"), false);
});

test("maps network failures to a generic gateway error", async () => {
  const response = await handleSessionRequest(request(), {
    apiKey: "server-secret",
    fetchImpl: async () => {
      throw new Error("request failed with server-secret");
    },
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "token mint failed" });
});
