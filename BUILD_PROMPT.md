# MAX & THE STAR FOSSILS
### Master build prompt for an autonomous coding agent (Claude Code / Codex)

**Deliverable:** a complete, expandable, Mario-64-style 3D collect-a-thon platformer for players aged 7–8, starring **Max, a blue T-Rex**. The game blends real STEM learning tasks (England KS2, Years 3–4 level: science, maths, engineering) with personality-driven boss battles against human-like AI champions, and it is fully "voiced" — every character speaks with a distinct, varied voice, including when learning questions are asked.

---

## How to use this file (note for the human)

1. Create an empty git repository and save this file into it as `BUILD_PROMPT.md`.
2. Tell your coding agent: *"Read BUILD_PROMPT.md in full. Execute Phase 0 from §10. At the end of each phase, run that phase's acceptance gate, show me the results, then continue."*
3. The game is runnable at the end of every phase with `npm run dev`. Working one phase per session/context window gives the best results.

Everything below this line is addressed to the coding agent.

---

## 0 · Your role & prime directives

You are the lead engineer, game designer, and writer for this project. You build it end-to-end, autonomously, phase by phase. These directives override everything else:

1. **Ship playable increments.** The game must boot and be playable at the end of every phase. Never leave the repo broken between phases.
2. **Original IP only.** This game is *inspired by the structure* of classic 3D collect-a-thon platformers (hub world, star-like collectibles, themed worlds, door gates). It must contain **zero** Nintendo characters, names, assets, music, sounds, or logos. All characters, art, audio, and text are original.
3. **Data-driven everything.** Levels, bosses, enemies, questions, tasks, dialogue, and voices are defined in JSON under `/content`. Adding a new world, boss, or question pack must require **zero engine code changes**. This invariant is tested (§10, §11).
4. **Kid-first design.** Target player is 7–8 years old. G-rated everywhere. Growth-mindset messaging: wrong answers get warmth, hints, and a retry — never mockery, never punishment spirals, never "game over" shaming. Defeated bosses are *freed*, not destroyed (see §1 story).
5. **Voice everywhere.** No silent menus, no dry quiz popups. Every question, hint, reaction, and boss taunt is delivered in-character through the dialogue engine with large variant pools and text-to-speech (§3, §8).
6. **Placeholder-art-first, but the polish bar is high.** Build all characters and worlds from stylised low-poly primitives with a strong shader/post-processing look (§2.4). Gameplay-complete before beautiful, but "placeholder" here still means charming and cohesive, not grey boxes in the final build.
7. **Never block on questions.** When a decision is ambiguous, apply the Decision Defaults (§12), record the choice in `docs/DEVLOG.md`, and continue.
8. **Verify, then proceed.** Every phase ends by running its acceptance gate (§10). Fix failures before moving on.
9. **Performance is a feature.** Target 60 fps at 1080p on a mid-range laptop. Budgets in §2.5.
10. **Keep the docs current.** Maintain `docs/DEVLOG.md` (decisions + progress), `docs/AUTHORING.md` (how to add content — written for a non-programmer), and `docs/CONTROLS.md`.

---

## 1 · Game overview

**Working title:** *Max & the Star Fossils* (all names are placeholders editable in `/content/characters.json` and `/content/strings/en-GB.json`).

**Elevator pitch:** A joyful 3D platformer where a young blue T-Rex explores seven wildly different worlds, solves real science, maths, and engineering challenges to earn Star Fossils, and out-thinks a cast of human champions whose fighting personalities are as different as people are.

### 1.1 Design pillars

| Pillar | Meaning |
|---|---|
| **Move joyfully** | Running, jumping, and tail-spinning must feel great before anything else matters. |
| **Learn by doing** | STEM content is played, not just quizzed — build the bridge, pour the potion, wire the circuit. Questions live inside the fiction. |
| **Every foe has a mind** | No two enemies fight the same way. Boss behaviour emerges from personality traits, not fixed scripts. |
| **Voice everywhere** | Four heroes and eight bosses with distinct, varied, spoken voices. Repetition is engineered out. |
| **Built to grow** | New worlds, bosses, and question packs are JSON drops, not rewrites. |

### 1.2 Story

The world of **Terra Nova** — a place where eras happily mingle — runs on **Star Fossils**: crystallised sparks of ancient dinosaur knowledge. The smooth-talking **General Vex** has stolen them to power his **Know-It-All Engine**, a machine that promises to do everyone's thinking for them ("Why learn, when my Engine can know it *for* you?"). To guard the fossils, Vex clamped mind-controlling **Obedience Cogs** onto seven great human champions.

**Max**, a young blue T-Rex with tiny arms and an enormous heart, sets out to win the Star Fossils back — joined by **Kenji** (a brilliant engineer from Osaka), **Marcus** (a theatrical gladiator from ancient Rome), and **Digger** (their cheeky Australian Cattle Dog). Each champion Max defeats has their Obedience Cog knocked loose; freed and grateful, they retire to the hub café and offer friendly practice games. The finale: Max overloads the Know-It-All Engine with the one thing it cannot fake — real understanding.

**Theme (kept light, never preachy):** thinking for yourself beats being told the answers.

### 1.3 Structure & win condition

- **1 hub world** (Dino Plaza) + **7 themed worlds** + **1 finale world** (Sky Citadel) = 9 explorable levels.
- Each themed world holds **7 Star Fossils** (6 quest fossils + 1 bonus). The hub hides 3. **52 total.**
- World doors unlock at fossil counts (§7.10). The finale gate opens at **38**.
- A full playthrough is roughly 8–12 hours; each fossil is a 3–10 minute bite, so sessions can be short.

---

## 2 · Tech stack & architecture

### 2.1 Stack (chosen for maximum quality *and* maximum buildability by a coding agent)

| Piece | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | Refactor safety for a large autonomous build. |
| Bundler/dev | **Vite** | Instant reload, trivial build. |
| 3D | **Three.js** (latest stable) | Runs in any browser; the agent can build, run, and screenshot-test end-to-end. High visual ceiling with shaders + post FX. |
| Collision | **three-mesh-bvh** | Fast raycast/capsule-cast against level meshes. |
| Physics | **Custom kinematic character controller** (no heavy physics engine) | Precise platformer feel; far more reliable for an agent than tuning a physics lib. |
| Post FX | **`postprocessing`** npm package | Bloom, vignette, SMAA, outlines. |
| Validation | **ajv** + JSON Schema | Every content file validated at load and in CI. |
| Tests | **Vitest** (sim/unit) + **Playwright** (smoke) | Headless AI-behaviour proofs (§6.6) and boot tests. |
| Audio | **Web Audio API** | Music/SFX/voice buses with ducking. |
| Speech | **Web Speech API** behind a `VoiceProvider` interface | Free spoken voice for every line; swappable for premium TTS later (§8.3). |

