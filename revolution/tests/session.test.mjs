import assert from "node:assert/strict";
import test from "node:test";

import { handleSessionRequest } from "../api/session.ts";

const ENV = {
  REACTOR_API_KEY: "server-reactor-secret",
  TURNSTILE_SECRET_KEY: "server-turnstile-secret",
  TURNSTILE_EXPECTED_HOSTNAMES: "play.example.test",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "server-redis-secret",
  SESSION_CLIENT_HASH_SECRET: "a-server-only-hash-secret-at-least-32-chars",
  SESSION_CLIENT_LIMIT: "2",
  SESSION_CLIENT_WINDOW_SECONDS: "600",
  SESSION_GLOBAL_DAILY_LIMIT: "100",
};

const PREVIEW_ENV = {
  ...ENV,
  VERCEL: "1",
  VERCEL_ENV: "preview",
  SESSION_PREVIEW_BYPASS: "1",
  TURNSTILE_SECRET_KEY: "",
  TURNSTILE_EXPECTED_HOSTNAMES: "",
};

const sessionRequest = ({ method = "POST", token = "one-time-challenge", ip = "203.0.113.9" } = {}) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (ip) headers.set("x-vercel-forwarded-for", ip);
  return new Request("https://play.example.test/api/session", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify({ challengeToken: token }) : undefined,
  });
};

function services({
  turnstile = {},
  admission = [1, "ok", 1, 1],
  reactor = {},
  redisNamespace = "iw:{session-broker}",
} = {}) {
  const calls = { turnstile: 0, redis: 0, reactor: 0 };
  const fetchImpl = async (url, init) => {
    if (String(url).includes("turnstile")) {
      calls.turnstile += 1;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.secret, ENV.TURNSTILE_SECRET_KEY);
      assert.equal(body.response, "one-time-challenge");
      assert.equal(body.remoteip, "203.0.113.9");
      return Response.json({
        success: true,
        action: "session",
        hostname: "play.example.test",
        ...turnstile,
      });
    }
    calls.reactor += 1;
    assert.equal(String(url), "https://api.reactor.inc/tokens");
    assert.equal(new Headers(init?.headers).get("Reactor-API-Key"), ENV.REACTOR_API_KEY);
    return Response.json({ jwt: "short-lived-jwt", ...reactor });
  };
  const redis = {
    async eval(script, keys, args) {
      calls.redis += 1;
      assert.match(script, /redis\.call\("EXISTS", replay\)/);
      assert.equal(keys.length, 3);
      assert.equal(keys.every((key) => key.startsWith(`${redisNamespace}:`)), true);
      assert.equal(keys.some((key) => key.includes("203.0.113.9")), false);
      assert.equal(keys.some((key) => key.includes("one-time-challenge")), false);
      assert.deepEqual(args.slice(0, 3), [2, 600, 100]);
      return admission;
    },
  };
  return { calls, fetchImpl, redis };
}

const options = (mock, env = ENV) => ({
  env,
  fetchImpl: mock.fetchImpl,
  redis: mock.redis,
  now: () => new Date("2026-07-19T12:00:00.000Z"),
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
});

test("rejects non-POST requests before any external call", async () => {
  const mock = services();
  const response = await handleSessionRequest(sessionRequest({ method: "GET" }), options(mock));

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 });
});

test("fails closed when any production policy setting is absent or invalid", async () => {
  for (const key of Object.keys(ENV)) {
    const mock = services();
    const env = { ...ENV, [key]: "" };
    const response = await handleSessionRequest(sessionRequest(), options(mock, env));
    assert.equal(response.status, 503, key);
    assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 }, key);
  }
  for (const [key, value] of [
    ["SESSION_CLIENT_LIMIT", "0"],
    ["SESSION_CLIENT_WINDOW_SECONDS", "-1"],
    ["SESSION_GLOBAL_DAILY_LIMIT", "1.5"],
    ["SESSION_CLIENT_HASH_SECRET", "too-short"],
    ["TURNSTILE_EXPECTED_HOSTNAMES", "https://play.example.test"],
    ["UPSTASH_REDIS_REST_URL", "http://redis.example.test"],
  ]) {
    const mock = services();
    const response = await handleSessionRequest(sessionRequest(), options(mock, { ...ENV, [key]: value }));
    assert.equal(response.status, 503, key);
    assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 }, key);
  }
});

test("requires Vercel's trusted client address before validation", async () => {
  const mock = services();
  const response = await handleSessionRequest(sessionRequest({ ip: "" }), options(mock));

  assert.equal(response.status, 400);
  assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 });
});

