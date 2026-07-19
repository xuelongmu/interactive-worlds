const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SESSION_PATH = "/api/session";

type TurnstileApi = {
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: "dark";
    appearance: "interaction-only";
    callback: (token: string) => void;
    "error-callback": () => void;
    "expired-callback": () => void;
  }): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;
let installed = false;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  const script = document.createElement("script");
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not initialize"));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile failed to load")), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    script.remove();
    throw error;
  });
  return scriptPromise;
}

async function oneTimeChallenge(): Promise<string> {
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  if (!sitekey) throw new Error("Live sessions are not configured for this deployment");
  const turnstile = await loadTurnstile();

  return new Promise<string>((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Verify live session");
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:10000", "display:grid",
      "place-items:center", "background:rgba(0,0,0,.78)", "color:#eee",
      "font:16px Georgia,serif",
    ].join(";");
    const panel = document.createElement("div");
    panel.style.cssText = "padding:24px;background:#191714;border:1px solid #6f6658;text-align:center;max-width:360px";
    const label = document.createElement("p");
    label.textContent = "Verify once to begin the live scene.";
    const widget = document.createElement("div");
    panel.append(label, widget);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    let widgetId = "";
    let settled = false;
    const timer = window.setTimeout(() => finish(new Error("Verification timed out")), 300_000);
    const finish = (error?: Error, token?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (widgetId) {
        try { turnstile.remove(widgetId); } catch { /* widget already removed */ }
      }
      overlay.remove();
      if (error) reject(error);
      else resolve(token!);
    };

    try {
      widgetId = turnstile.render(widget, {
        sitekey,
        action: "session",
        theme: "dark",
        appearance: "interaction-only",
        callback: (token) => finish(undefined, token),
        "error-callback": () => finish(new Error("Verification failed")),
        "expired-callback": () => finish(new Error("Verification expired")),
      });
      if (settled && widgetId) turnstile.remove(widgetId);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Verification failed"));
    }
  });
}

function isChallengeRequired(response: Response): boolean {
  return response.status === 428 &&
    response.headers.get("x-session-challenge") === "turnstile";
}

/**
 * Request a session normally. Only an explicit broker challenge response opens
 * Turnstile; concurrent callers share that one widget/token exchange. The
 * exchange owner receives its JWT, while waiters retry after the HttpOnly
 * clearance cookie has been stored and receive independently admitted JWTs.
 */
export function createSessionChallengeFetch(
  nativeFetch: typeof fetch,
  getChallengeToken: () => Promise<string>,
  origin: string
): typeof fetch {
  let challengeFlight: Promise<Response> | null = null;
  let clearanceGeneration = 0;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = input instanceof Request ? new URL(input.url) : new URL(String(input), origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (target.origin !== origin || target.pathname !== SESSION_PATH || method !== "POST") {
      return nativeFetch(input, init);
    }

    const generationAtStart = clearanceGeneration;
    const retryInput = input instanceof Request ? input.clone() : input;
    const response = await nativeFetch(input, init);
    if (!isChallengeRequired(response)) return response;

    // A concurrent exchange completed after this request was sent. Its cookie
    // is already in the browser jar, so retry without opening another widget.
    if (generationAtStart !== clearanceGeneration) {
      return nativeFetch(retryInput, init);
    }

    const existingFlight = challengeFlight;
    if (existingFlight) {
      const exchange = await existingFlight;
      if (!exchange.ok) return exchange.clone();
      return nativeFetch(retryInput, init);
    }

    const exchangeTarget = input instanceof Request ? input.url : input;
    const flight = (async () => {
      const challengeToken = await getChallengeToken();
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
      headers.set("content-type", "application/json");
      return nativeFetch(exchangeTarget, {
        ...init,
        method: "POST",
        headers,
        body: JSON.stringify({ challengeToken }),
        credentials: "same-origin",
      });
    })();
    challengeFlight = flight;

    try {
      const exchange = await flight;
      if (exchange.ok) clearanceGeneration += 1;
      return exchange;
    } finally {
      if (challengeFlight === flight) challengeFlight = null;
    }
  }) as typeof fetch;
}

/**
 * Install the production-only session challenge adapter. Local Vite
 * development keeps its explicit loopback broker behavior.
 */
export function installSessionChallenge(): void {
  if (!import.meta.env.PROD || installed) return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = createSessionChallengeFetch(
    nativeFetch,
    oneTimeChallenge,
    location.origin
  ) as typeof window.fetch;
}