No servers, no logins, no telemetry, no ads. The game is a static site: `npm run build` → deployable folder, playable offline.

### 2.2 Repository layout

```
/src
  /engine            # reusable, game-agnostic
    renderer.ts      # scene, camera rig, post FX chain, quality presets
    physics.ts       # kinematic controller, capsule/sphere casts (three-mesh-bvh)
    input.ts         # keyboard + gamepad, rebindable, action buffering
    audio.ts         # WebAudio buses: music / sfx / voice, with ducking
    tts.ts           # VoiceProvider interface + WebSpeech / Null / ElevenLabs stub
    save.ts          # 3 slots, localStorage + JSON export/import
    events.ts        # typed event bus
    loader.ts        # content loader + ajv validation
  /game
    player/          # controller, move set, camera
    companions/      # follow AI, context-aware lines
    combat/          # hitboxes, damage, hit-pause, knockback, lock-on
    ai/              # utility-AI core, traits, triggers, boss runtime, enemy archetypes
    education/       # task engine, task archetype modules, adaptive difficulty, mastery
    dialogue/        # dialogue engine, bark scheduler, no-repeat memory, subtitles
    world/           # level loader, platforms, hazards, collectibles, portals
    ui/              # HUD, menus, fossil select, settings, Grown-Ups' Corner
/content             # ← designers only ever touch this tree
  config.json        # every gameplay tunable
  characters.json    # names, colours, voice profile refs
  strings/en-GB.json # ALL display text (localization-ready)
  voices/            # per-character delivery pools (§3.6)
  dialogue/          # cutscenes, banter, bark tables
  questions/         # question packs per topic (§5.5)
  tasks/             # BUILD-IT / MEASURE-IT etc. definitions
  enemies/  bosses/  movesets/  levels/  music/
  schemas/           # JSON Schema for every content type
/docs                # DEVLOG.md, AUTHORING.md, CONTROLS.md
/tests               # ai-sim, content-validation, smoke
```

### 2.3 Architecture invariants (tested)

- **Content-only expansion:** a new world/boss/question pack is added purely under `/content` (§11). CI fails if the level registry is hardcoded.
- **No hardcoded display strings** — everything through the string table + dialogue engine.
- **Systems talk via the typed event bus** (`FossilCollected`, `QuestionAnswered {topicId, correct, tier}`, `BossPhaseChanged`, …). The education, dialogue, and mastery systems subscribe; they never reach into each other.
- **Every tunable** (jump height, damage, i-frames, voice rates…) lives in `/content/config.json`.

### 2.4 The graphics bar ("stylised, gorgeous, achievable")

Aim for a look like a modern indie toy-box platformer, achieved without any external art assets:

- **Toon shading:** `MeshToonMaterial` with 3-step gradient ramps; saturated, per-world palettes; vertex-colour accents.
- **Post chain:** SMAA → subtle bloom → vignette; **outline pass** on characters and interactables.
- **Light & shadow:** one warm key light + coloured ambient per world; PCF-soft shadows; distance fog and a gradient sky dome tuned per world (W5 runs a day↔night cycle).
- **Signature shaders:** water (animated vertex waves + fresnel sparkle), lava (scrolling emissive noise), crystal (fresnel glow), cloaking (dissolve + refraction shimmer — needed for the boss Nightshade §6.7).
- **Particles (GPU points, pooled):** footstep dust, hit sparks, fossil sparkle trails, leaves, bubbles, embers, snow-ash.
- **Game feel:** procedural squash-and-stretch on jump/land, 60–90 ms hit-pause on solid hits, subtle screenshake (toggleable), interactables idle-bob.
- **Characters are primitive-built rigs:** hierarchies of `Object3D` "bones" with code-driven animation clips (idle, run, jump, attack, talk-gesticulate). Give every character 4 swappable eye expressions (quads). *Example — Max:* rounded-box torso, oversized head with big jaw, two-segment tiny arms, three-segment tail with follow-through lag, cobalt body `#2B6CFF`, teal belly `#7FE0D4`, cream claws.
- **Quality presets** Low/Med/High with auto-detect (fps probe on first boot).

### 2.5 Performance budgets

60 fps @1080p on a mid-range laptop; ≤150 draw calls per scene (merge/instance aggressively); flat colours and vertex colours instead of textures wherever possible; object pooling for particles/projectiles; per-world asset loading with a loading screen that shows a fun fact from the world's STEM topic (spaced repetition for free).

---

## 3 · Character & voice bible

Four heroes travel together: Max (played), plus companions Kenji, Marcus, and Digger who follow, react, teach, and banter. Their voices are the soul of the game — write them with love.

**Representation rule (hard requirement):** accents and origins are conveyed through *vocabulary, rhythm, knowledge, and cultural warmth* — never through phonetically-spelled mock accents. Kenji, Marcus, and Digger are competent heroes, never punchlines about where they're from; the comedy comes from personality (Kenji over-engineers, Marcus over-performs, Digger over-cheeks).

### 3.1 MAX — the hero (played character)

- **Identity:** young blue T-Rex. Brave, endlessly curious, giggles at his own tiny arms, roars when excited.
- **Speech style:** short, punchy, kid-energy exclamations. Asks the questions a 7-year-old would ask ("Wait — HOW do magnets push without touching?!"), which lets companions explain naturally.
- **Sample lines:** "Tiny arms, BIG ideas!" · "Did you SEE that jump?!" · "Hmm… let me think. Thinking is my second-favourite thing after stomping." · (wrong answer) "Whoops — okay okay, round two!" · (fossil get) "STAR FOSSIL! RAAAAAR!"

### 3.2 KENJI TANAKA — the Engineer

- **Identity:** master engineer from Osaka; tool-belt, sketchbook, small hovering toolbox drone called Botto. Calm, precise, delighted by elegant solutions.
- **Role:** teaches the **engineering and science** strands; runs the hub Workshop; builds Max's gadgets (§4.6); mid-battle he analyses boss patterns aloud.
- **Speech style:** precise and warm; loves a good metaphor ("A triangle is the strongest shape — it has no way to lean!"); natural Japanese exclamations used sparingly and joyfully: *"Yosh!"*, *"Sugoi!"*, "Max-kun". Counts steps: "Step one… step two…".
- **Sample lines:** "Yosh — let us measure twice and stomp once." · "Look at the boss's shield arm, Max-kun — it drops after the third swing!" · (correct) "Sugoi! Precision-perfect!" · (gentle miss) "Mm, close! A good engineer tests again. Hint: what do we know about the load on that beam?"

### 3.3 MARCUS AURELIO — the Gladiator

