import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("Declaration signing spike is a production Vite input", () => {
  const viteConfig = readFileSync(new URL("vite.config.ts", root), "utf8");
  const entry = readFileSync(new URL("spikes/signing/index.html", root), "utf8");
  assert.match(viteConfig, /"spike-signing": resolve\(root, "spikes\/signing\/index\.html"\)/);
  assert.match(entry, /<title>Declaration signing spike<\/title>/);
  assert.match(entry, /src="\/spikes\/signing\/main\.ts"/);

  // When run after `vite build`, verify the actual emitted route rather than
  // relying on a dev-server fallback. The static input assertions above keep
  // this regression deterministic in a clean checkout before dist exists.
  const emitted = new URL("../dist/spikes/signing/index.html", import.meta.url);
  if (existsSync(emitted)) {
    const html = readFileSync(emitted, "utf8");
    assert.match(html, /Declaration signing spike/);
    assert.match(html, /spike-signing-[A-Za-z0-9_-]+\.js/);
  }
});
