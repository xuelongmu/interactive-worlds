import { Redis } from "@upstash/redis";

const REACTOR_TOKENS_URL = "https://api.reactor.inc/tokens";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "session";
const CHALLENGE_TTL_SECONDS = 600;
const DEFAULT_CLEARANCE_TTL_SECONDS = 30 * 24 * 60 * 60;
const MIN_CLEARANCE_TTL_SECONDS = 300;
const MAX_CLEARANCE_TTL_SECONDS = DEFAULT_CLEARANCE_TTL_SECONDS;
const SECURE_CLEARANCE_COOKIE = "__Secure-iw_session_clearance";
const LOCAL_CLEARANCE_COOKIE = "iw_session_clearance";
const CLEARANCE_PATH = "/api/session";
const CLEARANCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const CHALLENGE_ADMISSION_SCRIPT = [
  'local replay = KEYS[1]',
  'local client = KEYS[2]',
  'local global = KEYS[3]',
  'local clearance = KEYS[4]',
  'local client_limit = tonumber(ARGV[1])',
  'local client_ttl = tonumber(ARGV[2])',
  'local global_limit = tonumber(ARGV[3])',
  'local global_ttl = tonumber(ARGV[4])',
  'local replay_ttl = tonumber(ARGV[5])',
  'local clearance_ttl = tonumber(ARGV[6])',
  '',
  'if redis.call("EXISTS", replay) == 1 then',
  '  return {0, "replay", 0, 0}',
  'end',
  '',
  '-- Consume a verified Turnstile response exactly once, even when an admission',
  '-- limit rejects the request. A single-use response must never become reusable.',
  'redis.call("SET", replay, "1", "EX", replay_ttl)',
  '',
  'local client_used = tonumber(redis.call("GET", client) or "0")',
  'if client_used >= client_limit then',
  '  return {0, "client", client_used, 0}',
  'end',
  '',
  'local global_used = tonumber(redis.call("GET", global) or "0")',
  'if global_used >= global_limit then',
  '  return {0, "global", client_used, global_used}',
  'end',
  '',
  'redis.call("SET", clearance, "1", "EX", clearance_ttl)',
  'client_used = redis.call("INCR", client)',
  'if client_used == 1 then redis.call("EXPIRE", client, client_ttl) end',
  'global_used = redis.call("INCR", global)',
  'if global_used == 1 then redis.call("EXPIRE", global, global_ttl) end',
  '',
  'return {1, "ok", client_used, global_used}',
].join("\n");

const CLEARANCE_ADMISSION_SCRIPT = [
  'local clearance = KEYS[1]',
  'local client = KEYS[2]',
  'local global = KEYS[3]',
  'local client_limit = tonumber(ARGV[1])',
  'local client_ttl = tonumber(ARGV[2])',
  'local global_limit = tonumber(ARGV[3])',
  'local global_ttl = tonumber(ARGV[4])',
  'local clearance_ttl = tonumber(ARGV[5])',
  '',
  'if redis.call("EXISTS", clearance) ~= 1 then',
  '  return {0, "clearance", 0, 0}',
  'end',
  '',
  'local client_used = tonumber(redis.call("GET", client) or "0")',
  'if client_used >= client_limit then',
  '  return {0, "client", client_used, 0}',
  'end',
  '',
  'local global_used = tonumber(redis.call("GET", global) or "0")',
  'if global_used >= global_limit then',
  '  return {0, "global", client_used, global_used}',
  'end',
  '',
  '-- Renewal is atomic with validation and admission. Unknown, expired, revoked,',
  '-- or over-limit credentials are never recreated or extended.',
  'redis.call("EXPIRE", clearance, clearance_ttl)',
  'client_used = redis.call("INCR", client)',
  'if client_used == 1 then redis.call("EXPIRE", client, client_ttl) end',
  'global_used = redis.call("INCR", global)',
  'if global_used == 1 then redis.call("EXPIRE", global, global_ttl) end',
  '',
  'return {1, "ok", client_used, global_used}',
].join("\n");

