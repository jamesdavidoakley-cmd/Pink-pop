# DEVLOG

## P0 — Skeleton (2026-11-07)

**Built**
- Vite + TypeScript strict + Three.js + `postprocessing` boot. Dark stage, cream/teal board, bloom, vignette, soft shadows.
- Procedural low-poly pieces (lathe profiles; knight is an extruded horse-head silhouette; rook has battlements).
- `Rules` wrapper over chess.js; click-to-move and drag-to-move; capture fade; castling rook animation; auto-queen promotion.
- Stockfish 17.1 lite-single WASM in a Web Worker (`scripts/copy-engine.mjs` copies it into `public/engine/` at install/build).
- **Attack Lens** (`src/chess/attack-lens.ts`): king-zone pressure, fire lines, loose targets, mate-in-one detection, development, castling → 0–100 score; `describeDelta` coaching lines.
- Visual layer: heat map (warm = ours, cold = theirs on our king), fire lines, pulsing danger ring under the enemy king.
- HUD: attack meter, coach line, status, New game.
- One soft bot (Pawnsworth): Skill 0, depth 3, random among lines within 250 cp.
- Puzzle packs: 12,400 puzzles across 31 attack themes from the Lichess CC0 database (`scripts/build-puzzles.py`), rating 400–1500, ≤ 7 plies, popularity ≥ 85.

**Decisions**
- Lives in `king-hunt/` inside this repo for now (session is scoped to this repository). Zero imports from the platformer; splits cleanly into its own repo with `git subtree split -P king-hunt`.
- Lite single-threaded Stockfish rather than the 75 MB multi-threaded build: no cross-origin-isolation headers needed, so it works from Electron and any static host, and it is still far stronger than any bot we will field.
- Human plays White in P0. Black play arrives with the bot roster.
- Promotion auto-queens in P0; a picker comes with puzzles (some solutions underpromote).
- Heat map only paints enemy territory and enemy pieces; painting our own half was visual noise.
- Playwright is resolved via `createRequire` because the pre-installed copy lives outside the project.

**Gate evidence**
- `npm run typecheck` clean. `npm test` 6/6. `node scripts/boot-check.mjs` → zero console errors, engine replies to 1.e4.

**Next (P1)**: puzzle mode on the ladder packs with the warm failure loop, promotion picker, rung progression and save.

**Mid-phase correction (same day)** — "teach him to become Tal, not just aim your pieces." The lens gained a *diagnosis* layer (`diagnoseKing`): back rank with no hole, boxed-in king, a zone square where attackers outnumber defenders, king stuck in the centre, open file beside the king, sole defender. The coach now leads with the mechanism and only then with what changed. `content/ladder.json` carries a `why` and one of five Tal principles per rung; `docs/DESIGN.md` §2 describes why-first puzzles, why-first debriefs and Tal replays. Tests: 12/12.
