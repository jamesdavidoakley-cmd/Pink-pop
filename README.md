# Max & the Star Fossils

A joyful, fully-voiced 3D collect-a-thon platformer for ages 7–8, starring Max the blue T-Rex. Real KS2 (Years 3–4) science, maths, and engineering tasks earn Star Fossils; boss personalities emerge from a trait-driven utility AI. 100% original IP, offline, no accounts, no ads.

**Current build: through the end of World 2** — Dino Plaza (hub), Fossil Canyon (W1, Bruno Ironhide), and Gearworks Gorge (W2, Baroness Cogwheel), with the education engine (5 task archetypes), the boss personality framework + AI proofs, the dialogue/voice system, saves, and the Fossil Café.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

## Commands

| Command | What |
|---|---|
| `npm run dev` | Play in the browser (hot reload) |
| `npm run build` | Static production build in `dist/` (playable offline) |
| `npm run typecheck` | TypeScript strict check |
| `npm run validate` | Content gate: schemas + cross-file invariants |
| `npm test` | Unit + content + AI-behaviour tests (Vitest) |
| `npm run test:ai` | Just the boss-personality proofs (§6.6) |
| `npm run test:smoke` | Playwright boot→play→save smoke test |
| `npm run ci` | typecheck + validate + test + build |

## Docs

- `BUILD_PROMPT.md` — the master design/build brief
- `docs/DEVLOG.md` — phase progress, decisions, gate evidence
- `docs/AUTHORING.md` — add worlds/bosses/questions with zero engine changes
- `docs/CONTROLS.md` — keyboard & gamepad controls

Dev conveniences: `?level=<id>` boots straight into a level (e.g. `?level=playground`), `?slot=<0-2>` picks a save slot.
