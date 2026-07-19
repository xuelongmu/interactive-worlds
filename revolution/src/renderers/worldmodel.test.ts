import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldModelSession } from "./worldmodel";

function sessionWith(setPrompt: () => Promise<void>, onEvent: ReturnType<typeof vi.fn>) {
  // Avoid opening a paid/live SDK session: steer only depends on these two
  // private collaborators, so install test doubles on a prototype instance.
  const session = Object.create(WorldModelSession.prototype) as any;
  session.model = { setPrompt };
  session.opts = { onEvent };
  return session as WorldModelSession;
}

describe("WorldModelSession scripted steering", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits the cue beat after a successful prompt change", async () => {
    const onEvent = vi.fn();
    const session = sessionWith(vi.fn().mockResolvedValue(undefined), onEvent);

    await session.steer("storm", "intensify the storm");

    expect(onEvent).toHaveBeenCalledWith({ type: "model-event", name: "storm" });
  });

  it("still emits the cue beat when the prompt change fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onEvent = vi.fn();
    const session = sessionWith(
      vi.fn().mockRejectedValue(new Error("transient command failure")),
      onEvent
    );

    await session.steer("landing", "reach the riverbank");

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({ type: "model-event", name: "landing" });
  });
});
