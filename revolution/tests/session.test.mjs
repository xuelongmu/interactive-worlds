import assert from "node:assert/strict";
import test from "node:test";

import { handleSessionRequest } from "../api/session.ts";

const CLEARANCE = "A".repeat(43);
const OTHER_CLEARANCE = "B".repeat(43);
const TOKEN = "one-time-challenge";
const ADDRESS = "203.0.113.9";
const START = Date.parse("2026-07-19T12:00:00.000Z");
const DEFAULT_TTL = 30 * 24 * 60 * 60;

const ENV = {
  REACTOR_API_KEY: "server-reactor-secret",
  TURNSTILE_SECRET_KEY: "server-turnstile-secret",
  TURNSTILE_EXPECTED_HOSTNAMES: "play.example.test",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "server-redis-secret",
  SESSION_CLIENT_HASH_SECRET: "a-server-only-client-hash-secret-32-chars",
  SESSION_CLEARANCE_HASH_SECRET: "a-separate-clearance-hash-secret-32-chars",
  SESSION_CLIENT_LIMIT: "10",
  SESSION_CLIENT_WINDOW_SECONDS: "600",
  SESSION_GLOBAL_DAILY_LIMIT: "100",
};

const PREVIEW_ENV = {
  ...ENV,
  VERCEL: "1",
  VERCEL_ENV: "preview",
  SESSION_PREVIEW_BYPASS: "1",
  VITE_SESSION_CHALLENGE_MODE: "disabled",
  TURNSTILE_SECRET_KEY: "",
  TURNSTILE_EXPECTED_HOSTNAMES: "",
  SESSION_CLEARANCE_HASH_SECRET: "",
};

function sessionRequest({
  method = "POST",
  token,
  cookie,
  ip = ADDRESS,
  rawBody,
} = {}) {
  const headers = new Headers();
  if (ip) headers.set("x-vercel-forwarded-for", ip);
  if (cookie) headers.set("cookie", cookie);
  let body;
  if (method === "POST") {
    if (rawBody !== undefined) body = rawBody;
    else if (token !== undefined) body = JSON.stringify({ challengeToken: token });
    if (body !== undefined) headers.set("content-type", "application/json");
  }
  return new Request("https://play.example.test/api/session", { method, headers, body });
}

function cookieHeader(clearance = CLEARANCE) {
  return "__Secure-iw_session_clearance=" + clearance;
}

function clearanceFrom(response) {
  const cookie = response.headers.get("set-cookie") ?? "";
  const match = cookie.match(/__Secure-iw_session_clearance=([A-Za-z0-9_-]{43})/);
  return match?.[1] ?? null;
}

class FakeRedis {
  constructor(clock) {
    this.clock = clock;
    this.values = new Map();
    this.evalCalls = [];
  }

  entry(key) {
    const entry = this.values.get(key);
    if (entry && entry.expiresAt <= this.clock.now) {
      this.values.delete(key);
      return undefined;
    }
    return entry;
  }

  get(key) {
    return this.entry(key)?.value;
  }

  set(key, value, ttlSeconds) {
    this.values.set(key, {
      value,
      expiresAt: this.clock.now + Number(ttlSeconds) * 1000,
    });
  }

  expire(key, ttlSeconds) {
    const entry = this.entry(key);
    if (entry) entry.expiresAt = this.clock.now + Number(ttlSeconds) * 1000;
  }

  increment(key, ttlSeconds) {
    const entry = this.entry(key);
    const value = Number(entry?.value ?? 0) + 1;
    if (entry) entry.value = value;
    else this.set(key, value, ttlSeconds);
    return value;
  }

  delete(key) {
    this.values.delete(key);
  }

  clearanceKey() {
    return [...this.values.keys()].find((key) => key.includes(":clearance:"));
  }

  ttlSeconds(key) {
    const entry = this.entry(key);
    return entry ? Math.ceil((entry.expiresAt - this.clock.now) / 1000) : -1;
  }