const PREVIEW_ADMISSION_SCRIPT = [
  'local client = KEYS[1]',
  'local global = KEYS[2]',
  'local client_limit = tonumber(ARGV[1])',
  'local client_ttl = tonumber(ARGV[2])',
  'local global_limit = tonumber(ARGV[3])',
  'local global_ttl = tonumber(ARGV[4])',
  '',
  'local client_used = tonumber(redis.call("GET", client) or "0")',
  'if client_used >= client_limit then',
  '  return {0, "client", client_used, 0}',
  'end',
  'local global_used = tonumber(redis.call("GET", global) or "0")',
  'if global_used >= global_limit then',
  '  return {0, "global", client_used, global_used}',
  'end',
  'client_used = redis.call("INCR", client)',
  'if client_used == 1 then redis.call("EXPIRE", client, client_ttl) end',
  'global_used = redis.call("INCR", global)',
  'if global_used == 1 then redis.call("EXPIRE", global, global_ttl) end',
  'return {1, "ok", client_used, global_used}',
].join("\n");

type ServerEnvironment = Record<string, string | undefined>;

type RedisEval = {
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>;
};

type BrokerConfig = {
  reactorApiKey: string;
  challengeMode: "turnstile" | "preview-bypass";
  turnstileSecretKey: string;
  expectedHostnames: Set<string>;
  redisNamespace: string;
  redisUrl: string;
  redisToken: string;
  clientHashSecret: string;
  clearanceHashSecret: string;
  clearanceTtlSeconds: number;
  secureClearanceCookie: boolean;
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
  randomClearance?: () => string;
};

type TurnstileResult = {
  success?: boolean;
  hostname?: string;
  action?: string;
};

type AdmissionReason = "ok" | "replay" | "clearance" | "client" | "global";

type Admission = {
  allowed: boolean;
  reason: AdmissionReason;
};

type ParsedClearance =
  | { kind: "missing" }
  | { kind: "malformed" }
  | { kind: "present"; value: string };

type ParsedChallenge =
  | { kind: "missing" }
  | { kind: "malformed" }
  | { kind: "present"; value: string };

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

function clearanceTtl(value: string | undefined): number | null {
  if (!value?.trim()) return DEFAULT_CLEARANCE_TTL_SECONDS;
  const parsed = positiveInteger(value.trim());
  if (
    !parsed || parsed < MIN_CLEARANCE_TTL_SECONDS ||
    parsed > MAX_CLEARANCE_TTL_SECONDS
  ) return null;
  return parsed;
}

function secureCookieSetting(env: ServerEnvironment): boolean | null {
  const value = env.SESSION_CLEARANCE_COOKIE_SECURE?.trim().toLowerCase();
  if (!value || value === "true") return true;
  if (value !== "false") return null;
  const deployed = env.NODE_ENV === "production" ||
    ["preview", "production"].includes(env.VERCEL_ENV ?? "");
  return deployed ? null : false;
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
  const previewBypass = env.VERCEL === "1" && env.VERCEL_ENV === "preview" &&
    env.SESSION_PREVIEW_BYPASS === "1" &&
    env.VITE_SESSION_CHALLENGE_MODE === "disabled";
  const turnstileSecretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  const redisUrl = env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
  const clientHashSecret = env.SESSION_CLIENT_HASH_SECRET?.trim() ?? "";
  const clearanceHashSecret = env.SESSION_CLEARANCE_HASH_SECRET?.trim() ?? "";
  const clearanceTtlSeconds = clearanceTtl(env.SESSION_CLEARANCE_TTL_SECONDS);
  const secureClearanceCookie = secureCookieSetting(env);
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
  const validTurnstileConfig = !!turnstileSecretKey && validHostnames &&
    clearanceHashSecret.length >= 32;
  const validChallengeConfig = previewBypass || validTurnstileConfig;

  if (
    !reactorApiKey || !validChallengeConfig || !isHttpsUrl(redisUrl) || !redisToken ||
    clientHashSecret.length < 32 || !clearanceTtlSeconds ||
    secureClearanceCookie === null || !clientLimit || !clientWindowSeconds ||
    !globalDailyLimit
  ) {
    return null;
  }

  return {
    reactorApiKey,
    challengeMode: previewBypass ? "preview-bypass" : "turnstile",
    turnstileSecretKey,
    expectedHostnames: new Set(hostnames),
    redisNamespace: previewBypass ? "iw:{session-broker-preview}" : "iw:{session-broker}",
    redisUrl,
    redisToken,
    clientHashSecret,
    clearanceHashSecret,
    clearanceTtlSeconds,
    secureClearanceCookie,
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

function clearanceCookieName(config: BrokerConfig): string {
  return config.secureClearanceCookie ? SECURE_CLEARANCE_COOKIE : LOCAL_CLEARANCE_COOKIE;
}

function parseClearance(request: Request, config: BrokerConfig): ParsedClearance {
  const cookie = request.headers.get("cookie");
  if (!cookie) return { kind: "missing" };
  const expectedName = clearanceCookieName(config);
  const values = cookie.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== expectedName) return [];
    return [part.slice(separator + 1).trim()];
  });
  if (values.length === 0) return { kind: "missing" };
  if (values.length !== 1 || !CLEARANCE_PATTERN.test(values[0]!)) {
    return { kind: "malformed" };
  }
  return { kind: "present", value: values[0]! };
}

