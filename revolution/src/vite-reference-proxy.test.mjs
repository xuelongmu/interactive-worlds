import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  REFERENCE_R2_ORIGIN,
  rewriteReferenceRequest,
  shouldProxyReferenceRequest,
} from "../vite-reference-proxy.ts";

test("reference requests map to the pinned production R2 release", () => {
  assert.equal(REFERENCE_R2_ORIGIN, "https://pub-e2af4157669b48a9af62795ac31c5a34.r2.dev");
  assert.equal(
    rewriteReferenceRequest("/reference/delaware.jpg"),
    "/releases/c7e99fc4e6c6-assets-3f5622023858/reference/delaware.jpg",
  );
  assert.equal(
    rewriteReferenceRequest("/reference/chapter/frame%20one.jpg?revision=2"),
    "/releases/c7e99fc4e6c6-assets-3f5622023858/reference/chapter/frame%20one.jpg?revision=2",
  );
});

test("reference proxy destination stays aligned with the Vercel rewrite", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const productionRewrite = vercel.rewrites.find(({ source }) => source === "/reference/:path*");
  assert.ok(productionRewrite);
  assert.equal(
    `${REFERENCE_R2_ORIGIN}${rewriteReferenceRequest("/reference/delaware.jpg")}`,
    productionRewrite.destination.replace(":path*", "delaware.jpg"),
  );
});

test("only safe GET and HEAD reference requests reach the proxy", () => {
  assert.equal(shouldProxyReferenceRequest("GET", "/reference/delaware.jpg"), true);
  assert.equal(shouldProxyReferenceRequest("HEAD", "/reference/delaware.jpg"), true);
  assert.equal(shouldProxyReferenceRequest("POST", "/reference/delaware.jpg"), false);
  assert.equal(shouldProxyReferenceRequest("GET", "/references/delaware.jpg"), false);
  assert.equal(shouldProxyReferenceRequest("GET", "/reference/"), false);
  assert.equal(shouldProxyReferenceRequest("GET", "/reference//delaware.jpg"), false);
});

test("reference proxy rejects traversal and encoded separators", () => {
  for (const url of [
    "/reference/../secret",
    "/reference/%2e%2e/secret",
    "/reference/%252e%252e/secret",
    "/reference/chapter%2fsecret.jpg",
    "/reference/chapter%5csecret.jpg",
    "/reference/%00secret.jpg",
    "/reference/bad%encoding.jpg",
  ]) {
    assert.equal(shouldProxyReferenceRequest("GET", url), false, url);
    assert.throws(() => rewriteReferenceRequest(url), /reference asset path|unsafe/);
  }
});
