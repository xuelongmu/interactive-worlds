import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mechanics walkthrough route is development-only and labels simulated evidence", () => {
  const entry = readFileSync(new URL("../spikes/mechanics/entry.ts", import.meta.url), "utf8");
  const walkthrough = readFileSync(new URL("../spikes/mechanics/walkthrough.ts", import.meta.url), "utf8");
  const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

  assert.match(entry, /if \(!import\.meta\.env\.DEV\)/);
  assert.match(walkthrough, /NO LIVE ACCEPTANCE CLAIM/);
  assert.match(walkthrough, /DEV \/ SIMULATED/);
  assert.match(viteConfig, /"spike-mechanics": resolve\(root, "spikes\/mechanics\/index\.html"\)/);
});
