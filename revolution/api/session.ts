import { Redis } from "@upstash/redis";

const REACTOR_TOKENS_URL = "https://api.reactor.inc/tokens";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "session";
const CHALLENGE_TTL_SECONDS = 600;

const ADMISSION_SCRIPT = `
local replay = KEYS[1]
local client = KEYS[2]
local global = KEYS[3]
local client_limit = tonumber(ARGV[1])
local client_ttl = tonumber(ARGV[2])
local global_limit = tonumber(ARGV[3])
local global_ttl = tonumber(ARGV[4])
local replay_ttl = tonumber(ARGV[5])

if redis.call("EXISTS", replay) == 1 then
  return {0, "replay", 0, 0}
end

local client_used = tonumber(redis.call("GET", client) or "0")
if client_used >= client_limit then
  return {0, "client", client_used, 0}
end

local global_used = tonumber(redis.call("GET", global) or "0")
if global_used >= global_limit then
  return {0, "global", client_used, global_used}
end

redis.call("SET", replay, "1", "EX", replay_ttl)
client_used = redis.call("INCR", client)
if client_used == 1 then redis.call("EXPIRE", client, client_ttl) end
global_used = redis.call("INCR", global)
if global_used == 1 then redis.call("EXPIRE", global, global_ttl) end

return {1, "ok", client_used, global_used}
`;

type ServerEnvironment = Record<string, string | undefined>;

type RedisEval = {
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>;
};

type BrokerConfig = {
  reactorApiKey: string;
  turnstileSecretKey: string;
  expectedHostnames: Set<string>;
  redisUrl: string;
  redisToken: string;
  clientHashSecret: string;
  clientLimit: number;
  clientWindowSeconds: number;
  globalDailyLimit: number;
};

type SessionBrokerOptions = {
  env?: ServerEnvironment;
  fetchImpl?: typeof fetch;
  redis?: RedisEval;
  now?: () => Date;
  randomUUID?: () => string;
};

type TurnstileResult = {
  success?: boolean;
  hostname?: string;
  action?: string;
};

type Admission = {
  allowed: boolean;
  reason: "ok" | "replay" | "client" | "global";
};

function serverEnvironment(): ServerEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: ServerEnvironment };
  };
  return runtime.process?.env ?? {};
}

function positiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function configuration(env: ServerEnvironment): BrokerConfig | null {
  const reactorApiKey = env.REACTOR_API_KEY?.trim() ?? "";
  const turnstileSecretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  const redisUrl = env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
  const clientHashSecret = env.SESSION_CLIENT_HASH_SECRET?.trim() ?? "";
  const clientLimit = positiveInteger(env.SESSION_CLIENT_LIMIT);
  const clientWindowSeconds = positiveInteger(env.SESSION_CLIENT_WINDOW_SECONDS);
  const globalDailyLimit = positiveInteger(env.SESSION_GLOBAL_DAILY_LIMIT);
  const hostnames = (env.TURNSTILE_EXPECTED_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  const validHostnames = hostnames.length > 0 && hostnames.every((hostname) =>
    /^[a-z0-9.-]+(?::\d+)?$/i.test(hostname)
  );

  if (
    !reactorApiKey || !turnstileSecretKey || !isHttpsUrl(redisUrl) || !redisToken ||
    clientHashSecret.length < 32 || !clientLimit || !clientWindowSeconds ||
    !globalDailyLimit || !validHostnames
  ) {
    return null;
  }

  return {
    reactorApiKey,
    turnstileSecretKey,
    expectedHostnames: new Set(hostnames),
    redisUrl,
    redisToken,
    clientHashSecret,
    clientLimit,
    clientWindowSeconds,
    globalDailyLimit,
  };
}

function json(status: number, body: object, extraHeaders: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}

function clientAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-vercel-forwarded-for");
  if (!forwarded) return null;
  const address = forwarded.split(",", 1)[0]?.trim() ?? "";
  return address && address.length <= 128 ? address : null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateChallenge(
  token: string,
  address: string,
  config: BrokerConfig,
  fetchImpl: typeof fetch,
  randomUUID: () => string
): Promise<boolean> {
  const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret: config.turnstileSecretKey,
      response: token,
      remoteip: address,
      idempotency_key: randomUUID(),
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return false;
  const result = await response.json() as TurnstileResult;
  return result.success === true && result.action === TURNSTILE_ACTION &&
    !!result.hostname && config.expectedHostnames.has(result.hostname.toLowerCase());
}

function secondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000) + 60);
}

