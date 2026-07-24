/** Marble world prompts per scene. Curatorial by design: run, inspect in the
 *  Marble viewer, re-roll or refine the prompt, and commit the world id you
 *  like into `worldId`, with the printed `worldSignature`, so re-runs download
 *  instead of regenerate until the generation inputs change. */
export const worlds = [
  {
    scene: "lexington",
    // Source-conditioned take curated from the Doolittle/Earl-grounded frame.
    worldId: "5c74350b-8ff6-4470-8fa0-bdacead34305",
    worldSignature: "3424bfec9257f7b34340e7700cef87f39f44205c",
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
    // Prompt corrected after this scene's previous take; generate and curate a new pin.
    worldId: null,
    worldSignature: null,
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
    worldId: null,
    worldSignature: null,
    image: "public/reference/valley-forge.jpg",
    prompt:
      "A Continental Army winter encampment at Valley Forge, December 1777, at dusk. " +
      "Rows of 14-by-16-foot rough log huts with mud chinking in patchy snow, smoke rising from clay-lined chimneys, " +
      "frozen rutted paths, bare black trees, a few campfires, stacked muskets, gray overcast sky " +
      "fading to blue dusk. Patchy winter ground, desolate and quiet. Photorealistic, no modern objects.",
  },
  {
    scene: "griffins-wharf",
    // Source-conditioned frame corrected after the previous take.
    worldId: null,
    worldSignature: null,
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
    // Source-conditioned frame corrected after the previous take.
    worldId: null,
    worldSignature: null,
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
    worldId: "ee35087c-9525-495c-a2f8-aeb897351be7",
    worldSignature: "7a50b66aeadd34cf7ebdc7c9c061b2568c343498",
    // Benjamin West's unfinished 1783 painting, frozen from the public-domain
    // Wikimedia Commons original supplied for this project.
    image: "public/reference/treaty-paris-benjamin-west.jpg",
    imageSignature: "sha256:3962707d38bae29977f39724c586533e613958e8ea82ff7c937c7cad777c05a8",
    prompt:
      "Transform the supplied authentic Benjamin West painting into a restrained, walkable 3D " +
      "tableau while preserving the original composition and painterly appearance. Keep the five " +
      "American commissioners grouped on the left and the unfinished pale expanse unmistakably " +
      "blank on the right. Extend a shallow period interior and floor into the foreground for a " +
      "first-person approach. Do not add British commissioners, complete the unfinished area, " +
      "modernize the scene, or add text.",
  },
];
