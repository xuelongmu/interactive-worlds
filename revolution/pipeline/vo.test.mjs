import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, ["pipeline/vo.mjs", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {},
  });
}

test("dry-run still parses the complete cast", () => {
  const result = run("--dry-run");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /parsed 76 spoken lines/);
  assert.match(
    result.stdout,
    /NARRATOR 63, BOSUN 1, MARINER 4, SERGEANT 1, DRILLMASTER 5, OFFICER 2/
  );
  assert.doesNotMatch(result.stdout + result.stderr, /unknown speaker/);
});

test("--only selects one exact spoken line without credentials", () => {
  const result = run("--dry-run", "--only", "TEA-050.bosun");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /selected TEA-050\.bosun \(BOSUN 1\)/);
  assert.match(result.stdout, /TEA-050\.bosun\s+BOSUN/);
  assert.doesNotMatch(result.stdout, /TEA-010/);
  assert.doesNotMatch(result.stdout + result.stderr, /ELEVENLABS_API_KEY/);
});

test("--only rejects an unknown line before credential resolution", () => {
  const result = run("--only", "TEA-999.bosun");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /spoken line id not found: TEA-999\.bosun/);
  assert.doesNotMatch(result.stdout + result.stderr, /ELEVENLABS_API_KEY/);
});

test("a bare line id is rejected instead of starting a full paid run", () => {
  const result = run("TEA-050.bosun");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown argument\(s\): TEA-050\.bosun/);
  assert.doesNotMatch(result.stdout + result.stderr, /ELEVENLABS_API_KEY/);
});

test("round-two frozen lines have stable distinct ids without credentials", () => {
  for (const id of ["VAL-BARK-5", "YOR-041.officer", "YOR-041.officer-2"]) {
    const result = run("--dry-run", "--only", id);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`selected ${id.replaceAll(".", "\\.")}`));
    assert.doesNotMatch(result.stdout + result.stderr, /ELEVENLABS_API_KEY/);
  }
});