  async eval(script, keys, args) {
    this.evalCalls.push({ script, keys: [...keys], args: [...args] });
    const [clientLimit, clientTtl, globalLimit, globalTtl] = args.map(Number);

    if (script.includes("local replay = KEYS[1]")) {
      const [replay, client, global, clearance] = keys;
      if (this.entry(replay)) return [0, "replay", 0, 0];
      this.set(replay, "1", Number(args[4]));

      const clientUsed = Number(this.get(client) ?? 0);
      if (clientUsed >= clientLimit) return [0, "client", clientUsed, 0];
      const globalUsed = Number(this.get(global) ?? 0);
      if (globalUsed >= globalLimit) return [0, "global", clientUsed, globalUsed];

      this.set(clearance, "1", Number(args[5]));
      return [
        1,
        "ok",
        this.increment(client, clientTtl),
        this.increment(global, globalTtl),
      ];
    }

    if (keys.length === 2) {
      const [client, global] = keys;
      const clientUsed = Number(this.get(client) ?? 0);
      if (clientUsed >= clientLimit) return [0, "client", clientUsed, 0];
      const globalUsed = Number(this.get(global) ?? 0);
      if (globalUsed >= globalLimit) return [0, "global", clientUsed, globalUsed];
      return [
        1,
        "ok",
        this.increment(client, clientTtl),
        this.increment(global, globalTtl),
      ];
    }

    const [clearance, client, global] = keys;
    if (!this.entry(clearance)) return [0, "clearance", 0, 0];
    const clientUsed = Number(this.get(client) ?? 0);
    if (clientUsed >= clientLimit) return [0, "client", clientUsed, 0];
    const globalUsed = Number(this.get(global) ?? 0);
    if (globalUsed >= globalLimit) return [0, "global", clientUsed, globalUsed];

    this.expire(clearance, Number(args[4]));
    return [
      1,
      "ok",
      this.increment(client, clientTtl),
      this.increment(global, globalTtl),
    ];
  }
}

function services({
  turnstile = {},
  turnstileStatus = 200,
  turnstileError,
  reactor = {},
  reactorStatus = 200,
  env = ENV,
} = {}) {
  const clock = { now: START };
  const calls = { turnstile: 0, redis: 0, reactor: 0 };
  const siteverifyBodies = [];
  const redis = new FakeRedis(clock);
  const originalEval = redis.eval.bind(redis);
  redis.eval = async (...args) => {
    calls.redis += 1;
    return originalEval(...args);
  };

  const fetchImpl = async (url, init) => {
    if (String(url).includes("turnstile")) {
      calls.turnstile += 1;
      if (turnstileError) throw turnstileError;
      const body = JSON.parse(String(init?.body));
      siteverifyBodies.push(body);
      assert.equal(body.secret, env.TURNSTILE_SECRET_KEY);
      assert.equal(body.remoteip, ADDRESS);
      assert.equal(body.idempotency_key, "00000000-0000-4000-8000-000000000000");
      return Response.json({
        success: true,
        action: "session",
        hostname: "play.example.test",
        ...turnstile,
      }, { status: turnstileStatus });
    }
    calls.reactor += 1;
    assert.equal(String(url), "https://api.reactor.inc/tokens");
    assert.equal(new Headers(init?.headers).get("Reactor-API-Key"), env.REACTOR_API_KEY);
    return Response.json({ jwt: "short-lived-jwt", ...reactor }, { status: reactorStatus });
  };
  const options = {
    env,
    fetchImpl,
    redis,
    now: () => new Date(clock.now),
    randomUUID: () => "00000000-0000-4000-8000-000000000000",
    randomClearance: () => CLEARANCE,
  };
  return { calls, clock, fetchImpl, options, redis, siteverifyBodies };
}

async function exchange(mock, request = sessionRequest({ token: TOKEN })) {
  return handleSessionRequest(request, mock.options);
}

test("rejects non-POST requests before any external call", async () => {
  const mock = services();
  const response = await handleSessionRequest(sessionRequest({ method: "GET" }), mock.options);

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 });
});