async function admit(
  token: string,
  address: string,
  config: BrokerConfig,
  redis: RedisEval,
  now: Date
): Promise<Admission> {
  const [challengeHash, clientHash] = await Promise.all([
    sha256Hex(token),
    hmacHex(config.clientHashSecret, address),
  ]);
  const day = now.toISOString().slice(0, 10);
  const namespace = "iw:{session-broker}";
  const result = await redis.eval(
    ADMISSION_SCRIPT,
    [
      `${namespace}:challenge:${challengeHash}`,
      `${namespace}:client:${clientHash}`,
      `${namespace}:global:${day}`,
    ],
    [
      config.clientLimit,
      config.clientWindowSeconds,
      config.globalDailyLimit,
      secondsUntilNextUtcDay(now),
      CHALLENGE_TTL_SECONDS,
    ]
  );
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("invalid admission response");
  }
  const reason = String(result[1]) as Admission["reason"];
  if (!(["ok", "replay", "client", "global"] as string[]).includes(reason)) {
    throw new Error("invalid admission reason");
  }
  return { allowed: Number(result[0]) === 1, reason };
}

/**
 * Mint a short-lived Reactor JWT only after a one-time challenge and durable,
 * atomic admission controls have both passed.
 */
export async function handleSessionRequest(
  request: Request,
  options: SessionBrokerOptions = {}
): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" }, { allow: "POST" });
  }

  const config = configuration(options.env ?? serverEnvironment());
  if (!config) {
    return json(503, { error: "session service unavailable" });
  }

  const address = clientAddress(request);
  if (!address) {
    return json(400, { error: "client address unavailable" });
  }

  let challengeToken = "";
  try {
    const body = await request.json() as { challengeToken?: unknown };
    if (typeof body.challengeToken === "string") challengeToken = body.challengeToken.trim();
  } catch {
    return json(400, { error: "invalid request" });
  }
  if (!challengeToken || challengeToken.length > 2048) {
    return json(400, { error: "challenge required" });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let challengeValid = false;
  try {
    challengeValid = await validateChallenge(
      challengeToken,
      address,
      config,
      fetchImpl,
      options.randomUUID ?? (() => crypto.randomUUID())
    );
  } catch {
    return json(502, { error: "challenge verification unavailable" });
  }
  if (!challengeValid) {
    return json(403, { error: "challenge rejected" });
  }

  const redis = options.redis ?? new Redis({ url: config.redisUrl, token: config.redisToken });
  let admission: Admission;
  try {
    admission = await admit(challengeToken, address, config, redis, options.now?.() ?? new Date());
  } catch {
    return json(503, { error: "session service unavailable" });
  }
  if (!admission.allowed) {
    const retryAfter = admission.reason === "client"
      ? config.clientWindowSeconds
      : secondsUntilNextUtcDay(options.now?.() ?? new Date());
    return json(
      admission.reason === "replay" ? 409 : 429,
      { error: admission.reason === "replay" ? "challenge already used" : "session capacity reached" },
      admission.reason === "replay" ? {} : { "retry-after": String(retryAfter) }
    );
  }

  try {
    const upstream = await fetchImpl(REACTOR_TOKENS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Reactor-API-Key": config.reactorApiKey,
      },
      body: "{}",
      signal: AbortSignal.timeout(5_000),
    });
    if (!upstream.ok) return json(502, { error: "token mint failed" });
    const body = await upstream.json() as { jwt?: unknown };
    if (typeof body.jwt !== "string" || !body.jwt) {
      return json(502, { error: "token mint failed" });
    }
    return json(200, { jwt: body.jwt });
  } catch {
    return json(502, { error: "token mint failed" });
  }
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleSessionRequest(request);
  },
};
