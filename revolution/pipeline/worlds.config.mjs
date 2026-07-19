/** Marble world prompts per scene. Curatorial by design: run, inspect in the
 *  Marble viewer, re-roll or refine the prompt, and commit the world id you
 *  like into `worldId` so re-runs download instead of regenerate. */
export const worlds = [
  {
    scene: "lexington",
    worldId: "dc292531-9d06-4f95-851c-0ebc32a3c73b",
    // GPT Image 2 starting frame (pipeline/frames.mjs) — uploaded as the
    // image prompt; the text prompt rides along as guidance.
    image: "public/reference/lexington.jpg",
    prompt:
      "A wide New England village green at dawn in mid-April 1775, seen from eye level. " +
      "Dew on rough spring grass, dirt road crossing the green, low stone walls, " +
      "a white meetinghouse and scattered colonial clapboard houses at the edges, bare elm trees. " +
      "Cold golden sunrise light, long shadows, thin ground mist. " +
      "Two opposing lines of soldiers stand frozen sixty yards apart: one ragged line of " +
      "colonial militiamen in civilian coats with muskets, facing a longer disciplined line of " +
      "British redcoat regulars. Photorealistic, historically accurate, no modern objects.",
  },
  {
    scene: "assembly-room",
    worldId: null,
    image: "public/reference/assembly-room.jpg",
    prompt:
      "Interior of the Pennsylvania State House assembly room in summer 1776, eye level. " +
      "Georgian colonial architecture, tall shuttered windows with thin light leaking through, " +
      "gray paneled walls, rows of Windsor chairs and green baize-covered tables with papers, " +
      "quills and inkwells, a raised speaker's chair at the far end. Warm dim interior light, " +
      "dust in the air. Empty of people. Photorealistic, historically accurate, no modern objects.",
  },
  {
    scene: "valley-forge",
    worldId: null,
    image: "public/reference/valley-forge.jpg",
    prompt:
      "A Continental Army winter encampment at Valley Forge, December 1777, at dusk. " +
      "Rows of small rough log huts with mud chinking in snow, smoke rising from clay chimneys, " +
      "frozen rutted paths, bare black trees, a few campfires, stacked muskets, gray overcast sky " +
      "fading to blue dusk. Deep snow, desolate and quiet. Photorealistic, no modern objects.",
  },
];
