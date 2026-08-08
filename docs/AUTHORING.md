# AUTHORING.md — adding content without touching code

This guide is written for a motivated non-programmer. Everything the game shows — worlds, bosses, questions, voices, dialogue — lives in JSON files under `/content`. If you can edit a text file, you can grow this game.

**Golden rule:** after any edit, run `npm run validate`. It tells you exactly what's missing or misspelled, in plain English, before you ever boot the game.

---

## The content tree

```
/content
  config.json        ← every gameplay number (jump height, door costs, boss AI pacing…)
  characters.json    ← who exists: names, colours, voice profiles
  strings/en-GB.json ← every piece of display text
  voices/            ← what characters SAY, in variant pools (never repeats until exhausted)
  dialogue/          ← scripted scenes (intro, boss meetings)
  questions/         ← question packs per topic (parametric = infinite variety)
  tasks/             ← learning tasks (SORT-IT, BUILD-IT, …) used inside worlds
  enemies/ bosses/ movesets/  ← the fighting cast
  levels/            ← world layouts (geometry recipes, fossils, spawns)
  music/             ← procedural music briefs (tempo, scale, patterns)
  schemas/           ← the rulebooks `npm run validate` checks against
```

## Recipe: a new question pack

Copy any file in `questions/`, change the ids, write questions. Two styles:

**Parametric** (numbers rolled fresh every time — kids can't memorise positions):
```json
{
  "id": "maths-times-x4-t2-007",
  "tier": 2,
  "template": "What is {a} × 4?",
  "params": { "a": { "min": 3, "max": 12 } },
  "answerExpr": "a*4",
  "distractorRules": ["a*4+4", "a*4-4", "a*3"],
  "askStyles": ["kenji", "marcus", "digger"],
  "hint": "Double it — then double it again!",
  "explain": "{a} × 4 is {a} doubled twice."
}
```

**Fixed choice** (for facts):
```json
{
  "id": "sci-rocks-t1-003",
  "tier": 1,
  "template": "Which rock is made from cooled melted rock?",
  "choices": ["Igneous", "Sedimentary", "Metamorphic"],
  "answerIndex": 0,
  "askStyles": ["kenji", "digger"],
  "hint": "Think volcanoes!",
  "explain": "Igneous rock forms when melted rock cools and hardens."
}
```

Rules the validator enforces: every question needs a `hint`, an `explain`, and at least **2** `askStyles` (so different companions can ask it). Tiers: 1 = Year 3 entry, 2 = Year 4, 3 = stretch. The adaptive system picks the pack up automatically by its `topic`.

## Recipe: a new boss

1. Add `bosses/my_boss.json` — copy an existing one. The personality is **five numbers**:
   ```json
   "traits": { "aggression": 0.2, "caution": 0.9, "trickery": 0.3, "patience": 0.9, "showmanship": 0.4 }
   ```
   Recipes: *coward-king* = aggression .2 / trickery .8 with flee moves · *landslide* = aggression .9, patience .1 · *fortress* = caution .9, patience .9. Same moveset + different traits = a completely different fight (that's tested!).
2. Point `moveset` at a file in `movesets/` (share one! Bruno and Dame Bastion both use `sword_and_board`).
3. Give abilities as data triggers, e.g. cloak below 40% health:
   ```json
   { "id": "cloak", "trigger": { "type": "onHpBelow", "value": 0.4 }, "effect": "invisible" }
   ```
4. Add a voice pack in `voices/` (intro, taunts, hit reactions, low-hp, defeat-freed — minimum counts are in `config.json → voice.minVariants`), a character entry in `characters.json` (colours + speech profile), and an arena level in `levels/`.
5. `npm run validate` will hold your hand through anything missed.

## Recipe: a new world

1. Copy `levels/w2.json` to `levels/w9.json`; change `id`, `nameKey`, `gateKey`.
2. Add the door cost in `config.json → doors` and the name strings in `strings/en-GB.json`.
3. Author geometry as primitive recipes (boxes, cylinders, ramps — positions/sizes/colours), place exactly **7 fossils** (2 task chains, 1 Digger secret, 1 platforming, 1 arena, 1 boss, 1 bonus) and exactly **100 chips** (the validator counts!).
4. Reference tasks/enemies/boss/music by id. Done — the world door appears in the hub automatically; **no engine code changes**.

## Recipe: a new task archetype (the one code-touching path)

Implement the `TaskModule` interface in `src/game/education/tasks/`, register it in `src/game/education/registry.ts`, and document it here. Everything else (placements, definitions) is data.

## Voices: how speech works

Each character's `voices/<name>.json` holds **pools** keyed by moment (`ask_intro`, `incorrect_gentle`, `fossil_get`…). The engine never repeats a line until its pool is used up (memory persists per save slot), rotates which companion asks each question, and speaks every line aloud via the browser's free speech synthesis with per-character rate/pitch. Writing rule: warmth always; accents come from vocabulary and rhythm, never phonetic mockery.

**Premium voices:** set `VITE_ELEVENLABS_KEY` in a `.env` file and the ElevenLabs provider slot activates (stubbed today, falls back gracefully). No key = never loaded, game stays fully offline.

---

## Worked example: World 9 — "Circuit City" (authored, not built)

A complete drop-in you could paste today (ids shortened for reading):

- `levels/w9.json`: neon rooftop city where every door is a switch. `gateKey: "w9"`, palette electric blue/amber, `music: "w9"`. Fossils: ① *The Great Fuse* (CIRCUIT-IT: wire battery→switch→motor to start the tram) ② *Conductor or Not?* (SORT-IT: metal vs plastic vs wood onto conductor/insulator platforms) ③ Digger secret behind the neon sign ④ *Rooftop Cable Run* (platforming) ⑤ *Sparky Prime* (mini-boss, `movesets/turret_support.json`, random traits) ⑥ **The Circuit Baron** ⑦ bonus (80 chips).
- `bosses/circuit_baron.json`: traits `{ "aggression": 0.45, "caution": 0.6, "trickery": 0.7, "patience": 0.5, "showmanship": 0.8 }`, moveset `turret_support`, ability `{ "id": "blackout", "trigger": { "type": "onHpBelow", "value": 0.5 }, "effect": "lights_out", "counter": "complete_the_circuit_pads" }` — the arena goes dark until Max stomps the three pads that close the lighting circuit (curriculum as counter, like Nightshade's beam).
- `questions/sci-circuits.json`: tiers 1–3 (name the parts → will it light? → debug the broken diagram).
- `music/w9.json`: 128 bpm, minor pentatonic, square-wave arpeggios over a sawtooth bass.
- Strings: `level.w9`, `level.w9.sub`, door cost in `config.doors.w9`.

Run `npm run validate` → it checks every reference above resolves; boot the game and the Circuit City door appears in Dino Plaza, sealed until its fossil cost is met.
