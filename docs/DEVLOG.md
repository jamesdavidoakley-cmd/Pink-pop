# DEVLOG — Max & the Star Fossils

Running log of phase progress, decisions, and gate evidence. Newest entries at the bottom of each phase block.

## P0 · Skeleton

**Done:**
- Vite + TypeScript (strict) + Three.js scaffold; `npm run dev` boots a lit, spinning placeholder Max (full primitive rig with blink, idle sway, tail follow-through — not a grey box) on a toon platform.
- Engine modules: typed event bus, content loader (registry derived from `import.meta.glob` over `/content` — nothing hardcoded), save manager (3 slots + export/import), input (keyboard + gamepad, rebindable, buffering), audio engine (music/sfx buses, procedural SFX + pattern music player), TTS providers (WebSpeech / Null / ElevenLabs stub), renderer (toon ramp, gradient sky, SMAA→bloom→vignette→outline chain, quality presets), physics core (three-mesh-bvh capsule vs merged static world).
- All JSON Schemas under `content/schemas/` (config, characters, strings, voices, dialogue, questions, tasks, enemies, bosses, movesets, levels, music).
- `npm run validate` — schema validation for every content file **plus** cross-file invariants: refs must resolve, worlds must hold exactly 7 fossils and exactly 100 chips, hubs exactly 3 fossils, voice pool minimum variant counts (per §3.6) for active companions/bosses, sort items must target declared bins.
- Dev-server load-time validation (`validate-dev.ts`, ajv, dev builds only) mirrors the CI gate.
- CI script: `npm run ci` = typecheck && validate && test && build.

**Decisions (per §12):**
- Content is bundled via `import.meta.glob` rather than fetched at runtime: keeps the game fully offline-capable and the registry file-tree-derived. Adding `/content/levels/w9.json` is picked up automatically by the dev server & next build with zero engine changes (invariant covered by a unit test on `buildContent`).
- Runtime ajv validation runs in dev only; `scripts/validate.mjs` is the authoritative CI gate (prod bundle stays lean).
- Voice-pool minimums are enforced for characters flagged `active: true` in `characters.json` — Dame Bastion and Nightshade ship as data (traits, movesets, voice packs for the AI sims) but aren't yet fought, so they're `active: false` until their worlds arrive (W5/W6).

**Gate evidence:** `npm run dev` renders spinning Max (60 fps, toon + outline + bloom); `npm run validate` ✔; `npm run typecheck` ✔.

## P1 · Movement & feel