- **Identity:** champion gladiator of ancient Rome, big as a doorway, heart even bigger. Booms everything. Deeply proud of his nonna's recipes.
- **Role:** teaches **combat** (tutorials, sparring in the hub Arena) and the **maths of the arena** — including Roman numerals, naturally. Shouts tactical encouragement in boss fights.
- **Speech style:** theatrical, honour-and-training talk, third-person flourishes. Latin exclamations always instantly translated in the same breath: *"Fortuna audaces iuvat — fortune favours the bold!"*
- **Sample lines:** "AVE, Max! Today we train the mightiest muscle — the BRAIN!" · "Shields up! See how she waits? Patience is also a weapon." · (correct) "GLORIOUS! The crowd goes wild — and the crowd is me!" · (gentle miss) "Even Marcus once dropped his sword. Pick it up. Try again — I believe in you, little rex."

### 3.4 DIGGER — the Australian Cattle Dog

- **Identity:** blue-heeler cattle dog (same blue as Max — they argue happily about who wore it first). The party's scout, secret-sniffer, and comic relief. Yes, he talks; nobody questions it.
- **Role:** finds secrets (hidden fossil #3 in every world reacts to his Sniff ping), delivers hints when the player is stuck, softens every failure.
- **Speech style:** cheeky, warm Aussie slang, light touch: "G'day", "ripper", "too easy", "fair dinkum", "reckon". Never mean; his teasing is always aimed at Vex or at himself.
- **Sample lines:** "G'day! Smells like a secret 'round here… this-a-way!" · "Too easy, mate — you got this one." · (player idle) "Reckon we should have a squiz over there?" · (after a miss) "No wukkas. Even good dogs bury the bone in the wrong yard sometimes. Second sniff?"

### 3.5 GENERAL VEX — the villain (and the boss cast)

- **Identity:** silky, lazy-brilliant showman in a clockwork coat. Believes effort is obsolete. Never cruel to Max — condescending, which is worse, and funnier.
- **Sample lines:** "Learning? How… quaint. My Engine already knows everything, little lizard." · "You *worked out* the answer? Yourself? Disgusting." · (defeated) "Fine. FINE. Perhaps… I have some reading to do."
- The seven champions each have a one-line voice identity in their boss cards (§6.7). Give every boss its own delivery pool: intro, mid-fight taunt, reaction-to-being-hit, low-health, defeat-and-freed.

### 3.6 The voice delivery system (this is a core feature, not a nice-to-have)

All spoken text lives in `/content/voices/<character>.json` as **delivery pools** keyed by context:

| Context key | Fired when | Minimum variants (companions) |
|---|---|---|
| `ask_intro` | wrapping any learning question | **6 per companion** |
| `correct_first_try` / `correct_after_hint` | answers | 4 each |
| `incorrect_gentle` | first miss (always warm, always ends with a hint offer) | 4 |
| `hint` | player stuck or asks | 3 per task archetype |
| `streak_3` / `streak_5` | consecutive correct | 3 each |
| `fossil_get` / `secret_found` | rewards | 4 |
| `boss_intro` / `boss_low_hp` / `victory` | battles | 3 each |
| `idle_nudge` / `banter` | ambient | 6 |

Rules the engine must enforce:

1. **No-repeat memory:** a line never repeats until its pool is exhausted (persisted per save slot).
2. **Rotating speakers:** learning questions rotate through eligible companions (`askStyles` on each question, §5.5) so the *same* maths fact arrives as Kenji's calibration check, Marcus's arena drill, or Digger's treasure count.
3. **Templated interpolation:** pools support `{playerName}`, `{topic}`, `{answer}` etc.
4. **Bark scheduler:** priority (combat warnings > hints > flavour), per-character cooldowns, and a global "don't talk over each other" rule with one interruption exception — combat danger calls.
5. **Companion banter:** paired lines (Kenji↔Marcus engineering-vs-muscle debates, Digger teasing both) trigger during quiet exploration, max once per 90 s.
6. Every line renders as a subtitle with speaker portrait and colour; subtitles cannot be fully disabled (readability floor for young readers), only resized.

Author at minimum **60 lines per companion, 25 per boss, 30 for Max, 25 for Vex** at launch, all G-rated, all passing the representation rule.

---

## 4 · Core gameplay

### 4.1 Move set (initial tuning in `config.json`; iterate until it *feels* great)

| Move | Input | Notes |
|---|---|---|
| Run | stick/WASD | analog speed up to 7 m/s; snappy 0.15 s acceleration |
| Jump / Double jump | A / Space | apex ~2.3 m; **coyote time 0.12 s**, **jump buffer 0.15 s**; variable height (release early = lower) |
| Tail Spin | X / J | 360° attack, 0.5 s, can cancel into fall; Max's bread-and-butter |
| Stomp | B in air / K | ground-pound: 0.25 s hop, 18 m/s slam, small AoE, breaks cracked blocks, presses big buttons |
| Chomp | Y / L | grab-and-carry crates/levers/berries; chomp small enemies and **spit them as projectiles** |
| Mega Roar | hold X / J with full Brain Power | screen-ripple stun (3 s) on all nearby enemies, shatters roar-cracked walls |
| Ledge grab, slope slide, swim | contextual | swim = 2-button paddle/dive, generous air timer with bubbles from Digger |

**Camera:** orbit-follow with 3 zoom steps, collision probe (never clips walls), recentre button, gentle auto-frame, optional invert + sensitivity sliders. Soft lock-on in boss arenas.

### 4.2 Health & kindness

5 hearts; enemy contact costs ½–1. Hearts drop from defeated enemies and heart-plants. **No lives, no game-over screen:** at 0 hearts Max "gets dizzy", Digger drags him back to the last checkpoint with an encouraging line, and everything but arena progress persists. i-frames 0.8 s after any hit.

### 4.3 Collectibles & economy

- **Star Fossils** — the stars. 7 per world (6 quest + 1 bonus), 3 in the hub → **52**.
- **Amber Chips** — coins. 100 placed per world; banking **80 in one world** awards its bonus fossil.
- **Brain Power** — 5-segment meter charged by correct answers anywhere; fuels Mega Roar. Learning literally powers Max up.
- **Quiz Orbs** — rare floating orbs in combat arenas; optional to grab. Catching one pauses combat for one quick-fire question from a companion: correct = +1 heart and +1 Brain Power segment. Learning is never forced mid-fight, but it always helps.

### 4.4 Fossil select (Mario-64-style mission structure)

Entering a world portal shows its fossil list: name, icon of type, and a spoken hint line from the companion best suited to it. Fossils can be earned in any order; the world stays open after collection for free play. Fossil types per world, always this mix: **2 STEM quest-chains, 1 Digger secret, 1 platforming challenge, 1 arena battle (mini-boss), 1 world boss, +1 bonus (80 Amber Chips)**.

### 4.5 Dino Plaza (the hub)

A sunny plaza ringed by doors to the worlds (§7.10 gate costs), containing:

- **Kenji's Workshop** — gadget-building BUILD-IT projects (§4.6) and the engineering practice bench.
- **Marcus's Arena** — combat tutorials, sparring vs practice dummies with adjustable personalities (a safe showcase of the AI trait system), and Roman-numeral score boards.
- **Digger's Dig Site** — hub secrets, and Digger's Garden: an area that visibly grows one plant per topic mastered (plants curriculum + a living progress bar).
- **The Fossil Café** — every freed champion appears here post-defeat and hosts a themed practice minigame (§6.7 cards). The café slowly fills with friends as the game progresses — the emotional reward for winning.
- **The Vex Gate** — huge clockwork door to Sky Citadel, opens at 38 fossils.

### 4.6 Gadgets (engineering made playable)

Built in Kenji's Workshop via real BUILD-IT tasks, then used in the worlds: **Spring Boots** (built by choosing the right spring/lever ratio → super-bounce pads), **Magno-Mitt** (wire the electromagnet circuit → grab metal orbs & swing points in W3+), **Lantern Buddy** (complete the circuit with a switch → a light drone used in W5's dark zones and the Nightshade fight). Each gadget teaches its concept in the building, then cements it in the using.

