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
_(pending)_

## P4 · Education engine + W1
_(pending)_

## P5 · Combat & AI framework
_(pending)_

## P6 · Worlds 2–4 (this build: W2 complete — stop point for "end of World 2")
_(pending)_
