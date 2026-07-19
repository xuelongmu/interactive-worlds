# Narration Scripts

Interactive story of the American Revolution. Nine scenes, linear order:

- **Scene 1 — The Tea Party** (prologue) · Witness → Participant (`TEA`)
- **Scene 2 — Lexington Green** · Witness (World Labs frozen splat) (`LEX`)
- **Scene 3 — The Declaration** · Actor (Three.js + Tripo signing) (`DEC`)
- **Scene 4 — Crossing the Delaware** · Participant (world model) (`DEL`)
- **Scene 5 — Trenton** · Participant, short (`TRE`)
- **Scene 6 — Saratoga** · Actor + Participant burst (`SAR`)
- **Scene 7 — Valley Forge** · Witness, the still point (`VAL`)
- **Scene 8 — Yorktown** · all three registers (`YOR`)
- **Scene 9 — The Treaty of Paris** · Witness → Actor (`PAR`)

## Conventions

- Every line is a **cue** with an ID (`LEX-010`) and a **trigger** (zone entry,
  player action, world-model event, or timer). Narration is trigger-driven, never
  a linear VO track.
- Lines are short and modular so they survive interruption. Diegetic events queue
  behind narrator lines (never interrupt mid-sentence); narrator ducks -6dB under
  diegetic events.
- Tone: earnest, plain, documentary. No first person, no direct address to the
  viewer, no meta-commentary. Present tense inside a scene; past tense for
  aftermath and consequence.
- Interaction instructions belong to diegetic voices (a mariner, an officer),
  never the narrator.

## Cast (ElevenLabs)

| Voice | Who | Direction |
|---|---|---|
| NARRATOR | Unnamed documentary narrator | Warm, measured, restrained. Stability ~0.50, slow pace. Never performs emotion; states facts and lets them land. |
| DIEGETIC | Mariners, soldiers, officers | One voice each, spatialized in-scene |

---

# SCENE 1 — THE TEA PARTY (PROLOGUE)
**Register: Witness → Participant · Griffin's Wharf splat, frozen crowd at night; boarding the Dartmouth wakes the frozen world into a live world model. The viewer breaks open a tea chest with their own hands.**

Sound bed: harbor at night — halyards against masts, water on pilings, a crowd
of thousands standing nearly silent, one far-off church bell. The silence is the
point; keep the bed sparse.

**TEA-010 — fade-in on the frozen wharf**
> NARRATOR: December 16th, 1773. Griffin's Wharf, Boston. Three merchant ships ride at their moorings, loaded with tea belonging to the East India Company. On the wharf, in the dark, several thousand people stand watching. Almost no one speaks.

**TEA-020 — player enters crowd zone**
> NARRATOR: They have come from a meeting at the Old South Church — the largest gathering Boston has ever seen. For weeks the town has refused to let this tea be landed, because landing it means paying the King's tax on it. Tonight the last legal deadline runs out.

**TEA-030 — player dwells facing the ships, 2s**
> NARRATOR: Dartmouth. Eleanor. Beaver. Three hundred and forty-two chests between them — about ninety thousand pounds of tea. The governor has refused to let the ships leave. The town has refused to let them unload. Something has to give.

**TEA-040 — player reaches the gangway. The frozen world wakes.**
> NARRATOR: Around six-thirty, men began arriving at the wharf in loose disguise — blankets, soot, feathers, faces darkened. It was a statement: tonight we are not the King's subjects. [beat] They went aboard in silence.

**TEA-050 — control granted on deck**
> BOSUN (diegetic): Hoist the chests up from the hold. Break them open at the rail — the tea goes over the side.
> NARRATOR: They worked in teams, one ship to a team, with block and tackle and hatchets. It took about three hours.

**TEA-060 — player breaks open a chest (world-model event)**
> NARRATOR: The tea was worth more than nine thousand pounds sterling — a fortune. It went into the harbor a chest at a time, and the crowd on the wharf watched it go, still nearly silent. The tide was out. By the end, tea lay heaped on the mudflats like hay.

**TEA-070 — chests-done event, or timer failsafe**
> NARRATOR: Nothing else was touched. No one was hurt, nothing was stolen, and a padlock they broke was replaced the next day. The men swept the decks before they left. It was, witnesses said, the quietest destruction they had ever seen.

