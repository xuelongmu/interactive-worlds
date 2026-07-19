import assert from "node:assert/strict";
import { test } from "node:test";
import { frames } from "./frames.mjs";
import { visualSources } from "./visual-sources.mjs";

const expectedFrames = frames.map((frame) => frame.file);

test("every generated frame has committed visual provenance", () => {
  assert.deepEqual(Object.keys(visualSources).sort(), expectedFrames.sort());
  for (const [file, sources] of Object.entries(visualSources)) {
    assert.ok(sources.length > 0, `${file} needs a source`);
    for (const source of sources) {
      assert.match(source.pageUrl, /^https:\/\//);
      assert.match(source.imageUrl, /^https:\/\//);
      assert.ok(source.rights && source.use, `${file} needs rights and use limits`);
    }
  }
});

test("highest-risk frames use the intended institutional evidence", () => {
  assert.match(visualSources["assembly-room.jpg"][0].pageUrl, /nps\.gov/);
  assert.match(visualSources["lexington.jpg"][0].creator, /Doolittle/);
  assert.match(visualSources["delaware.jpg"][0].use, /reject.*small boat/i);
  assert.match(visualSources["yorktown-redoubt.jpg"][0].use, /earthen-and-log/);
  assert.match(visualSources["treaty-paris.jpg"][0].use, /preliminary negotiations/);
});
