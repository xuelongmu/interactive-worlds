# Narration Scripts — Representative Scenes

Interactive story of the American Revolution.
One script per interactivity register:

- **Scene 2 — Lexington Green** · Witness (World Labs frozen splat)
- **Scene 3 — The Declaration** · Actor (Three.js + Tripo signing)
- **Scene 4 — Crossing the Delaware** · Participant (world model)

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
> NARRATOR: Philadelphia. The Pennsylvania State House, summer of 1776. The windows are shuttered. The debates inside are treason, and the city is full of informers.

**DEC-011 — player approaches the table; transition to Three.js scene**
> NARRATOR: On July 2nd, Congress voted for independence. The formal signing came weeks later, the delegates coming to the table one at a time.

**DEC-030 — player picks up the quill**
> NARRATOR: The document closes with a pledge: their lives, their fortunes, and their sacred honor. It was not rhetoric. A signature below those words was a confession to treason, and the penalty for treason was death.

**DEC-060 — signature stroke complete.**
Hold silence while the ink dries and darkens. No line.

**DEC-061 — +8s after signing**
> NARRATOR: Fifty-six men signed. The youngest was twenty-six. The oldest, Franklin, was seventy. Merchants, farmers, lawyers, a printer. None of them knew whether the document would be remembered as a founding — or produced as evidence.

**DEC-070 — player sets down quill / exit interaction**
> NARRATOR: The names were kept secret for six months. No signer was ever tried for treason, but many paid all the same — homes burned, fortunes lost, sons killed in the war they had voted for.

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
