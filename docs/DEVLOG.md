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
_(pending)_

## P2 · Dialogue & voice
_(pending)_

## P3 · Hub & persistence
_(pending)_

## P4 · Education engine + W1
_(pending)_

## P5 · Combat & AI framework
_(pending)_

## P6 · Worlds 2–4 (this build: W2 complete — stop point for "end of World 2")
_(pending)_
