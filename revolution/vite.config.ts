import { defineConfig, type Plugin } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = __dirname;

/** Read a key from process.env, ./.env, or the parent workspace .env. */
function readEnvValue(name: string): string {
  if (process.env[name]) return process.env[name]!;
  for (const envPath of [resolve(root, ".env"), resolve(root, "..", ".env")]) {
    if (!existsSync(envPath)) continue;
    const match = readFileSync(envPath, "utf8").match(
      new RegExp(`^${name}=(.*)$`, "m")
    );
    if (match) return match[1].trim().replace(/^"(.*)"$|^'(.*)'$/, "$1$2");
  }
  return "";
}

/**
 * Dev token broker: mints short-lived Reactor JWTs so the API key never
 * reaches the client. In production this becomes a serverless function
 * with identical behavior.
 */
function tokenBroker(): Plugin {
  return {
    name: "reactor-token-broker",
    configureServer(server) {
      // Dev-only: accept canvas snapshots for headless visual verification.
      server.middlewares.use("/api/snapshot", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
          const { writeFileSync, mkdirSync } = await import("node:fs");
          mkdirSync(resolve(root, "snapshots"), { recursive: true });
          const file = resolve(root, "snapshots", `snap-${Date.now()}.jpg`);
          writeFileSync(file, Buffer.concat(chunks));
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ file }));
        });
      });
      server.middlewares.use("/api/session", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        const key = readEnvValue("REACTOR_API_KEY");
        res.setHeader("content-type", "application/json; charset=utf-8");
        if (!key) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "REACTOR_API_KEY is not configured" }));
          return;
        }
        try {
          const upstream = await fetch("https://api.reactor.inc/tokens", {
            method: "POST",
            headers: { "Reactor-API-Key": key, "Content-Type": "application/json" },
            body: "{}",
          });
          res.statusCode = upstream.status;
          res.end(await upstream.text());
        } catch (error) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: `token mint failed: ${error}` }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [tokenBroker()],
  server: { port: Number(process.env.PORT ?? 5173), strictPort: !!process.env.PORT },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        "spike-worldmodel": resolve(root, "spikes/worldmodel/index.html"),
        "spike-splat": resolve(root, "spikes/splat/index.html"),
      },
    },
  },
});