test("fails closed for missing or invalid production policy", async () => {
  const required = [
    "REACTOR_API_KEY",
    "TURNSTILE_SECRET_KEY",
    "TURNSTILE_EXPECTED_HOSTNAMES",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "SESSION_CLIENT_HASH_SECRET",
    "SESSION_CLEARANCE_HASH_SECRET",
    "SESSION_CLIENT_LIMIT",
    "SESSION_CLIENT_WINDOW_SECONDS",
    "SESSION_GLOBAL_DAILY_LIMIT",
  ];
  for (const key of required) {
    const env = { ...ENV, [key]: "" };
    const mock = services({ env });
    const response = await handleSessionRequest(sessionRequest(), mock.options);
    assert.equal(response.status, 503, key);
    assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 }, key);
  }

  for (const [key, value] of [
    ["SESSION_CLEARANCE_TTL_SECONDS", "299"],
    ["SESSION_CLEARANCE_TTL_SECONDS", String(DEFAULT_TTL + 1)],
    ["SESSION_CLEARANCE_COOKIE_SECURE", "sometimes"],
    ["SESSION_CLIENT_LIMIT", "0"],
    ["SESSION_CLIENT_WINDOW_SECONDS", "-1"],
    ["SESSION_GLOBAL_DAILY_LIMIT", "1.5"],
    ["SESSION_CLIENT_HASH_SECRET", "too-short"],
    ["SESSION_CLEARANCE_HASH_SECRET", "too-short"],
    ["TURNSTILE_EXPECTED_HOSTNAMES", "https://play.example.test"],
    ["UPSTASH_REDIS_REST_URL", "http://redis.example.test"],
  ]) {
    const env = { ...ENV, [key]: value };
    const mock = services({ env });
    const response = await handleSessionRequest(sessionRequest(), mock.options);
    assert.equal(response.status, 503, key + "=" + value);
  }

  const productionInsecure = services({
    env: {
      ...ENV,
      NODE_ENV: "production",
      SESSION_CLEARANCE_COOKIE_SECURE: "false",
    },
  });
  assert.equal(
    (await handleSessionRequest(sessionRequest(), productionInsecure.options)).status,
    503
  );
});

test("first unauthenticated POST returns an explicit challenge requirement", async () => {
  const mock = services();
  const response = await handleSessionRequest(sessionRequest(), mock.options);

  assert.equal(response.status, 428);
  assert.equal(response.headers.get("x-session-challenge"), "turnstile");
  assert.deepEqual(await response.json(), {
    error: "challenge required",
    code: "challenge_required",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 });
});

test("requires Vercel's trusted client address before challenging", async () => {
  const mock = services();
  const response = await handleSessionRequest(sessionRequest({ ip: "" }), mock.options);

  assert.equal(response.status, 400);
  assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 });
});

test("successful initial verification sets a hardened opaque clearance cookie", async () => {
  const mock = services();
  const response = await exchange(mock);
  const cookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { jwt: "short-lived-jwt" });
  assert.equal(clearanceFrom(response), CLEARANCE);
  assert.match(cookie, /Max-Age=2592000/);
  assert.match(cookie, /Path=\/api\/session/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.deepEqual(mock.calls, { turnstile: 1, redis: 1, reactor: 1 });
  assert.equal(mock.siteverifyBodies[0].response, TOKEN);

  const persisted = JSON.stringify(mock.redis.evalCalls);
  for (const raw of [
    CLEARANCE,
    ADDRESS,
    TOKEN,
    ENV.REACTOR_API_KEY,
    ENV.TURNSTILE_SECRET_KEY,
    "short-lived-jwt",
  ]) {
    assert.equal(persisted.includes(raw), false, raw);
  }
  assert.equal(mock.redis.evalCalls[0].keys.length, 4);
  assert.equal(mock.redis.evalCalls[0].args.at(-1), DEFAULT_TTL);
});

test("local server tests may explicitly disable Secure, deployed environments may not", async () => {
  const env = {
    ...ENV,
    NODE_ENV: "development",
    SESSION_CLEARANCE_COOKIE_SECURE: "false",
  };
  const mock = services({ env });
  const response = await exchange(mock);
  const cookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 200);
  assert.match(cookie, /^iw_session_clearance=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(cookie.includes("; Secure"), false);
});

test("later POSTs reuse clearance with no Siteverify and still consume client admission", async () => {
  const env = { ...ENV, SESSION_CLIENT_LIMIT: "2" };
  const mock = services({ env });
  const first = await exchange(mock);
  const clearance = clearanceFrom(first);
  assert.equal(clearance, CLEARANCE);

  const second = await handleSessionRequest(
    sessionRequest({ cookie: cookieHeader(clearance) }),
    mock.options
  );
  const third = await handleSessionRequest(
    sessionRequest({ cookie: cookieHeader(clearance) }),
    mock.options
  );

  assert.equal(second.status, 200);
  assert.equal(clearanceFrom(second), clearance);
  assert.equal(third.status, 429);
  assert.equal(third.headers.get("retry-after"), "600");
  assert.deepEqual(mock.calls, { turnstile: 1, redis: 3, reactor: 2 });
});