---

## 5 · The education system (the heart of the game)

### 5.1 Design laws

1. **Do first, quiz second.** Prefer manipulating the world (build, pour, wire, sort, slice) over multiple choice. Quick-fire questions exist but are the seasoning, not the meal.
2. **Always in fiction.** Never "QUESTION 4/10". It's Kenji calibrating a machine, Marcus counting the crowd, Digger splitting the snacks fairly.
3. **Warm failure loop:** miss → gentle in-character response + hint → second try → if missed again, the companion *teaches* the answer step by step (no fossil lost — the task re-rolls new parametric values so it can be re-earned immediately, and the topic is flagged for revisit).
4. **Adaptive difficulty:** every topic has tiers 1–3. Three correct in a row at a tier promotes; struggles demote softly and invisibly. Tier maps to Y3 → Y4 → stretch.
5. **Spaced repetition:** the café minigames and Quiz Orbs draw from the player's *weakest* topics; loading screens show facts from recently-missed material.
6. **Reading support:** every question is spoken aloud via TTS as well as shown as text (this is core accessibility for 7-year-olds, not a setting).
7. **Never timed** unless the player opts into a "Lightning Round" (streak bonuses only, no penalties).

### 5.2 Curriculum matrix (England KS2, Years 3–4)

| Strand | Topic | Yr | Featured in | Task archetypes |
|---|---|---|---|---|
| Maths | Place value to 1,000 → 10,000 | 3–4 | W1 | NUMBER-PATH, QUICK-FIRE |
| Maths | Add/subtract 3–4 digit | 3–4 | W1, W6 shop | MEASURE-IT, QUICK-FIRE |
| Maths | Times tables ×3, ×4, ×8 → all to 12×12 | 3–4 | W2 (gear ratios!), W7 | NUMBER-PATH, boss mechanic |
| Maths | Fractions: unit, non-unit, equivalents, tenths | 3–4 | W4 | FRACTION-FORGE |
| Maths | Decimals (tenths/hundredths) | 4 | W4 | MEASURE-IT |
| Maths | Measurement: ml, g, cm/m, £, perimeter, area | 3–4 | W3, W4, W6 | MEASURE-IT, BUILD-IT |
| Maths | Time: nearest minute, 24-hour | 3–4 | W5 (lighthouse clock) | SHADOW-IT variant |
| Maths | Roman numerals I–XII → C | 3–4 | Marcus's Arena, W7 | SORT-IT, QUICK-FIRE |
| Maths | Coordinates on a 2-D grid | 4 | W6 treasure maps | NUMBER-PATH variant |
| Maths | Symmetry; bar charts/pictograms | 3–4 | W2 cog symmetry; café stats | SORT-IT |
| Science | Rocks, soils & fossils | 3 | W1 | SORT-IT (igneous/sedimentary/metamorphic) |
| Science | Skeletons, muscles & nutrition | 3–4 | W1 (fossils = skeletons!), café | SORT-IT |
| Science | Forces & magnets, friction | 3 | W3 | BUILD-IT, SORT-IT (magnetic or not) |
| Science | Light & shadows | 3 | W5 | SHADOW-IT |
| Science | Sound: vibration, pitch, volume | 4 | W5 foghorn organ | MEASURE-IT (pitch) |
| Science | States of matter & water cycle | 4 | W4 (falls, steam), W7 (lava→rock, links back to W1!) | SORT-IT |
| Science | Electricity: circuits, conductors/insulators | 4 | W2, gadgets, W8 finale | CIRCUIT-IT |
| Science | Plants; living things, classification, food chains | 3–4 | Digger's Garden, W4 banks, W7 jungle keys | SORT-IT, classification doors |
| Engineering | Levers, pulleys, gears, cams | D&T | W2 | BUILD-IT |
| Engineering | Strong structures: triangles, bridges, materials | D&T | W6 | BUILD-IT |
| Engineering | The design loop: plan→build→test→improve | D&T | every BUILD-IT | explicit repeated mechanic |

### 5.3 Task archetypes (each is a self-registered module implementing `TaskModule`)

1. **BUILD-IT** — place parts under constraints, physics-checked. *Bridge won't hold until braced with triangles; gear train needs the right sizes for speed vs force; Kenji narrates the design loop.*
2. **MEASURE-IT** — in-world jugs, scales, rulers, thermometers, money. *Pour exactly 250 ml into the potion; buy planks with £2.50 and count the change.*
3. **SORT-IT** — stomp objects onto labelled platforms. *Conductor vs insulator; igneous vs sedimentary; magnetic vs not; herbivore vs carnivore.*
4. **NUMBER-PATH** — a platform path lights only on correct values. *Cross the chasm stepping on multiples of 8; wrong tiles harmlessly boing Max back.* (Coordinate variant: stomp grid cell (4,2).)
5. **CIRCUIT-IT** — drag wires between battery, switch, bulb, buzzer, motor to power doors/lifts. Broken-circuit debugging at tier 3.
6. **SHADOW-IT** — move/aim light sources so shadows match target outlines; teaches opacity and shadow size vs distance. (Clock variant: set the lighthouse clock to "twenty to nine".)
7. **FRACTION-FORGE** — slice objects into equal parts and serve requests. *The Numberlings demand ⅜ of a pizza; equivalence puzzles at tier 3 (2/4 = 1/2).*
8. **QUICK-FIRE** — spoken question, 3 physical answer platforms; stomp to answer. Used for Quiz Orbs, café games, and pacing between big tasks.

Adding archetype #9 later = implement `TaskModule`, register it, document it (§11).

### 5.4 Mastery model

Per-topic XP → 0–3 mastery stars, shown as constellations in the pause menu and as plants in Digger's Garden. Adaptive selection weights the *weakest* topics into optional content. Feeds the Grown-Ups' Corner dashboard (§9.4).

### 5.5 Question data format (sample — full JSON Schema required in `/content/schemas`)

