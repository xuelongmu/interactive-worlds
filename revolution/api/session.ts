const REACTOR_TOKENS_URL = "https://api.reactor.inc/tokens";

type SessionBrokerOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

function serverApiKey(): string {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.REACTOR_API_KEY?.trim() ?? "";
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

/** Mint a short-lived Reactor JWT without exposing the project API key. */
export async function handleSessionRequest(
  request: Request,
  options: SessionBrokerOptions = {}
): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" }, { allow: "POST" });
  }

  const apiKey = options.apiKey === undefined ? serverApiKey() : options.apiKey.trim();
  if (!apiKey) {
    return json(500, { error: "REACTOR_API_KEY is not configured" });
  }

  try {
    const upstream = await (options.fetchImpl ?? fetch)(REACTOR_TOKENS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Reactor-API-Key": apiKey,
      },
      body: "{}",
    });
    const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "content-type": contentType,
      },
    });
  } catch {
    return json(502, { error: "token mint failed" });
  }
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleSessionRequest(request);
  },
};