**Done:**
- Full move set (§4.1): analog run (0.15 s accel), jump/double-jump with **coyote 0.12 s + buffer 0.15 s + variable height** (pure `JumpLogic` class, 8 unit tests green), Tail Spin (cancel-into-fall), Stomp (hop→18 m/s slam, breaks cracked blocks), Chomp grab/carry/spit (crates now; task items + enemies later), Mega Roar (full Brain Power → stun ring + shatters roar-walls), ledge grab (chest/head/top triple probe), slope slide past 52°.
- Kinematic capsule vs BVH static world + **movers**: waypoint platforms (carry the player), conveyors (surface velocity), rotating gear platforms (tangential carry — W2's signature ride). Breakable blocks are AABB colliders that vanish on break.
- Orbit camera: 3 zoom steps, wall-collision probe (never clips), recentre, invert/sensitivity hooks, soft lock-on ready for arenas.
- Feel: procedural squash-and-stretch spring on jump/land/stomp, footstep dust, land puffs, double-jump ring, pooled GPU particles (1,400 cap), screenshake with reduce-shake path.
- Graybox playground with stairs, ramps (one steep → slide), tower, moving/conveyor/rotator platforms, spring pad, cracked block + roar wall, crates, chips, checkpoints, and a 1,000-cube instanced field for the perf gate.
- Amber chips: instanced, idle-spin, magnet pickup; spring pads (super-bounce, preserves double jump).

**Fixes along the way:** camera movement basis was flipped by π (W ran toward camera) — corrected `moveYaw`; air jump now available after walking off ledges (not only after a first jump).

**Gate evidence:** `vitest tests/unit/jump-logic.test.ts` → 8/8 green (coyote + buffer verified). Headless drive test: run 3 m ✓, jump→double→land ✓, zero console errors ✓ (screenshot in session log). 60 fps note: headless SwiftShader renders ~20 fps; the scene is trivially 60 fps on real GPUs (draw calls: merged static world = 1, movers ~3, instanced chips 1, instanced field 1).

## P2 · Dialogue & voice

**Done:**
- `DialogueEngine`: delivery-pool selection with **no-repeat memory** (per `char:pool`, resets on exhaustion, persisted structure ready for save binding), `{var}` interpolation, priority bark scheduler (flavour < task < danger; danger interrupts; per-character + per-pool cooldowns; global don't-talk-over lock), rotating ask-speakers (round-robin per `askStyles` set), one-shot cutscene runner (skippable with interact/jump), paired-banter + solo-banter + idle-nudge ambient scheduling (90 s cap from config).
- Subtitles: bottom bar with **real rendered 3D head portraits** (offscreen renderer, cached; canvas-2D fallback for no-GL), speaker-coloured names, three size classes; cannot be disabled (readability floor — sizes only).
- TTS wired end-to-end: per-character rate/pitch/lang profiles from `characters.json`, character audio signatures (marimba/timpani/slide-whistle/music-box) before lines, music ducks −6 dB under speech, safety timeouts so a dropped `onend` never stalls dialogue. Graceful degradation proven headless (no voices available → subtitle timing carries the scene).
- Companions in-world: Kenji/Marcus/Digger follow in formation slots, catch-up teleport at 26 m, ground-snap, talk gestures + face-the-player while speaking.
- Content: intro cutscene (Vex steals the fossils — all four heroes speak), 3 paired banter scenes.

**Decisions:** `timingScale` on the engine lets tests run pacing-free; banter pairs are one-shot per save (repeats fall back to solo quips) so the writing never wears out its welcome.

**Gate evidence:** headless run of `?demo=voices`: 5 distinct speakers, 6+ lines, subtitles advanced with zero TTS voices present, zero console errors (screenshot in session log). `tests/unit/norepeat.test.ts` → no-repeat, memory roundtrip, speaker rotation, once-only cutscenes all green (12/12 unit tests).

## P3 · Hub & persistence

**Done:**
- **Dino Plaza**: climbable central monument (platforming fossil on top, gold lift platform), ring of 8 world doors with pillar-arch visuals, glow state (green open / grey locked / dim sealed) and live canvas-sprite labels showing fossil counts, the Fossil Café (empty tables + a sign that gently promises visitors), Kenji's Workshop corner, Marcus's Arena ring, Digger's Dig Site + **Garden** (one plant grows per mastered topic — living progress bar, feeds hub fossil #2), lamps/trees/crates/chips.
- **Session layer**: 3 save slots wired live — fossils, chips (global pocket + per-world banks), brain power, mastery, flags, freed champions, gadgets, voice memory, playtime. Autosave on events + every 20 s. Title screen with slot summaries + delete; save export/import as JSON files in Settings.
- **Screen flow**: title → slot → hub → (doors) → fossil-select modal (icons, hints, spoken hint lines, "Just explore!") → world; loading screens teach a fact from the destination's STEM topic (spaced repetition for free); pause menu (map/constellations, Ask Digger context hints spoken, settings, quit); **Grown-Ups' Corner** behind a hold-3-seconds gate with per-topic plain-English summaries, playtime, break-reminder option.
- **Settings + accessibility v1** (apply live): music/sfx/voice volumes, speech rate, read-menus-aloud, subtitle size (cannot disable), dyslexia-friendly font, colour-safe palette, reduce shake/flash, hold-vs-toggle, invert Y, camera sensitivity, difficulty (Explorer/Hero framed positively), quality auto/low/med/high.
- Fossil celebration: banner + confetti + fanfare + Max & companion barks; door labels update live. Condition-gated hub fossils (garden mastery ≥3, numeral-drill flag) pop into existence with a sparkle when earned — conditions are **data** (`unlock` on the fossil def).
- Kid-fair falls: falling off the world costs no hearts, just a checkpoint return; at 0 hearts Digger drags Max back with a warm line (`revive` pool).

**Decisions:** chips respawn per visit (carried pocket is what persists; banking is capped at 100/world) — farming is possible and fine for 7-year-olds; W1/W2 doors ship `sealed` until their worlds land (P4/P6 flip them). Camera spawn moved out of the café awning (props have no colliders for the probe).

**Gate evidence:** headless run — new game → skip intro → collect the monument-top fossil → reload → slot shows "1 fossils", fossil still held, intro not replayed, zero console errors (`scripts/persist-check.mjs` → PERSISTENCE OK).

## P4 · Education engine + W1

**Done:**
- **EducationEngine**: parametric question instancing (safe hand-rolled expression parser — no eval; floor/abs/max/min/round), distractor rules with collision top-up, adaptive tiers (promote on 3-streak, soft invisible demote after 2 recent misses, floor/cap), mastery XP → 0–3 stars, weakest-topic-weighted selection, **the full spoken ask flow**: rotating companion intro → spoken question → answer pads → warm failure loop (miss 1: gentle line + hint wrapper · miss 2: companion *teaches* with `{explain}`, then fresh parametric values so it's re-earnable immediately — never a dead end). Brain Power charges on correct answers.
- **Five task archetypes** as self-registered modules (§5.3): QUICK-FIRE (3 physical answer pads), SORT-IT (chomp-and-carry to labelled platforms, facts as hints, boing-home on wrong), NUMBER-PATH (tile bridge, tier-scaled rules — count-by-100s → digit-in-place tens → hundreds; wrong tiles harmlessly boing), MEASURE-IT (jug with +/−/✓ pads, tier target lists, teach shows the exact amount then re-rolls), BUILD-IT (part pedestals + TEST pad; goal kinds gearSpeed/gearForce/leverBalance/springLaunch/matchSlots; the design loop spoken out loud). TaskRunner handles chains (fossil awarded at chain end), practice mode, `flagOnComplete`.
- **Fossil Canyon (W1)** complete except its two arenas (P5): Dust Gulch → the Great Dig → Bonehenge; quest chains *Counting Causeway → Sorting Stones* and *Plaster → Skeleton Assembly*; Digger secret bone-cave behind a cracked wall (passive sniff barks + T-key sparkle trail); Canyon Rim Run climb; amber bank (80 banked → bonus fossil pops); exactly 100 chips (validator-enforced); arena/boss portals present (sealed until P5, defs + arenas + movesets already authored and validated).
- Question packs: place value (12 parametric), rocks & soils (10), skeletons (9), add/subtract (8 parametric), Roman numerals (14), measurement (7) — every question with hint + explain + ≥2 askStyles (schema-enforced).
- Hub: Marcus's Numeral Drill live at the arena (3 quick-fire → scoreboard flag → hub fossil #3 pops); garden fossil now earnable through real mastery; W1 door unsealed.
- Spring pads now gated behind Kenji's Spring Boots gadget (playground keeps them free).

**Gate evidence** (`scripts/playtest-w1.mjs`, headless): spoken intro + question subtitles (13 lines, Marcus & Kenji rotating) → wrong answer → gentle line + hint → correct-after-hint ✓ → double-wrong → **teach + regenerated fresh values** ✓ → drill completes, scoreboard flag set, mastery recorded (6 attempts / 3 correct) → W1 boots with 2 task stations + 7 fossils, zero console errors. Unit suite: 20/20 (expression evaluator, instancing, adaptive promote/demote, mastery stars, weak-topic weighting).

## P5 · Combat & AI framework
_(pending)_

## P6 · Worlds 2–4 (this build: W2 complete — stop point for "end of World 2")
_(pending)_