```json
{
  "id": "maths-times-x4-t2-007",
  "strand": "maths", "topic": "times-tables", "subtopic": "x4",
  "tier": 2, "type": "quickfire",
  "template": "What is {a} × 4?",
  "params": { "a": { "min": 3, "max": 12 } },
  "answerExpr": "a*4",
  "distractorRules": ["a*4+4", "a*4-4", "a*3"],
  "askStyles": ["kenji", "marcus", "digger"],
  "hint": "Double it — then double it again!",
  "explain": "{a} × 4 is {a} doubled twice: {a} → {a2} → {answer}."
}
```

Parametric templates make numeric questions effectively infinite (no memorising answer positions; distractors always plausible). Author **≥10 questions per topic per tier** (handwritten + parametric mix), validated by schema. Every question must have `hint` and `explain`, and at least 2 `askStyles`.

---

## 6 · Combat & the Personality AI system

### 6.1 Player-side combat feel

Tail Spin (1 dmg), Stomp (2 dmg, breaks armour), Chomp-and-spit (1 dmg ranged), Mega Roar (3 s stun). Hit-pause 60–90 ms, chunky knockback, 0.8 s i-frames. **Every enemy attack telegraphs for ≥0.6 s with a paired visual flash AND audio cue** (never colour-only — accessibility). Companions shout tactical reads during fights (Kenji analyses, Marcus coaches, Digger warns of off-screen attacks) through the bark scheduler.

### 6.2 Normal enemies — the Clockwork Legion

Data-driven archetypes in `/content/enemies/`, each with 2–3 behaviours **plus spawn-time trait noise (±0.15)** so no two individuals act identically:

| Enemy | Worlds | Personality & behaviour |
|---|---|---|
| Cogling Scout | all | cowardly — keeps distance, throws bolts, flees at low HP and *alerts friends* |
| Cogling Brute | all | aggressive — slow, huge telegraphs, dizzy after missing (punish window) |
| Cogling Tinkerer | 2+ | defensive support — hides, repairs other Coglings; priority-target lesson |
| Buzzer | 3+ | dive-bomber; loops predictably — reward for watching patterns |
| Magnetite Crab | W3 | pulls Max's metal gadgets; introduces magnet-counterplay |
| Shadowmite | W5 | hides in shadows; any light source reveals and stuns it (curriculum as combat) |

### 6.3 The Boss Personality Framework (crown jewel — build this well)

Every boss is a **BossDefinition JSON**: stats, a **trait vector**, a moveset reference, ability triggers, phases, a voice pack, and an arena. Personality *emerges* from traits driving a utility-AI decision loop — the same framework must be able to express opposite personalities from identical movesets.

**Traits (0–1):** `aggression` (favours advancing/striking), `caution` (favours blocking/spacing/heal-seeking), `trickery` (feints, teleports, misdirection), `patience` (willingness to wait out the player), `showmanship` (taunts, flourishes, crowd-play — feeds the voice system).

**Decision loop (every 0.4–0.8 s):**

```
for each available move:
  score = baseWeight
        × traitMultiplier(move.tags, traits)      // e.g. strike-tag scaled by aggression
        × contextMultiplier(distanceBand, selfHP, playerHP,
                            playerHabits, arenaState)
pick from top-3 via softmax(temperature = 0.35 + trickery × 0.3)
```

- `playerHabits`: rolling histogram of the player's last 12 actions. High-`caution` bosses raise block weight against the player's most-used attack; high-`trickery` bosses feint it out.
- **Ban-repeat rule:** no move 3× consecutively (unless `aggression > 0.8` — relentless types are *allowed* to feel relentless).
- **Ability triggers** (data, not code): `onHpBelow(x)`, `onPlayerStreak(n)`, `onDistanceHeld(range, secs)`, `onTimer(secs)`, `onPhaseEnter(p)`, `onAllyDown`.
- **Fairness governor:** a threat budget per rolling 10 s window, scaled by difficulty and rubber-banded by recent damage the player has taken. Max 3 phases; checkpoint between phases on Explorer difficulty.

### 6.4 Moveset sharing (explicit requirement)

Movesets live in `/content/movesets/` and are shared. **Bruno (W1) and Dame Bastion (W6) both use `sword_and_board.json`** — the same sword-and-shield toolkit — yet must fight like different people purely via traits: Bruno all-out attack, Bastion a patient fortress. This is the proof that personality is systemic, not scripted.

### 6.5 Sample BossDefinition (abridged)

```json
{
  "id": "nightshade", "name": "Nightshade", "world": "w5",
  "hp": 24, "phases": 2,
  "traits": { "aggression": 0.6, "caution": 0.6, "trickery": 0.95,
              "patience": 0.7, "showmanship": 0.4 },
  "moveset": "twin_daggers.json",
  "abilities": [
    { "id": "cloak", "trigger": { "type": "onHpBelow", "value": 0.4 },
      "effect": "invisible", "counter": "lighthouse_beam_shadow" }
  ],
  "voicePack": "voices/boss_nightshade.json",
  "arena": "levels/w5_arena.json"
}
```

### 6.6 Automated AI proofs (`npm run test:ai` — headless Vitest sims, required to pass)

1. **Divergence test:** Bruno vs Bastion, same moveset, each simulated vs a scripted player-bot (500 decision ticks × 20 runs). Assert Bruno's attack-tagged action share ≥ **2.5×** Bastion's; Bastion's block/reposition share ≥ **2×** Bruno's.
2. **Trigger test:** Nightshade cloaks within 2 s of crossing 40% HP in ≥95% of runs.
3. **Adaptation test:** vs a bot that spams one attack, a `caution ≥ 0.8` boss's block rate against that attack rises ≥50% by tick 300.
4. **Variety test:** across 20 runs of the same fight, action sequences must not be identical (softmax jitter working).

### 6.7 The boss roster — Vex's Seven Champions + Vex

Each card: personality/traits → weapon & signature → ability+trigger → arena gimmick (curriculum woven in) → tell/weakness → voice identity → café minigame after being freed.

**W1 · BRUNO IRONHIDE — "The Landslide"** — sword & shield (`sword_and_board.json`), *agg .9 / cau .15 / pat .1*. Human quarry-master, all forward, all the time. Ability: *Fossil Quake* `onTimer(20s)` (dodge the shockwave rings). Tell: overextends after his 3-swing combo — stomp window. Voice: friendly avalanche, laughs while attacking. Café game: "Rock Sorter" (rocks & soils SORT-IT).

**W2 · BARONESS COGWHEEL — "The Method"** — spanner-lance + deployable turrets, *agg .3 / cau .85 / tri .5 / pat .8*. Meticulous inventor; fights behind a shield generator that must be de-powered mid-fight by **solving a 3-cog gear puzzle at the arena's edge** (education inside the boss fight). Ability: *Repair Swarm* `onHpBelow(.5)`. Voice: crisp, disappointed-teacher wit. Café: "Gear Ratio Workshop".