async function parseChallenge(request: Request): Promise<ParsedChallenge> {
  const text = await request.text();
  if (!text.trim()) return { kind: "missing" };
  try {
    const body = JSON.parse(text) as { challengeToken?: unknown };
    if (body.challengeToken === undefined || body.challengeToken === "") {
      return { kind: "missing" };
    }
    if (
      typeof body.challengeToken !== "string" ||
      body.challengeToken.trim().length === 0 ||
      body.challengeToken.length > 2048
    ) return { kind: "malformed" };
    return { kind: "present", value: body.challengeToken.trim() };
  } catch {
    return { kind: "malformed" };
  }
}

function clearanceCookie(
  value: string,
  config: BrokerConfig,
  maxAge = config.clearanceTtlSeconds
): string {
  return [
    clearanceCookieName(config) + "=" + value,
    "Max-Age=" + maxAge,
    "Path=" + CLEARANCE_PATH,
    "HttpOnly",
    "SameSite=Strict",
    config.secureClearanceCookie ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function challengeRequired(config: BrokerConfig, clearCookie = false): Response {
  const headers = new Headers({ "x-session-challenge": "turnstile" });
  if (clearCookie) headers.set("set-cookie", clearanceCookie("", config, 0));
  return json(428, { error: "challenge required", code: "challenge_required" }, headers);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
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
  return Array.from(
    new Uint8Array(signature),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
}

function randomClearance(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

function parseAdmission(result: unknown): Admission {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("invalid admission response");
  }
  const reason = String(result[1]) as AdmissionReason;
  if (!(["ok", "replay", "clearance", "client", "global"] as string[]).includes(reason)) {
    throw new Error("invalid admission reason");
  }
  return { allowed: Number(result[0]) === 1, reason };
}

function admissionKeys(namespace: string, clientHash: string, now: Date): [string, string] {
  const day = now.toISOString().slice(0, 10);
  return [
    namespace + ":client:" + clientHash,
    namespace + ":global:" + day,
  ];
}

async function admitChallenge(
  token: string,
  clearance: string,
  address: string,
  config: BrokerConfig,
  redis: RedisEval,
  now: Date
): Promise<Admission> {
  const [challengeHash, clearanceHash, clientHash] = await Promise.all([
    sha256Hex(token),
    hmacHex(config.clearanceHashSecret, clearance),
    hmacHex(config.clientHashSecret, address),
  ]);
  const namespace = config.redisNamespace;
  const [clientKey, globalKey] = admissionKeys(namespace, clientHash, now);
  return parseAdmission(await redis.eval(
    CHALLENGE_ADMISSION_SCRIPT,
    [
      namespace + ":challenge:" + challengeHash,
      clientKey,
      globalKey,
      namespace + ":clearance:" + clearanceHash,
    ],
    [
      config.clientLimit,
      config.clientWindowSeconds,
      config.globalDailyLimit,
      secondsUntilNextUtcDay(now),
      CHALLENGE_TTL_SECONDS,
      config.clearanceTtlSeconds,
    ]
  ));
}

async function admitClearance(
  clearance: string,
  address: string,
  config: BrokerConfig,
  redis: RedisEval,
  now: Date
): Promise<Admission> {
  const [clearanceHash, clientHash] = await Promise.all([
    hmacHex(config.clearanceHashSecret, clearance),
    hmacHex(config.clientHashSecret, address),
  ]);
  const namespace = config.redisNamespace;
  const [clientKey, globalKey] = admissionKeys(namespace, clientHash, now);
  return parseAdmission(await redis.eval(
    CLEARANCE_ADMISSION_SCRIPT,
    [namespace + ":clearance:" + clearanceHash, clientKey, globalKey],
    [
      config.clientLimit,
      config.clientWindowSeconds,
      config.globalDailyLimit,
      secondsUntilNextUtcDay(now),
      config.clearanceTtlSeconds,
    ]
  ));
}

async function admitPreview(
  address: string,
  config: BrokerConfig,
  redis: RedisEval,
  now: Date
): Promise<Admission> {
  const clientHash = await hmacHex(config.clientHashSecret, address);
  const [clientKey, globalKey] = admissionKeys(config.redisNamespace, clientHash, now);
  return parseAdmission(await redis.eval(
    PREVIEW_ADMISSION_SCRIPT,
    [clientKey, globalKey],
    [
      config.clientLimit,
      config.clientWindowSeconds,
      config.globalDailyLimit,
      secondsUntilNextUtcDay(now),
    ]
  ));
}

function limitResponse(admission: Admission, config: BrokerConfig, now: Date): Response {
  if (admission.reason === "replay") {
    return json(409, { error: "challenge already used" });
  }
  const retryAfter = admission.reason === "client"
    ? config.clientWindowSeconds
    : secondsUntilNextUtcDay(now);
  return json(
    429,
    { error: "session capacity reached", code: "session_capacity_reached" },
    { "retry-after": String(retryAfter) }
  );
}

async function mintReactorToken(
  config: BrokerConfig,
  fetchImpl: typeof fetch,
  cookie?: string
): Promise<Response> {
  const headers: HeadersInit = cookie ? { "set-cookie": cookie } : {};
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
    if (!upstream.ok) return json(502, { error: "token mint failed" }, headers);
    const body = await upstream.json() as { jwt?: unknown };
    if (typeof body.jwt !== "string" || !body.jwt) {
      return json(502, { error: "token mint failed" }, headers);
    }
    return json(200, { jwt: body.jwt }, headers);
  } catch {
    return json(502, { error: "token mint failed" }, headers);
  }
}

/**
 * Mint a short-lived Reactor JWT after either a fresh one-time Turnstile
 * exchange or a valid opaque browser clearance passes atomic admission.
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

  const fetchImpl = options.fetchImpl ?? fetch;
  const redis = options.redis ?? new Redis({ url: config.redisUrl, token: config.redisToken });
  const now = options.now?.() ?? new Date();

  if (config.challengeMode === "preview-bypass") {
    let admission: Admission;
    try {
      admission = await admitPreview(address, config, redis, now);
    } catch {
      return json(503, { error: "session service unavailable" });
    }
    if (!admission.allowed) return limitResponse(admission, config, now);
    return mintReactorToken(config, fetchImpl);
  }

  const parsedClearance = parseClearance(request, config);

  if (parsedClearance.kind === "present") {
    let admission: Admission;
    try {
      admission = await admitClearance(parsedClearance.value, address, config, redis, now);
    } catch {
      return json(503, { error: "session service unavailable" });
    }
    if (admission.allowed) {
      return mintReactorToken(
        config,
        fetchImpl,
        clearanceCookie(parsedClearance.value, config)
      );
    }
    if (admission.reason !== "clearance") {
      return limitResponse(admission, config, now);
    }
  }

  const parsedChallenge = await parseChallenge(request);
  const clearInvalidCookie = parsedClearance.kind !== "missing";
  if (parsedChallenge.kind === "missing") {
    return challengeRequired(config, clearInvalidCookie);
  }
  if (parsedChallenge.kind === "malformed") {
    return json(
      400,
      { error: "invalid request" },
      clearInvalidCookie ? { "set-cookie": clearanceCookie("", config, 0) } : {}
    );
  }

  let challengeValid = false;
  try {
    challengeValid = await validateChallenge(
      parsedChallenge.value,
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

  const clearance = (options.randomClearance ?? randomClearance)();
  if (!CLEARANCE_PATTERN.test(clearance)) {
    return json(503, { error: "session service unavailable" });
  }

  let admission: Admission;
  try {
    admission = await admitChallenge(
      parsedChallenge.value,
      clearance,
      address,
      config,
      redis,
      now
    );
  } catch {
    return json(503, { error: "session service unavailable" });
  }
  if (!admission.allowed) {
    return limitResponse(admission, config, now);
  }

  return mintReactorToken(config, fetchImpl, clearanceCookie(clearance, config));
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleSessionRequest(request);
  },
};