test("allows an explicitly configured Vercel preview without Turnstile", async () => {
  const mock = services({ redisNamespace: "iw:{session-broker-preview}" });
  const nativePreviewRequest = new Request("https://preview.example.test/api/session", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": "203.0.113.9" },
  });
  const response = await handleSessionRequest(nativePreviewRequest, options(mock, PREVIEW_ENV));

  assert.equal(response.status, 200);
  assert.deepEqual(mock.calls, { turnstile: 0, redis: 1, reactor: 1 });
});

test("never enables the preview bypass outside an explicitly configured Vercel preview", async () => {
  for (const env of [
    { ...PREVIEW_ENV, VERCEL: "" },
    { ...PREVIEW_ENV, VERCEL_ENV: "production" },
    { ...PREVIEW_ENV, SESSION_PREVIEW_BYPASS: "" },
  ]) {
    const mock = services();
    const response = await handleSessionRequest(sessionRequest(), options(mock, env));
    assert.equal(response.status, 503);
    assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 });
  }
});

test("rejects a missing play challenge before any external call", async () => {
  const mock = services();
  const response = await handleSessionRequest(sessionRequest({ token: "" }), options(mock));

  assert.equal(response.status, 400);
  assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 });
});

test("rejects invalid, wrong-action, and wrong-hostname challenges without Reactor", async (t) => {
  const cases = [
    ["invalid", { success: false }],
    ["wrong action", { action: "login" }],
    ["wrong hostname", { hostname: "attacker.example" }],
  ];
  for (const [name, turnstile] of cases) {
    await t.test(name, async () => {
      const mock = services({ turnstile });
      const response = await handleSessionRequest(sessionRequest(), options(mock));
      assert.equal(response.status, 403);
      assert.deepEqual(mock.calls, { turnstile: 1, redis: 0, reactor: 0 });
    });
  }
});

test("challenge verification failure fails closed before Redis and Reactor", async () => {
  const mock = services();
  mock.fetchImpl = async () => {
    mock.calls.turnstile += 1;
    throw new Error("siteverify unavailable");
  };
  const response = await handleSessionRequest(sessionRequest(), options(mock));

  assert.equal(response.status, 502);
  assert.deepEqual(mock.calls, { turnstile: 1, redis: 0, reactor: 0 });
});

test("a replayed one-time challenge never mints a second Reactor token", async () => {
  const mock = services();
  const used = new Set();
  mock.redis.eval = async (_script, keys) => {
    mock.calls.redis += 1;
    if (used.has(keys[0])) return [0, "replay", 0, 0];
    used.add(keys[0]);
    return [1, "ok", 1, 1];
  };

  const first = await handleSessionRequest(sessionRequest(), options(mock));
  const replay = await handleSessionRequest(sessionRequest(), options(mock));

  assert.equal(first.status, 200);
  assert.equal(replay.status, 409);
  assert.deepEqual(mock.calls, { turnstile: 2, redis: 2, reactor: 1 });
});

test("per-client excess is rejected before Reactor", async () => {
  const mock = services({ admission: [0, "client", 2, 9] });
  const response = await handleSessionRequest(sessionRequest(), options(mock));

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "600");
  assert.deepEqual(mock.calls, { turnstile: 1, redis: 1, reactor: 0 });
});

test("global daily exhaustion is rejected before Reactor", async () => {
  const mock = services({ admission: [0, "global", 1, 100] });
  const response = await handleSessionRequest(sessionRequest(), options(mock));

  assert.equal(response.status, 429);
  assert.deepEqual(mock.calls, { turnstile: 1, redis: 1, reactor: 0 });
});

test("durable-store failure fails closed before Reactor", async () => {
  const mock = services();
  mock.redis.eval = async () => {
    mock.calls.redis += 1;
    throw new Error("redis unavailable");
  };
  const response = await handleSessionRequest(sessionRequest(), options(mock));

  assert.equal(response.status, 503);
  assert.deepEqual(mock.calls, { turnstile: 1, redis: 1, reactor: 0 });
});

test("mints only after challenge and durable admission succeed", async () => {
  const mock = services();
  const response = await handleSessionRequest(sessionRequest(), options(mock));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { jwt: "short-lived-jwt" });
  assert.deepEqual(mock.calls, { turnstile: 1, redis: 1, reactor: 1 });
});

test("Reactor failures remain generic and never expose server credentials", async () => {
  const mock = services();
  mock.fetchImpl = async (url) => {
    if (String(url).includes("turnstile")) {
      mock.calls.turnstile += 1;
      return Response.json({ success: true, action: "session", hostname: "play.example.test" });
    }
    mock.calls.reactor += 1;
    return Response.json({ error: ENV.REACTOR_API_KEY }, { status: 429 });
  };
  const response = await handleSessionRequest(sessionRequest(), options(mock));
  const body = await response.text();

  assert.equal(response.status, 502);
  assert.equal(body.includes(ENV.REACTOR_API_KEY), false);
});