**TEA-080 — deck clears; fade toward black. Final beat; cut on the last word.**
> NARRATOR: Parliament's answer came in the spring. Boston's port was closed, its charter gutted, its government handed to the army. The other colonies were expected to take the lesson. Instead they began raising militias. [beat] Sixteen months later, the war began on a village green west of Boston.

---

# SCENE 2 — LEXINGTON GREEN
**Register: Witness · World Labs splat, frozen at the instant before the first shot**

Sound bed: dawn birdsong, wind in April grass, a dog barking far off, a distant
drum. The bed is alive; the world is frozen.

**LEX-010 — fade-in on frozen green**
> NARRATOR: April 19th, 1775. Lexington, Massachusetts, just after sunrise. Seventy-seven militiamen stand on the green. Seven hundred British regulars are coming up the road.

**LEX-020 — player enters militia-line zone**
> NARRATOR: Farmers, mostly. Neighbors and family — fathers and sons in the same line. Most have been awake since midnight, when the alarm riders came through.

**LEX-021 — player faces Capt. Parker, 2s dwell**
> NARRATOR: Their captain, John Parker. A veteran of the French and Indian War, dying of tuberculosis. His orders: stand your ground. Don't fire unless fired upon.

**LEX-030 — player enters British-line zone**
> NARRATOR: British light infantry. They have marched seventeen miles through the night, wet to the waist from a river crossing. Their objective is the militia's powder and weapons, stored at Concord. No one intends a battle here.

**LEX-040 — player enters the gap between the lines**
> NARRATOR: Sixty yards separate the two lines. Major Pitcairn rides forward and orders the militia to disperse. Parker, badly outnumbered, tells his men to fall back.

**LEX-060 — player crosses trigger line, or 4-min timer. Controls lock.**
> NARRATOR: Then — a single shot. No one knows who fired it. No one ever will.

**LEX-070 — world-model cutscene: the volley.**
No narration. Sound only — the shot, the volley, screaming, drums, smoke.
20–30 seconds. Do not score it.

**LEX-080 — fade up on aftermath splat, +4s silence first**
> NARRATOR: The British fired two volleys and charged. It was over in minutes. Eight militiamen killed, ten wounded. Jonathan Harrington, shot on the green, crawled to his own doorstep and died there.

**LEX-090 — player begins walking the aftermath**
> NARRATOR: The regulars marched on to Concord. By afternoon, thousands of militiamen were converging on the road back to Boston. The war had begun.

---

# SCENE 3 — THE DECLARATION
**Register: Actor · Assembly Room splat → Three.js close scene (Tripo quill, inkwell, parchment). The player signs their real name; the signature persists to the Treaty of Paris finale.**

Sound bed: shuttered room, muffled street noise, flies, a chair creak, a single
scratching quill somewhere.

**DEC-010 — fade-in on Assembly Room splat**
> NARRATOR: Philadelphia. The Pennsylvania State House, summer of 1776. The windows are shuttered, creating secrecy in a city full of informers.

**DEC-011 — player approaches the table; transition to Three.js scene**
> NARRATOR: On July 2nd, Congress voted for independence. The formal signing came weeks later, the delegates coming to the table one at a time.

**DEC-030 — player picks up the quill**
> NARRATOR: The document closes with a pledge: their lives, their fortunes, and their honor. A signature below those words was treason, and the penalty for treason was death.

**DEC-060 — signature stroke complete.**
Hold silence while the ink dries and darkens. No line.

**DEC-061 — +8s after signing**
> NARRATOR: Fifty-six men signed. The youngest was twenty-six. The oldest, Franklin, was seventy. Merchants, farmers, lawyers, a printer.

**DEC-070 — player sets down quill / exit interaction**
> NARRATOR: The names were kept secret for six months. No signer was ever tried in court, but many paid all the same — homes burned, fortunes lost, sons killed in the war they had voted for.

**Persistence note:** capture the signature render here — it returns, aged, in the
Treaty of Paris finale. The payoff is wordless.

---

# SCENE 4 — CROSSING THE DELAWARE
**Register: Participant · world model. Player poles a Durham boat through ice at night. Narration sparse; sound design carries the scene.**

