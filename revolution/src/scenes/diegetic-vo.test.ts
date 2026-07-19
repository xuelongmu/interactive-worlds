import { describe, expect, it } from "vitest";
import type { SceneManifest } from "../engine/types";
import teaparty from "./teaparty.json";
import delaware from "./delaware.json";
import trenton from "./trenton.json";
import valleyForge from "./valley-forge.json";
import yorktown from "./yorktown.json";

describe("generated diegetic VO routing", () => {
  it.each([
    [teaparty, "TEA-050", "/assets/audio/vo/TEA-050.bosun.mp3"],
    [delaware, "DEL-020", "/assets/audio/vo/DEL-020.mariner.mp3"],
    [trenton, "TRE-020", "/assets/audio/vo/TRE-020.sergeant.mp3"],
  ] as const)("routes %s / %s", (manifest, id, diegeticVo) => {
    const cue = (manifest as SceneManifest).cues.find((item) => item.id === id);
    expect(cue).toMatchObject({ diegeticVo });
  });

  it("routes every generated Delaware bark into the repeatable pool", () => {
    expect((delaware as SceneManifest).audio.barks).toEqual([
      "/assets/audio/vo/DEL-BARK-1.mp3",
      "/assets/audio/vo/DEL-BARK-2.mp3",
      "/assets/audio/vo/DEL-BARK-3.mp3",
    ]);
  });

  it("positions the frozen Valley Forge drill sequence across the parade ground", () => {
    expect((valleyForge as SceneManifest).audio.barks).toEqual([{
      url: "/assets/audio/vo/VAL-DRILLMASTER.mp3",
      position: [10, 1.7, -42],
      intervalSeconds: [32, 55],
      refDistance: 8,
      maxDistance: 80,
      rolloffFactor: 1.3,
    }]);
  });

  it("plays the frozen Yorktown whisper before waking movement two", () => {
    const cue = (yorktown as SceneManifest).cues.find(({ id }) => id === "YOR-041");
    expect(cue).toMatchObject({
      trigger: { type: "action", name: "phase-advanced:night-assault" },
      vo: "/assets/audio/vo/YOR-041.officer.mp3",
      diegetic: true,
      then: "wake:worldmodel",
    });
    expect((yorktown as SceneManifest).cues.find(({ id }) => id === "YOR-040")?.then)
      .toBeUndefined();
  });
});
