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

test("signing spike observes the authored Delaware handoff", () => {
  const source = readFileSync(new URL("spikes/signing/main.ts", root), "utf8");
  assert.match(source, /after:\s*async \(cue\)/);
  assert.match(source, /cue\.then !== "scene:delaware"/);
  assert.match(source, /new Director\(/);
  assert.match(source, /await next\.start\("delaware"\)/);
});

test("Declaration uses only the approved canonical desk rewrite", () => {
  const source = readFileSync(new URL("./renderers/declaration-signing.ts", import.meta.url), "utf8");
  assert.match(source, /tripo-p0\/writing-desk\/20260723T170548-0700-cleaned-v1/);
  assert.match(source, /OPTIONAL_MODEL_ROOT = "\/assets\/models"/);
  assert.doesNotMatch(source, /tripo-p0\/(?:quill|inkwell|parchment)\//);
});

test("Declaration signing surface uses the authoritative reference texture", () => {
  const source = readFileSync(new URL("./renderers/declaration-signing.ts", import.meta.url), "utf8");
  const provenance = JSON.parse(readFileSync(new URL("../public/reference/declaration-provenance.json", import.meta.url), "utf8"));
  assert.match(source, /reference\.src = "\/reference\/declaration\.jpg"/);
  assert.equal(provenance.credit, "U.S. National Archives; public domain, no permission required");
  assert.equal(provenance.derived.dimensions, "1313x1600");
  assert.equal(provenance.derived.sha256, "29FE8C8DED7E7794FB59D12455DF3065B1D21550A0ED716CBBA4DE7BB13F2AEB");
});
