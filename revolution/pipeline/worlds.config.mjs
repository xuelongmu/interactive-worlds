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
      "A ragged line of colonial militiamen in civilian coats with muskets faces British " +
      "regulars. Follow the Doolittle/Earl plate for site landmarks and broad placement, but " +
      "do not invent an exact measured gap or perfectly opposed formations. Photorealistic, " +
      "historically accurate, no modern objects.",
  },
  {
    scene: "assembly-room",
    worldId: "7fb1b3f0-a623-43a5-8ce0-efa89ef6540f",
    image: "public/reference/assembly-room.jpg",
    prompt:
      "Interior of the Pennsylvania State House assembly room in summer 1776, eye level. " +
      "Georgian colonial architecture based on the NPS evidence-based restoration: tall windows " +
      "with period shades, gray paneled walls, thirteen green baize-covered tables in shallow " +
      "semicircular rows, Windsor chairs, papers, quills and inkwells, the surviving cockleshell " +
      "frieze and Penn crest above a modest platform. No balustrade, invented dais, or post-1776 " +
      "Rising Sun chair. Warm dim light, empty of people, historically accurate, no modern objects.",
  },
  {
    scene: "valley-forge",
    // note: an earlier take (185eea37) generated but never published assets
    worldId: "25fb6684-20ab-4093-a8b3-890ad9729723",
    image: "public/reference/valley-forge.jpg",
    prompt:
      "A Continental Army winter encampment at Valley Forge, December 1777, at dusk. " +
      "Rows of 14-by-16-foot rough log huts with mud chinking in patchy snow, smoke rising from clay-lined chimneys, " +
      "frozen rutted paths, bare black trees, a few campfires, stacked muskets, gray overcast sky " +
      "fading to blue dusk. Patchy winter ground, desolate and quiet. Photorealistic, no modern objects.",
  },
  {
    scene: "griffins-wharf",
    worldId: "25eeccb6-301f-4efb-a332-623863f0d768",
    image: "public/reference/griffins-wharf.jpg",
    prompt:
      "A Boston wharf at night in December 1773, eye level. Wet cobbles and timber decking, " +
      "coiled rope, barrels and crates, three moored 18th century merchant ships with furled " +
      "sails, lanterns in the rigging, a dense crowd of colonists standing still and silent " +
      "along the wharf edge, brick warehouses behind, moonlight on black harbor water. " +
      "Very low light. Photorealistic, historically accurate, no modern objects.",
  },
  {
    scene: "surrender-field",
    worldId: "820bb270-9037-436a-b84f-a97650ab4cb5",
    image: "public/reference/surrender-field.jpg",
    prompt:
      "An open Virginia field in October 1781, early afternoon, eye level. A long dirt road " +
      "between two facing lines of soldiers standing at attention — white-coated French troops " +
      "on one side, worn Continental troops on the other — with British soldiers frozen " +
      "mid-stride between the lines, laying muskets onto a pile. Autumn grass, split-rail " +
      "fences, distant earthworks, smoke haze. Photorealistic, historically accurate, " +
      "no modern objects.",
  },
  {
    scene: "treaty-paris",
    worldId: "2c5ba9e6-abb7-4df1-8843-7c3c521fec4b",
    image: "public/reference/treaty-paris.jpg",
    prompt:
      "Benjamin West's London studio around 1783, eye level. The actual unfinished American " +
      "Commissioners painting anchors the room: five negotiators in varying states of finish " +
      "around a table on the left and the authentic broad unpainted field on the right. Do not " +
      "invent a Paris definitive-treaty signing or a different monumental canvas. Tall north " +
      "window light, pigments, a clock, parquet floor, historically accurate, no modern objects.",
  },
];
