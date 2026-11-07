# King Hunt

A 3D chess game that teaches a young player to **attack**. Pressure on the enemy king is rendered as heat, fire lines and a gathering storm; every move is scored by how much attack it creates. Defence is taught only as a way to set up the next attack.

See `docs/DESIGN.md` for the full brief and curriculum, `docs/DEVLOG.md` for progress.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5174
```

| Command | What |
|---|---|
| `npm run dev` | Play in the browser (hot reload) |
| `npm run build` | Static production build in `dist/` |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Unit tests (Vitest) |
| `npm run ci` | typecheck + test + build |
| `node scripts/boot-check.mjs http://localhost:5174 shot.png` | Headless boot into Play: zero console errors, engine replies, screenshot |
| `node scripts/puzzle-check.mjs http://localhost:5174` | Headless why-first puzzle loop: question → hint → solve → principle → saved |
| `node scripts/recipe-check.mjs http://localhost:5174 greek-gift` | Headless Plan Lab: hint → ledger question before the sacrifice → payoff → Try it live |
| `node scripts/audit-check.mjs http://localhost:5174` | Live-game sacrifice audit: a sound sacrifice is *paid*, a pointless drop is a *giveaway* |
| `node scripts/replay-check.mjs http://localhost:5174 opera-1858` | Headless Great hunt: guess loop with hints, finale, saved tallies |
| `node scripts/daily-check.mjs http://localhost:5174` | Headless Today's hunt: warm-up → three puzzles → plan/spar → resumes after reload |
| `node scripts/mirror-recipes.mjs` | Regenerates the Black-side recipes by mirroring the White ones |
| `node scripts/make-artifact-page.mjs` | After `npm run build`: writes `dist/artifact.html`, the page without a document skeleton, for hosts that wrap it themselves |
| `npm run electron` | Run the desktop shell against `dist/` |
| `npm run dist` | Build desktop installers for this OS into `release/` |

## Download / desktop

```bash
npm run build && npm run dist      # installer for this OS into release/ (Linux AppImage verified here)
xvfb-run npx electron . --no-sandbox --smoke   # headless smoke test of the desktop shell
```

Installers for Windows, macOS and Linux are built by the `king-hunt-release` GitHub Actions workflow on every tag `king-hunt-v*` (Windows needs a Windows runner or wine; macOS needs a Mac).

## Settings (home screen)

Questions (quick / every puzzle / off) · Sound · Cinema (full / light / off) · Voice · Graphics (auto / high / low).

Dev URLs: `?mode=play` boots into a game, `?rung=3` boots into ladder rung 4, `?recipe=greek-gift` boots into a recipe, `?replay=opera-1858` into a Great hunt, `?daily` into Today's hunt.

## Content

- `content/puzzles/*.json` — 31 attack-themed packs derived from the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0). Rebuild with `python3 scripts/build-puzzles.py <lichess_db_puzzle.csv.zst>` (needs `pip install zstandard`).
- `content/ladder.json` — the attack curriculum: rungs, their packs, why each works, and the bot each rung punishes.
- `content/recipes.json` — attack recipes (multi-move plans) with a payoff ledger on every sacrifice.
- `content/bots.json` — sparring bots: strength plus a flaw profile.
- `content/replays.json` — Great hunts: five classic attacking games with a why at every key move.

## Licences

Game code and content: all rights reserved (private project). Stockfish 17.1 (lite-single WASM build by Chess.com / nmrugg) is GPLv3 and shipped unmodified as separate files under `engine/`. Lichess puzzles are CC0.