Sound bed: wind building to sleet, ice grinding on ice, oarlocks, hull strikes,
horses stamping in boats, no voices above a mutter.

**DEL-010 — open on the Leutze painting, full frame**
> NARRATOR: Emanuel Leutze painted the crossing seventy-five years later: Washington at the prow, the flag, morning light on the water. [painting dissolves to black water and sleet] The crossing itself was made in darkness, in a storm.

**DEL-011 — dissolve complete, player not yet in control**
> NARRATOR: Christmas night, 1776. The revolution is collapsing. New York is lost. The army has retreated across New Jersey, and in six days most enlistments expire. Washington plans one counterstroke: cross the river at night, and take the Hessian garrison at Trenton by surprise.

**DEL-012 — player takes position in boat**
> NARRATOR: The password that night was "Victory or death."

**DEL-020 — control handed over**
> MARINER (diegetic): Pole off the bow! Push the ice clear — don't fight the current!
> NARRATOR: The boats are crewed by fishermen from Marblehead, Massachusetts — Glover's regiment. Before morning they will carry twenty-four hundred men, eighteen cannon, and the horses across a river running with ice.

**Event barks — diegetic, repeatable pool:**
> MARINER: "Ice! Larboard bow!"
> MARINER: "Fend off — fend off!"
> MARINER: "Sit still. Deep enough to drown."

**DEL-031 — Knox event: a huge voice carries over the water**
> NARRATOR: The voice carrying over the water is Colonel Henry Knox, directing the crossing.

**DEL-032 — storm intensifies (world-model event)**
> NARRATOR: Around eleven, a nor'easter came up the river — rain, sleet, and snow together. The storm slowed the crossing by three hours. It also hid it.

**DEL-040 — hull grounds on the Jersey shore**
> NARRATOR: The last boats landed at three in the morning. Trenton lay nine miles away. The army marched through the storm to reach it. Two soldiers froze to death on the road.

**DEL-041 — column forms up. Final beat; cut to black on the last word.**
> NARRATOR: Near dawn came word that the storm had soaked the muskets. Most of the army could not fire a shot. Washington's answer passed back down the column, man to man: use the bayonet. He was resolved to take Trenton.

---

# SCENE 5 — TRENTON
**Register: Participant, short by design · world model. The payoff of the crossing: the viewer is in the column as it comes down King Street in the sleet.**

Sound bed: driving sleet on ice, boots and gun-carriage wheels on frozen ruts,
wind between houses. Then cannon, close. No music until the last cue.

**TRE-010 — fade-in on the column, first light**
> NARRATOR: Eight in the morning, December 26th. Trenton. The garrison is fifteen hundred Hessians — German professional soldiers, the best infantry money can buy. The storm that nearly killed the army on the road is now its cover. The sentries can see perhaps fifty yards.

**TRE-020 — control granted in the moving column**
> SERGEANT (diegetic): Close up! Close on the man ahead — when the guns open, you run at the smoke!
> NARRATOR: Washington has split the army into two columns, closing on the town from north and river. The plan requires both to arrive together, in a storm, after a night without sleep. Somehow, they do.

**TRE-031 — guns-open event: American artillery fires down the streets**
> NARRATOR: Henry Knox's cannon — the guns the army dragged across the river all night — open fire straight down King and Queen Streets. The Hessians form up in the open, in the sleet, and the streets themselves become gun barrels.

**TRE-032 — charge event: the rush into the town**
> NARRATOR: The Hessian commander, Colonel Rall, had been warned for days that the Americans might come. The warnings went unread. Now his regiments are fighting in a storm at point-blank range, in a town that has already filled with American infantry.

**TRE-040 — surrender event: the field falls quiet**
> NARRATOR: It lasted about ninety minutes. Twenty-two Hessians were killed — Colonel Rall among them — and nearly nine hundred captured. The Americans lost not one man in the fighting. [beat] The ragtag militia army had just destroyed a garrison of professionals.

**TRE-050 — final beat. Cut on the last word.**
> NARRATOR: A week later, most of the men whose enlistments expired stayed. Washington offered ten dollars and asked them, regiment by regiment, to step forward. After a silence, they did. The revolution would go on.

---

# SCENE 6 — SARATOGA
**Register: Actor + Participant burst · A war-room sand table of Bemis Heights. The viewer places the American units to understand the ground, advances through the two battles, then rides Arnold's charge as a world-model burst. See spikes/sandtable.**

