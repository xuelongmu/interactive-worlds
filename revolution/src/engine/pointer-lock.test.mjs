import assert from "node:assert/strict";
import test from "node:test";
import { bindPointerLockClick } from "./pointer-lock.ts";

test("pointer-lock click binding is removable during splat teardown", () => {
  class FakeTarget extends EventTarget {
    requests = 0;
    requestPointerLock() { this.requests++; }
  }
  const target = new FakeTarget();
  const pointerDocument = { pointerLockElement: null };
  const unbind = bindPointerLockClick(target, pointerDocument);

  target.dispatchEvent(new Event("click"));
  assert.equal(target.requests, 1);
  unbind();
  target.dispatchEvent(new Event("click"));
  assert.equal(target.requests, 1);
});
