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
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not initialize"));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile failed to load")), { once: true });
    document.head.appendChild(script);
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

/**
 * Add a one-time Turnstile token to production session requests without
 * coupling the renderer to a specific challenge provider.
 */
export function installSessionChallenge(): void {
  const disabledForDeployment = import.meta.env.VITE_SESSION_CHALLENGE_MODE === "disabled";
  if (!import.meta.env.PROD || disabledForDeployment || installed) return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = input instanceof Request ? new URL(input.url) : new URL(String(input), location.href);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (target.origin !== location.origin || target.pathname !== SESSION_PATH || method !== "POST") {
      return nativeFetch(input, init);
    }

    const challengeToken = await oneTimeChallenge();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set("content-type", "application/json");
    return nativeFetch(input, {
      ...init,
      method: "POST",
      headers,
      body: JSON.stringify({ challengeToken }),
    });
  }) as typeof window.fetch;
}
