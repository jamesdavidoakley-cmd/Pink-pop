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
| `node scripts/boot-check.mjs http://localhost:5174 shot.png` | Headless boot: zero console errors, engine replies, screenshot |
| `npm run electron` | Run the desktop shell against `dist/` |
| `npm run dist` | Build desktop installers for this OS into `release/` |

Downloadable installers for Windows, macOS and Linux are built by the `king-hunt-release` GitHub Actions workflow on every tag `king-hunt-v*`.

## Content

- `content/puzzles/*.json` — 31 attack-themed packs derived from the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0). Rebuild with `python3 scripts/build-puzzles.py <lichess_db_puzzle.csv.zst>` (needs `pip install zstandard`).
- `content/ladder.json` — the attack curriculum: rungs, their packs and the bot each rung punishes.

## Licences

Game code and content: all rights reserved (private project). Stockfish 17.1 (lite-single WASM build by Chess.com / nmrugg) is GPLv3 and shipped unmodified as separate files under `engine/`. Lichess puzzles are CC0.