**W3 · MAGNO THE ATTRACTOR** — magnet gauntlets, *agg .5 / tri .65 / show .7*. Push-pulls Max toward hazards; fight uses the Magno-Mitt to counter-grapple. Ability: *Polarity Flip* `onHpBelow(.3)` — arena-wide reversal (everything you learned, mirrored). Voice: booming carnival strongman. Café: "Magnet Fishing" (magnetic-or-not).

**W4 · SLICE & DICE — the Twin Chefs** — a duo showcasing opposite traits *simultaneously*: Slice (cleaver, *agg .85*) hunts you; Dice (pan-shield + pepper bombs, *cau .8 / tri .7*) zones you. Shared ability: *Halve & Conquer* `onHpBelow(.5)` — each splits into labelled fraction-clones (½, then ¼) with matching fractional HP; defeating the right fraction first matters. Voice: bickering double-act finishing each other's sentences. Café: "Fair Shares Diner" (FRACTION-FORGE + food-groups nutrition).

**W5 · NIGHTSHADE — "The Unseen"** — twin daggers, *tri .95 / agg .6 / cau .6*. Hit-and-run duelist. Ability: *Cloak* `onHpBelow(.4)` — turns invisible; **counter comes from the world's own lesson: rotate the lighthouse beam so her shadow betrays her position** (light travels in straight lines; opaque objects cast shadows). Voice: soft, amused whispers. Café: "Shadow Theatre".

**W6 · DAME BASTION — "The Wall of the Bay"** — sword & tower shield (**same `sword_and_board.json` as Bruno**), *agg .2 / cau .9 / pat .9*. A fortress that punishes impatience; builds barricades mid-fight. Ability: *Rampart* `onDistanceHeld(far, 6s)`. Weakness: her hasty barricades lack diagonal bracing — Stomp the un-triangulated strut and the structure collapses on her (structures curriculum as the killing blow). Voice: calm, courteous knight; compliments good play. Café: "Bridge Load Test".

**W7 · COUNTESS CALCULA — "The Showstopper"** — sceptre, *agg .6 / show .95 / tri .5*. Summons squads of numbered Numberlings and calls products — *"Strike my sevens-times-eights!"* — only minions whose number equals the called product are vulnerable; others reflect. Ability: *Times Tempest* `onHpBelow(.35)` — a faster, glittering final round. Voice: opera-diva mathematician. Café: "Times-Table Talent Show".

**W8 · GENERAL VEX — the Adaptive Mirror** — the framework's finale: his trait vector **shifts live** (opens *cau .7*, ramps aggression as he loses); an opening scan phase copies the player's most-used move back at them; at each phase he borrows one signature ability from a defeated champion (quake / turrets / polarity / split / cloak / rampart / summons — whichever three the player found hardest, read from telemetry). Final beat: Max wires a CIRCUIT-IT sabotage under fire, then answers a **5-question mixed gauntlet** (one per weakest topic) to charge the Mega Roar that overloads the Know-It-All Engine. Voice: silk, then static, then — freed and slightly embarrassed — almost kind.