Sound bed: a command tent — canvas snapping softly, a sputtering lantern,
distant axes and drums. During the charge burst: full battle, close.

**SAR-010 — fade-in on the sand table**
> NARRATOR: Autumn, 1777. The war is two years old, and Britain has a plan to end it: General Burgoyne brings eight thousand men south from Canada, down the Hudson. If he reaches Albany, New England is cut off from the other colonies, and the revolution is divided in half.

**SAR-020 — viewer picks up the first unit block**
> NARRATOR: The table shows the ground that stops him. Bemis Heights — a bluff above the only road south, fortified by a young Polish engineer named Kosciuszko. The American army waits here: twelve thousand men, and more arriving every day.

**SAR-021 — first unit placed on the heights**
> NARRATOR: Burgoyne cannot go around. The river is on one side, deep forest on the other. To reach Albany he must come through this position — or break it.

**SAR-030 — phase advance: September 19th, Freeman's Farm**
> NARRATOR: September 19th. Burgoyne attacks through the woods at a clearing called Freeman's Farm. Benedict Arnold — Washington's most aggressive field general — throws regiments into the clearing as fast as they can march. The British hold the field at dusk. It costs them six hundred men.

**SAR-040 — phase advance: October 7th, Bemis Heights**
> NARRATOR: October 7th. Burgoyne's supplies are failing; winter is coming; no help is coming up the Hudson. He attacks again. [beat] Arnold has been relieved of command after quarreling with his commanding general. He hears the guns anyway.

**SAR-050 — the charge: sand table wakes into the world model burst**
> NARRATOR: Arnold rides onto the field without orders, and the army follows him.

**SAR-060 — redoubt-taken event: the burst peaks**
> NARRATOR: He leads the assault that takes the key redoubt in the British line, and goes down with a musket ball through the leg that made him a hero.

**SAR-070 — return to the table: the blocks re-form as the surrender. Final beat.**
> NARRATOR: Ten days later, surrounded and starving, Burgoyne surrendered his entire army — nearly six thousand men. [beat] When the news reached Paris, France declared for the revolution: money, an army, and a fleet. Saratoga inspired a much-needed ally.

---

# SCENE 7 — VALLEY FORGE
**Register: Witness, the still point · A frozen splat of the winter encampment at dusk. Forced slow walk, no objectives, no interactions. The scene asks only that the viewer keep walking. Lowest interactivity in the story, by design.**

Sound bed: wind over snow, a loose hut door knocking, one axe far away, coughing
from inside the huts — quiet, constant, everywhere. No music.

**VAL-010 — fade-in on the hut lines at dusk**
> NARRATOR: Valley Forge, Pennsylvania. Two days before Christmas, 1777. The British army is warm in Philadelphia, eighteen miles away. Washington's army — what remains of it — is here.

**VAL-020 — player passes the first hut line**
> NARRATOR: Twelve thousand men built this city in weeks: nearly two thousand log huts, fourteen feet by sixteen, twelve men to a hut. They built it here because there was nowhere else to go.

**VAL-030 — dwell near a hut, 3s**
> NARRATOR: The army starves because the systems to move food have collapsed. Some nights the camp's whole ration is firecake — flour and water scorched on a stone. In the dark, the huts chant it like a taunt: no meat. No meat.

**VAL-040 — player reaches the parade ground**
> NARRATOR: A quarter of the army will die here — not in battle, but of typhus, dysentery, and exposure. Two thousand men. [beat] Desertion runs rampant. And yet the army holds together, all winter.

**VAL-050 — dwell on the parade ground, 4s**
> NARRATOR: In February a Prussian officer arrived — Baron von Steuben, lately of Frederick the Great's staff. He spoke no English. He drilled them anyway, a hundred men at a time, swearing in three languages. By spring, the survivors could maneuver like professionals.

**VAL-060 — player reaches the far edge of camp. Final beat; hold the dusk.**
> NARRATOR: The army marched out of Valley Forge in June, into a war it would not lose. No battle was fought here; nothing was decided. The army survived the winter, and the revolution survived with it.

---