test("clearance reuse still consumes the global daily admission limit", async () => {
  const env = { ...ENV, SESSION_GLOBAL_DAILY_LIMIT: "1" };
  const mock = services({ env });
  const first = await exchange(mock);
  const second = await handleSessionRequest(
    sessionRequest({ cookie: cookieHeader(clearanceFrom(first)), ip: "198.51.100.7" }),
    mock.options
  );

  assert.equal(second.status, 429);
  assert.equal(mock.calls.turnstile, 1);
  assert.equal(mock.calls.reactor, 1);
});

test("valid admitted reuse refreshes the bounded sliding TTL at clock boundaries", async () => {
  const env = { ...ENV, SESSION_CLEARANCE_TTL_SECONDS: "300" };
  const mock = services({ env });
  const first = await exchange(mock);
  const clearance = clearanceFrom(first);
  const key = mock.redis.clearanceKey();
  assert.ok(key);
  assert.equal(mock.redis.ttlSeconds(key), 300);

  mock.clock.now += 299_000;
  const refreshed = await handleSessionRequest(
    sessionRequest({ cookie: cookieHeader(clearance) }),
    mock.options
  );
  assert.equal(refreshed.status, 200);
  assert.equal(mock.redis.ttlSeconds(key), 300);

  mock.clock.now += 299_000;
  const beforeBoundary = await handleSessionRequest(
    sessionRequest({ cookie: cookieHeader(clearance) }),
    mock.options
  );
  assert.equal(beforeBoundary.status, 200);

  mock.clock.now += 301_000;
  const expired = await handleSessionRequest(
    sessionRequest({ cookie: cookieHeader(clearance) }),
    mock.options
  );
  assert.equal(expired.status, 428);
  assert.match(expired.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("revoked, unknown, expired, malformed, and duplicate clearance cookies challenge again", async (t) => {
  await t.test("revoked", async () => {
    const mock = services();
    const first = await exchange(mock);
    mock.redis.delete(mock.redis.clearanceKey());
    const response = await handleSessionRequest(
      sessionRequest({ cookie: cookieHeader(clearanceFrom(first)) }),
      mock.options
    );
    assert.equal(response.status, 428);
    assert.equal(mock.calls.turnstile, 1);
  });

  await t.test("unknown", async () => {
    const mock = services();
    const response = await handleSessionRequest(
      sessionRequest({ cookie: cookieHeader(OTHER_CLEARANCE) }),
      mock.options
    );
    assert.equal(response.status, 428);
    assert.equal(mock.calls.redis, 1);
  });

  await t.test("expired", async () => {
    const mock = services();
    const first = await exchange(mock);
    mock.clock.now += (DEFAULT_TTL + 1) * 1000;
    const response = await handleSessionRequest(
      sessionRequest({ cookie: cookieHeader(clearanceFrom(first)) }),
      mock.options
    );
    assert.equal(response.status, 428);
  });

  for (const [name, cookie] of [
    ["malformed", cookieHeader("not-opaque")],
    ["duplicate", cookieHeader(CLEARANCE) + "; " + cookieHeader(OTHER_CLEARANCE)],
  ]) {
    await t.test(name, async () => {
      const mock = services();
      const response = await handleSessionRequest(sessionRequest({ cookie }), mock.options);
      assert.equal(response.status, 428);
      assert.equal(mock.calls.redis, 0);
      assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
    });
  }
});

test("allows an explicitly configured Vercel preview without Turnstile", async () => {
  const mock = services({ env: PREVIEW_ENV });
  const nativePreviewRequest = new Request("https://preview.example.test/api/session", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": ADDRESS },
  });
  const response = await handleSessionRequest(nativePreviewRequest, mock.options);

  assert.equal(response.status, 200);
  assert.deepEqual(mock.calls, { turnstile: 0, redis: 1, reactor: 1 });
  assert.equal(
    mock.redis.evalCalls[0].keys.every((key) => key.startsWith("iw:{session-broker-preview}:")),
    true
  );
  assert.equal(JSON.stringify(mock.redis.evalCalls).includes(ADDRESS), false);
});

test("never enables the preview bypass outside an explicitly configured Vercel preview", async () => {
  for (const env of [
    { ...PREVIEW_ENV, VERCEL: "" },
    { ...PREVIEW_ENV, VERCEL_ENV: "production" },
    { ...PREVIEW_ENV, SESSION_PREVIEW_BYPASS: "" },
    { ...PREVIEW_ENV, VITE_SESSION_CHALLENGE_MODE: "" },
  ]) {
    const mock = services({ env });
    const response = await handleSessionRequest(sessionRequest(), mock.options);
    assert.equal(response.status, 503);
    assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 });
  }
});