Every world also contains a **mini-boss** (fossil #5): lighter humans-and-machines using the same framework with randomised trait vectors — living proof of variety.

---

## 7 · Worlds & levels

Every world card below is binding: theme, STEM focus, a new mechanic, 3 zones, 6 named fossils (+bonus via 80 Amber Chips), a Digger secret, a companion beat, enemies, boss. Levels are authored as `/content/levels/wN.json` manifests (geometry recipe, spawn tables, task placements, palette, music ref, fossil list) — see schema + `AUTHORING.md`.

### 7.1 W1 · FOSSIL CANYON
*Sun-baked ochre canyon, bone arches, dig sites. Palette: terracotta/gold/teal sky.*
**STEM:** rocks, soils & fossils; skeletons; place value. **New mechanic:** Stomp-excavation plates.
**Zones:** Dust Gulch (movement playground) → the Great Dig (Kenji's brush-and-grid site) → Bonehenge (wind-carved climb).
**Fossils:** ① *The Sorting Stones* (SORT-IT: igneous/sedimentary/metamorphic conveyor) ② *Skeleton Assembly* (place the dino bones — skeletons science; Kenji: "support, protection, movement!") ③ *Digger's First Sniff* (secret bone-cave) ④ *Canyon Rim Run* (platform challenge) ⑤ *Cogling Quarry Foreman* (mini-boss) ⑥ **Bruno Ironhide** ⑦ bonus.
**Companion beat:** Marcus mistakes a T-Rex fossil for "a fallen gladiator of great honour"; Max explains fossils — the game's thesis in one joke.

### 7.2 W2 · GEARWORKS GORGE
*A brass canyon-factory of colossal cogs, steam vents, conveyor belts. Palette: brass/copper/verdigris.*
**STEM:** gears, levers, pulleys, cams; ×tables via gear ratios ("a 4-tooth driving a 12-tooth turns 3× per rev — feel the maths"); symmetry (cog design); intro circuits. **New mechanic:** ride rotating gear platforms; pull-chain switches (Chomp).
**Fossils:** ① *The Great Gear Train* (BUILD-IT: choose gear sizes for speed vs force) ② *Counterweight Lift* (levers + pulleys BUILD-IT) ③ Digger secret in the steam vents ④ *Conveyor Gauntlet* ⑤ *Tinkerer Prime* mini-boss ⑥ **Baroness Cogwheel** ⑦ bonus.
**Companion beat:** Kenji is starstruck by the Baroness's engineering, torn about fighting her — freed, she becomes his workshop pen-pal.

### 7.3 W3 · MAGNET MINES
*Glittering crystal caverns where iron dust flows like rivers. Palette: deep purple/cyan glow.*
**STEM:** forces & magnets, friction (icy vs gravel slopes), measuring mass (g). **New mechanic:** Magno-Mitt swings; polarity pads (red repels, blue attracts); low-friction slides.
**Fossils:** ① *North Seeks South* (BUILD-IT: bridge of attracting/repelling blocks) ② *The Weigh Station* (MEASURE-IT: balance mine carts in grams) ③ Digger secret behind an iron-dust waterfall ④ *Polarity Slide* ⑤ *Magnetite King Crab* ⑥ **Magno** ⑦ bonus.

### 7.4 W4 · FRACTION FALLS
*Terraced waterfalls, water-wheel mills, riverside gardens, a steamy hot-spring cave. Palette: lush green/white water/rainbow mist.*
**STEM:** fractions & decimals; ml measuring; states of matter & the water cycle (falls→steam→clouds→rain, walkable); plants (riverbank gardens, water transport up stems). **New mechanic:** swimming; water-wheel ride timing.
**Fossils:** ① *The Fair-Share Mill* (FRACTION-FORGE: split grain sacks — ⅜ to the mice, please) ② *Potion of the Springs* (MEASURE-IT: exact ml mixing; tier 3 uses decimals) ③ Digger secret behind the falls ④ *Steam-Cloud Climb* (ride evaporation updrafts — states of matter as platforming) ⑤ *Soggy Cogling Squad* ⑥ **Slice & Dice** ⑦ bonus.
**Companion beat:** Digger "waters" Kenji's blueprints; the party learns why plants actually need water.

### 7.5 W5 · SHADOW LIGHTHOUSE ISLE
*A moonlit isle with a great brass lighthouse; the world cycles day↔night. Palette: indigo/silver/warm lantern gold.*
**STEM:** light & shadows; sound (the foghorn organ: pitch & volume via pipe length); telling time (the lighthouse clock, 24-hour at tier 2+). **New mechanic:** Lantern Buddy; rotatable light beams; Shadowmites.
**Fossils:** ① *The Shadow Theatre* (SHADOW-IT: cast shadows to match outlines; size vs distance) ② *The Foghorn Organ* (tune pipes — longer pipe, lower pitch) ③ Digger secret at low-tide (time-based!) ④ *Lights-Out Ascent* (dark climb with Lantern Buddy) ⑤ *Shadowmite Swarm Mother* ⑥ **Nightshade** ⑦ bonus.

### 7.6 W6 · BRIDGEBUILDER BAY
*A shipwright's harbour of half-built bridges, cranes, and treasure isles. Palette: navy/rope-tan/signal red.*
**STEM:** strong structures (triangles!), materials & properties; perimeter & area (deck planking); money (£ at the chandler's shop); **coordinates** (Digger's treasure grid maps). **New mechanic:** buildable bridge segments persist in the world.
**Fossils:** ① *Span the Gap* (BUILD-IT: brace the truss bridge; test with a cannonball cart — design loop celebrated) ② *The Chandler's Shopping Run* (money MEASURE-IT) ③ *X Marks (4,2)* (Digger's coordinate treasure dig) ④ *Crane-Hook Crossing* ⑤ *Press-Gang Coglings* ⑥ **Dame Bastion** ⑦ bonus.

### 7.7 W7 · TIMES TABLE TEMPLE
*A jungle volcano temple of number-glyphs, lava flows cooling into new rock. Palette: emerald/obsidian/ember orange.*
**STEM:** all times tables to 12×12; Roman numerals to C (temple doors); classification keys & food chains (jungle creatures: "does it have six legs?"); states of matter reprise (lava→igneous rock — explicitly links back to W1: "remember the Sorting Stones?"). **New mechanic:** number-glyph doors; heat-haze zones; crumbling multiples bridges.
**Fossils:** ① *The Multiplication Bridge* (NUMBER-PATH over lava: called table, e.g. step only on multiples of 7) ② *The Classification Gate* (living-things key puzzle) ③ Digger secret in the root tunnels ④ *Eruption Escape* (auto-scroll climb) ⑤ *Temple Guardian Duo* (two mini-bosses sharing a moveset with opposite traits — the Bruno/Bastion lesson, replayed small) ⑥ **Countess Calcula** ⑦ bonus.

### 7.8 W8 · SKY CITADEL (finale)
*Vex's clockwork sky-fortress among thunderclouds; the Know-It-All Engine's cables everywhere. Palette: gunmetal/storm blue/warning amber.*
A curated 30–40 minute gauntlet remixing one beloved beat from every world (quake plates, gear rides, polarity halls, steam vents, beam corridors, truss gaps, number bridges) + CIRCUIT-IT sabotage stations, ending in the **General Vex** fight (§6.7). One fossil: *The Final Star*. Companions all get a hero moment scripted here.

### 7.9 The hub (Dino Plaza) — see §4.5; hides 3 fossils of its own (one behind Marcus's numeral scoreboard, one via Digger's garden mastery, one atop the plaza — pure platforming).

### 7.10 Door pacing

| World | W1 | W2 | W3 | W4 | W5 | W6 | W7 | Vex Gate |
|---|---|---|---|---|---|---|---|---|
| Fossils needed | 0 | 4 | 9 | 14 | 20 | 26 | 32 | **38** |

---

## 8 · Audio, music & speech tech

### 8.1 Buses & mixing
`music` / `sfx` / `voice` buses with independent sliders; music auto-ducks −6 dB under voice; combat layer crossfades in when enemies aggro.

### 8.2 Music & SFX
Original only. Procedurally-generated chiptune/synth loops are acceptable and encouraged (compose per-world briefs: W1 bouncy desert marimba · W2 clockwork waltz · W3 crystal arpeggios · W4 water-wheel folk · W5 music-box nocturne · W6 sea-shanty brass · W7 jungle drums & organ · W8 storm orchestral-synth · hub: warm ukulele). Character audio signatures: Kenji marimba blip, Marcus timpani hit, Digger slide-whistle, Vex detuned music-box. Core SFX set (~25): jumps, stomps, chomps, roar, fossil fanfare, correct/incorrect (gentle!), UI, per-world ambience.

### 8.3 Speech (TTS) — every line spoken

`VoiceProvider` interface: `speak(line, profile, opts) / stop / onEnd`. Ship three implementations:
1. **WebSpeechProvider (default):** browser `speechSynthesis`. Per-character profiles from `/content/characters.json` — select best available voice by language/name heuristics, then shape with rate/pitch: Max (rate 1.1, pitch 1.3), Kenji (0.95, 1.0), Marcus (0.9, 0.7, volume max), Digger (1.15, 1.15, prefer an `en-AU` voice when present), Vex (0.85, 0.8), bosses each defined in their voice packs. Queue-safe, interruptible, `onEnd`-driven so dialogue timing works.
2. **NullProvider:** silent fallback (subtitles carry everything).
3. **ElevenLabsProvider (stub):** implemented behind `VITE_ELEVENLABS_KEY`; documented in `AUTHORING.md` as the premium upgrade path. No key = never loaded.
Settings: voice on/off, speech speed global multiplier, "read menus aloud" toggle. TTS unavailability must degrade gracefully to subtitles with zero errors.

---

## 9 · UI/UX, saving, accessibility, Grown-Ups' Corner

### 9.1 HUD & menus
Diegetic-leaning HUD: hearts, Amber Chip count, Brain Power meter, fossil counter. Pause menu: fossil constellations (mastery), map, settings, "Ask Digger" (context hint, spoken). Fossil-select on world entry (§4.4). Big fonts, high contrast, controller-first navigation, everything TTS-readable.

### 9.2 Difficulty (framed positively, changeable any time)
**Explorer (default):** assist on — +1 heart, boss windups ×1.5 slower, checkpoints between boss phases, infinite kind retries. **Hero:** standard. Never label anything "easy mode".

### 9.3 Accessibility (launch requirements, not stretch goals)
Dyslexia-friendly font toggle; colour-blind-safe palettes and never colour-only signals (shape+sound always paired); subtitle size options (cannot fully disable); hold-vs-toggle for all holds; camera sensitivity/invert; reduce-shake and reduce-flash toggles; one-handed-friendly default bindings + full rebinding; all questions spoken aloud (§5.1.6).

### 9.4 Saving & Grown-Ups' Corner
3 save slots (localStorage) + export/import as a JSON file. **Grown-Ups' Corner** behind a hold-3-seconds gate: per-topic mastery stars with plain-English summaries ("Confident with ×4 tables; finding equivalent fractions tricky — Fraction Falls's mill is great practice"), playtime, session-length gentle reminder option, save management. No internet, no accounts.

---

## 10 · Build plan — phases & acceptance gates

Work strictly in order; commit per phase (`P3: dialogue & voice engine`). Standard commands: `npm run dev | build | typecheck | validate | test:ai | test:smoke`. **A phase is done only when its gate passes; log evidence in DEVLOG.md.**

- **P0 · Skeleton:** Vite+TS+Three boot scene, engine module stubs, content loader + ajv + all JSON schemas, string table, event bus, CI script (`typecheck && validate && test`), docs files created. *Gate: `npm run dev` renders a lit spinning placeholder Max at 60 fps; `validate` passes.*
- **P1 · Movement & feel:** full move set (§4.1), camera rig, a graybox playground level, squash-and-stretch, particles v1. *Gate: coyote/buffer verified by unit test; playground fully traversable; 60 fps with 1,000 instanced objects.*
- **P2 · Dialogue & voice:** dialogue engine, bark scheduler, no-repeat memory, subtitles, TTS providers + character profiles, first 30 lines per companion. *Gate: demo scene where all four heroes converse; no-repeat proven by test; TTS toggle + graceful degradation works.*
- **P3 · Hub & persistence:** Dino Plaza, doors + gating, fossil select, Amber Chips, save/load/export, settings + accessibility v1. *Gate: collect hub platforming fossil, quit, reload — everything persists.*
- **P4 · Education engine + W1 (vertical slice):** task engine, archetypes SORT-IT/MEASURE-IT/NUMBER-PATH/QUICK-FIRE, adaptive tiers, mastery, Grown-Ups' Corner v1, **Fossil Canyon complete except its bosses**, W1 question packs. *Gate: a real 7-year-old-shaped playtest script: 25 min of W1 playable start-to-finish with spoken questions, warm failure loop verified.*
- **P5 · Combat & the AI framework:** combat feel, Cogling archetypes, boss runtime (traits/utility/triggers/phases/fairness governor), **Bruno + Dame Bastion defined now** (Bastion's world can wait; her data can't), W1 mini-boss + Bruno fight, Quiz Orbs. *Gate: `test:ai` passes all four proofs in §6.6; Bruno beatable on Explorer by a cautious button-masher.*
- **P6 · Worlds 2–4:** BUILD-IT/CIRCUIT-IT/FRACTION-FORGE/SHADOW-IT archetypes, gadget workshop (Spring Boots, Magno-Mitt), W2–W4 complete with mini-bosses + Cogwheel/Magno/Slice&Dice, café opens with freed champions' games. *Gate: full playthrough W1→W4; every archetype demonstrated; validate/test green.*
- **P7 · Worlds 5–7:** Lantern Buddy, day-night W5, W5–W7 complete + Nightshade/Bastion/Calcula, banter pass, music pass all worlds. *Gate: Nightshade's beam-counter teachable without text instructions (Kenji hints suffice); full W1→W7 playthrough.*
- **P8 · Finale & polish:** Sky Citadel + adaptive Vex + ending + credits (every freed champion waves goodbye), balancing pass, performance pass (budgets §2.5), accessibility audit, Grown-Ups' Corner final, AUTHORING.md worked example (§11), Playwright smoke suite (boot → new game → hub → enter W1 → answer one spoken question → save/reload; zero console errors). *Gate: the full Definition of Done, §13.*

---

## 11 · Expansion kit (make growing the game trivial)

`docs/AUTHORING.md` must let a motivated non-programmer add content. Include a complete worked example: **"World 9: Circuit City"** (electricity-themed) authored in the doc but not built. Recipes to document and honour:

- **New world:** add `levels/w9.json` + question packs + enemy/boss refs + strings + music ref → appears automatically (registry is data). `npm run validate` confirms.
- **New boss:** one BossDefinition JSON + optional new moveset JSON + voice pack. Traits do the personality work — document "recipes" (e.g., *coward-king: agg .2 / tri .8 + flee-and-summon moves*).
- **New question pack:** drop into `questions/`; schema + `validate` guard correctness; adaptive system picks it up by topic id.
- **New task archetype:** the one code-touching path — implement `TaskModule`, register, document.
- **New companion or voice:** characters.json + voice profile + delivery pools.
- **Difficulty re-tuning:** everything in `config.json`.

---

## 12 · Decision defaults (apply, log in DEVLOG, never stall)

Art → primitives + shaders, no external assets. Audio → procedural/original. Scope pressure → cut polish, never systems; cut a bonus fossil before a mechanic. Ambiguity → simplest kid-fair reading. Text → British English; metric units; £. Content → G-rated always; battles are bonks, dizzy-stars, and freed friends — no death, no blood. Names → keep as placeholders in content files (easy for the family to rename). Anything web-external at runtime → no (fully offline except optional ElevenLabs key).

---

## 13 · Definition of Done (final checklist — verify every line)

- [ ] 7 themed worlds + hub + Sky Citadel finale, all completable; 52 fossils placed; door pacing per §7.10.
- [ ] Every world pairs platforming with Year 3/4 science, maths, and engineering tasks per the matrix (§5.2); all 8 task archetypes shipped; ≥10 questions per topic per tier; hints + explains everywhere; adaptive tiers + mastery + spaced repetition live.
- [ ] Boss personality framework: traits + utility AI + data triggers; **Bruno vs Dame Bastion share a sword-and-shield moveset yet fight opposite** (divergence test green); **Nightshade cloaks below 40% HP** (trigger test green); Vex adapts to the player; all 8 bosses + 7 mini-bosses distinct; `test:ai` fully green.
- [ ] Voice: four heroes + villain + bosses with distinct written voices meeting the representation rule; delivery pools at minimum sizes; no-repeat memory working; questions rotate speakers; every line spoken via TTS with per-character profiles and graceful fallback; subtitles always.
- [ ] Companions present throughout: Kenji (engineer, Osaka), Marcus (Roman gladiator), Digger (Australian Cattle Dog) — following, teaching, bantering, coaching in battle.
- [ ] Kindness guarantees: warm failure loop, no game-over, Explorer assist default, accessibility list (§9.3) complete.
- [ ] Expandability proven: content-only world addition verified; AUTHORING.md with worked example; schemas validate everything.
- [ ] 60 fps on target hardware; smoke suite green; zero console errors; DEVLOG complete.

**Now begin: execute Phase 0.**