# SCENE 8 — YORKTOWN
**Register: all three · The siege table (Actor) shows the trap closing; the night assault on Redoubt 10 is a world-model burst (Participant); the surrender field is a frozen splat the viewer walks (Witness).**

Sound bed, table: the command tent again — older now, papers, rain on canvas.
Burst: night assault — whispers, then bayonets, no muskets. Surrender field:
one drum, boots on a road, and wind.

**YOR-010 — fade-in on the siege table**
> NARRATOR: October, 1781. The war is six years old and has no end in sight — except here. General Cornwallis has fortified Yorktown, Virginia, on a river mouth, waiting for the Royal Navy to carry his army back to safety.

**YOR-020 — viewer places the French fleet at the bay mouth**
> NARRATOR: The navy that arrives is French. Admiral de Grasse turns the British rescue fleet away at the Chesapeake and seals the bay. Cornwallis is trapped.

**YOR-021 — viewer places the allied armies**
> NARRATOR: Washington and the French general Rochambeau march their armies four hundred miles south in secret, and close the landward side. Sixteen thousand allied troops, while Cornwallis has only eight.

**YOR-030 — phase advance: the siege lines**
> NARRATOR: A siege is procedure. Dig a trench, mount the guns, batter the defenses; dig the next trench closer, and repeat. The allied guns fire day and night. The second trench cannot be established, as two British redoubts, numbers nine and ten, block its path.

**YOR-040 — night falls on the table; wake into the assault burst**
> NARRATOR: October 14th. The redoubts will be taken tonight, by bayonet, in darkness. The muskets go in unloaded — a single accidental shot would warn the whole line. The Americans take number ten. Their commander is a twenty-six-year-old colonel named Alexander Hamilton.

**YOR-050 — redoubt-taken event: the burst peaks, then quiet**
> NARRATOR: The allied guns move into the new line, and from there they can reach every square yard of the town. Three days later, a British drummer climbs onto the parapet and beats for a parley.

**YOR-060 — transition to the surrender field splat**
> NARRATOR: October 19th, 1781. The British army marches out between two lines — French on one side, American on the other — a mile long, to a field where the weapons are laid down. Legend says their bands played a tune called The World Turned Upside Down.

**YOR-070 — player walks the surrender field**
> NARRATOR: Cornwallis did not come. He sent his sword out with a deputy, who tried to surrender it to the French commander first. Rochambeau pointed across the road, to Washington. Washington directed him to his own deputy. The forms mattered, that day.

**YOR-080 — far end of the field. Final beat.**
> NARRATOR: The war did not end at Yorktown; the fighting sputtered on for two more years. But when the news reached London, the government fell, and Britain began negotiating the peace.

---

# SCENE 9 — THE TREATY OF PARIS
**Register: Witness → Actor · Benjamin West's unfinished painting as a half-dissolved splat: the American commissioners rendered, the British half of the canvas dissolving into raw nothing. The scene ends on the viewer's own signature from Scene 3 — aged forty-seven years, under glass. The payoff is wordless.**

Sound bed: a painter's studio — a clock, a coal fire, brush on canvas,
carriage wheels outside on cobbles. At the signature: near silence.

**PAR-010 — fade-in inside the painting**
> NARRATOR: Paris. September 3rd, 1783. Two years after Yorktown, the diplomats finish what the armies started. Great Britain acknowledges the United States to be free, sovereign, and independent. Those are the treaty's own words.

**PAR-020 — player approaches the American commissioners**
> NARRATOR: The painter Benjamin West set out to record the moment: John Jay, John Adams, Benjamin Franklin, the American commissioners, composed and finished. The British commissioners refused to sit. [beat] The canvas remained half-painted, the right side empty.

**PAR-030 — player crosses into the unfinished half**
> NARRATOR: Half the canvas is a new country, rendered in detail. The other half is blank, and so is much of what comes next: a border at the Mississippi, an army going home unpaid, a constitution not yet written.

**PAR-040 — the frame with the viewer's signature fades up. Hold silence before and after; no line while it is on screen.**
> NARRATOR: In the summer of 1776, fifty-six people signed their names below that promise, not knowing how the story would end.

**PAR-050 — +10s on the aged signature. Final line of the story.**
> NARRATOR: One of the signatures is yours. [beat] The revolution ended in 1783. The movement it started continues to this day.