test("invalid, wrong-action, and wrong-hostname challenges never create clearance", async (t) => {
  for (const [name, turnstile] of [
    ["invalid", { success: false }],
    ["wrong action", { action: "login" }],
    ["wrong hostname", { hostname: "attacker.example" }],
  ]) {
    await t.test(name, async () => {
      const mock = services({ turnstile });
      const response = await exchange(mock);
      assert.equal(response.status, 403);
      assert.equal(response.headers.has("set-cookie"), false);
      assert.deepEqual(mock.calls, { turnstile: 1, redis: 0, reactor: 0 });
    });
  }
});

test("Siteverify failures and timeouts fail closed with generic errors", async (t) => {
  for (const [name, error] of [
    ["failure", new Error("provider unavailable " + ENV.TURNSTILE_SECRET_KEY)],
    ["timeout", new DOMException("timed out", "TimeoutError")],
  ]) {
    await t.test(name, async () => {
      const mock = services({ turnstileError: error });
      const response = await exchange(mock);
      const body = await response.text();
      assert.equal(response.status, 502);
      assert.equal(body.includes(ENV.TURNSTILE_SECRET_KEY), false);
      assert.equal(body.includes(TOKEN), false);
      assert.deepEqual(mock.calls, { turnstile: 1, redis: 0, reactor: 0 });
    });
  }
});

test("replayed initial Turnstile responses remain rejected", async () => {
  const mock = services();
  const first = await exchange(mock);
  const replay = await exchange(mock);

  assert.equal(first.status, 200);
  assert.equal(replay.status, 409);
  assert.deepEqual(mock.calls, { turnstile: 2, redis: 2, reactor: 1 });
});

test("concurrent exchanges cannot replay one response or bypass admission", async () => {
  const mock = services();
  const responses = await Promise.all([exchange(mock), exchange(mock)]);
  const statuses = responses.map((response) => response.status).sort();

  assert.deepEqual(statuses, [200, 409]);
  assert.equal(mock.calls.reactor, 1);
  assert.equal(mock.redis.evalCalls.length, 2);
});

test("valid challenges consumed at an admission limit cannot be replayed later", async () => {
  const env = { ...ENV, SESSION_CLIENT_LIMIT: "1" };
  const mock = services({ env });
  await exchange(mock);
  const limited = await exchange(mock, sessionRequest({ token: "second-challenge" }));
  const replay = await exchange(mock, sessionRequest({ token: "second-challenge" }));

  assert.equal(limited.status, 429);
  assert.equal(replay.status, 409);
  assert.equal(mock.calls.reactor, 1);
});

test("durable-store failure fails closed before Reactor", async () => {
  const mock = services();
  mock.options.redis.eval = async () => {
    mock.calls.redis += 1;
    throw new Error("redis unavailable " + ENV.UPSTASH_REDIS_REST_TOKEN);
  };
  const response = await exchange(mock);
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.equal(body.includes(ENV.UPSTASH_REDIS_REST_TOKEN), false);
  assert.deepEqual(mock.calls, { turnstile: 1, redis: 1, reactor: 0 });
});

test("Reactor failures stay generic while preserving the newly verified clearance", async () => {
  const mock = services({
    reactor: { error: ENV.REACTOR_API_KEY, jwt: TOKEN },
    reactorStatus: 429,
  });
  const response = await exchange(mock);
  const body = await response.text();

  assert.equal(response.status, 502);
  assert.equal(clearanceFrom(response), CLEARANCE);
  for (const raw of [ENV.REACTOR_API_KEY, ENV.TURNSTILE_SECRET_KEY, TOKEN]) {
    assert.equal(body.includes(raw), false);
  }
});

test("malformed challenge payloads never call Siteverify", async () => {
  for (const request of [
    sessionRequest({ rawBody: "{" }),
    sessionRequest({ rawBody: JSON.stringify({ challengeToken: 42 }) }),
    sessionRequest({ token: "x".repeat(2049) }),
  ]) {
    const mock = services();
    const response = await handleSessionRequest(request, mock.options);
    assert.equal(response.status, 400);
    assert.deepEqual(mock.calls, { turnstile: 0, redis: 0, reactor: 0 });
  }
});
