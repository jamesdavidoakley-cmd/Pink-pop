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

## P1 — Why-first puzzles (2026-11-07)

**Built**
- Ladder reordered so *getting at the king* is taught from the start: 1 Finish him → 2 The weak spot (f7) → 3 Keep him in the middle → 4 Castle, then charge → 5 Rip the roof → 6 Bring everyone → 7 Back door → tactics as tools (8–10) → mating nets, deflection, zwischenzug, finishing (11–14). Every rung carries `idea`, `why` and one of the five Tal principles.
- **Puzzle mode** (`src/game/puzzle.ts`) on the Lichess packs: rung intro card (idea + why it works) → opponent's setup move → **"What is the king's problem?"** (diagnosis-based; falls back to "What is the idea here?" from the pack theme) → moves with escalating *mechanism* hints (1: restate the diagnosis and glow its squares, 2: name the piece, 3: show the move) → **"Why did that work?"** (pick the principle) → principle card → next. The attack meter is masked while a why-question is open so the board, not the HUD, gives the answer.
- Pure, tested cores: `PuzzleRunner` (Lichess move-list semantics, any mating move accepted on the last step), `progress.ts` (solves, first-tries, reveals, why-accuracy, day streak, rung unlock after 10 solves; `localStorage`).
- Home and Ladder screens, Back navigation, camera swings round for Black-side puzzles, promotion picker, shared `HumanMover` (click or drag) and `BoardView` (piece meshes, lens painting) used by both modes.
- Dev URLs: `?mode=play`, `?rung=<n>`.

**Decisions**
- Puzzle difficulty window widens with solves on the rung (first 40 easiest, +15 per solve) so a new rung starts gentle without a separate rating system.
- Distractors for the diagnosis question are deliberately Tal-wrong habits ("trade queens", "defend first", "nothing wrong yet") rather than other diagnoses, which could be accidentally true.
- `solved()` is not awaited from `humanMove` because it blocks on the player's answer; the headless check deadlocked until this was fixed.

**Gate evidence**
- `npm run typecheck` clean · `npm test` 18/18 · `boot-check` OK · `puzzle-check` drives rung card → why question → wrong move hint (leads with the diagnosis) → solve → principle → saved progress with `whyRight`.

**Next (P2)**: bots with flaws per rung (JSON), the spar debrief ("best attacking moment, one missed moment, why"), and the daily 15-minute session flow.

## P2 — Attack recipes, the payoff ledger, bots with flaws (2026-11-07)

**Why this phase changed shape.** Two corrections from James mid-build: (1) puzzles cannot teach the *trick*: getting castle-ready, offering a pawn so a capture opens the file, then walking in. That needs multi-move plans. (2) The game must teach **calculating the payoff** of a sacrifice, never reward giving pieces away.

**Built**
- **Attack recipes / Plan Lab** (`content/recipes.json`, `src/game/recipe.ts`): five plans on rails: the f-pawn lever (with the preparation step: chase the bishop that pins the f-pawn first), the Greek gift, Morphy's opera game, the Danish gambit's two roads, the h-pawn battering ram. Each player move has a prompt and a why; wrong moves get mechanism hints. Every bait step carries a **ledger** (`give`, `get`, `decoys`, `payoffPly`, `count`): he must answer *"you want to give X: what does it buy?"* **before** the sacrifice executes, then sees the full ledger. The lens verifies the payoff when it arrives ("Paid: pressure 18 → 25"). The plan ends with the payoff card and a **Try it live** game from the same position against a bait-taking bot.
- **Lens upgrade**: x-ray roads (`findXRays`): lines from our sliders to the king zone blocked only by our own non-pawn pieces. They score (the f-file lever's payoff is a half-open file, not an immediate attacker) and feed a new `open-file` diagnosis: "your rook on f1 sees f7 through your own knight, which can step aside with a threat".
- **Sacrifice auditor** (`src/game/auditor.ts`): when the player loses material, a ledger opens ("You gave 2. Now show me what it buys."). It settles as soon as pressure arrives, or at the end of a three-turn window, with Stockfish (depth 8) as truth-teller: **paid** (pressure arrived and eval holds), **gamble** (pressure arrived but it does not hold: "count their best defence before you give"), **giveaway** (nothing bought: "material is fuel, not confetti"). Giveaways are never rewarded by the meter.
- **Debrief** at game end: paid-for moment or best pressure gain, any giveaway, and one missed chance (engine's best vs his move on the last ten turns, explained with the diagnosis).
- **Bots with flaws** (`content/bots.json`, `src/game/bots.ts`): 12 named bots matching the ladder. Stockfish MultiPV candidates are re-scored by flaw features (greedy, blind, late castler, thin defence, roof pusher, no luft, huddle, queen trader, trader) and sampled; nothing outside the slack is ever chosen, so bots stay beatable, not suicidal. Play mode defaults to the current rung's bot.
- Home → Attack recipes screen; `?recipe=<id>` dev URL; `scripts/recipe-check.mjs` and `scripts/audit-check.mjs`.

**Decisions and findings**
- **The first Greek gift position was unsound.** Black's queen on e7 covered g5, so …Qxg5 refuted the knight check; the scripted defence was a blunder. Caught by the live auditor (verdict giveaway, engine -3.7) and confirmed with Stockfish at depth 16. Replaced with a position where Bxh7+ is the engine's first choice (+5.3) and the recipe now teaches the four Greek-gift conditions explicitly. The auditor doing its job on our own content is the best evidence the design is right.
- Ledger distractors are Tal-wrong habits, not alternative truths.
- A sacrifice's payoff can be several moves away (the lever: four plies), so both the recipe test and the live auditor use a window rather than a one-move check.
- The live audit check adapts to the bot's defence because a strong engine will not follow a script; the auditor's logic is unit-tested on fixed lines.

**Gate evidence**
- typecheck clean · 32 unit tests (recipes: every line legal, every player ply annotated, every bait raises pressure by its payoff ply) · boot-check, puzzle-check, recipe-check ×5, audit-check all OK.

**Next (P3)**: the daily 15-minute session (warm-up idea → three puzzles → one recipe or live game → debrief), Tal/Morphy/Anderssen guess-the-move replays with reasons, and more recipes including Black-side ones.

## P3 — Today's hunt, Great hunts, Black-side recipes (2026-11-07)

**Built**
- **Today's hunt** (`src/game/daily.ts`): the 15-minute session. Warm-up card (the current rung's idea, why and principle) → **Hunt** (three why-first puzzles on the rung, title shows "puzzle 2 of 3") → **Plan** (the rung's least-played recipe) on even days or **Spar** (a game vs the rung's bot, with debrief) on odd days → **Wrap** (minutes, puzzles, first tries, streak, what tomorrow unlocks). Each step is recorded in `progress.today`, so closing the app mid-hunt resumes at the right step. Home shows *Today's hunt · 15 min*, *Continue today's hunt*, or *Today's hunt ✓*.
- **Great hunts** (`content/replays.json`, `src/game/replay.ts`): guess-the-move through five classics, all verified legal: Morphy at the opera (1858), the Immortal (1851), the Evergreen (1852), Tal–Tringov (1964, the poisoned pawn) and Tal–Smyslov (1959, the bishop left hanging). The opening auto-plays with notes; at 8–10 key hero moves the player must find the move (hint → piece → reveal); every move carries its why and its principle. Finale card and saved tallies (found first time / asked).
- **Black-side recipes**: `scripts/mirror-recipes.mjs` mirrors a recipe's position, moves and text (squares flipped, colours swapped) so the same plan is learned from both sides. Generated: the Greek gift as Black (…Bxh2+), the battering ram as Black, the f-pawn lever as Black. The recipe test proves the mirrored lines are legal and their baits still pay off.
- Session hooks (`targetSolves`/`onComplete` on puzzles, `onGameOver` on play, `onFinished` on recipes and replays) so the daily controller can chain modes without the sessions knowing about it.

**Decisions**
- Recipes and replays that start from a FEN use "player plies alternate from whoever is to move in the start position" instead of assuming White moves at ply 0; the test and the session share the rule.
- Headless drivers fire `humanMove` without awaiting it: its promise runs the whole auto-play chain to the next question, and awaiting that inside `page.evaluate` made the replay check flaky.
- Plan/spar alternation is by the count of days played rather than the calendar, so a missed day never skips the plan step.

**Gate evidence**
- typecheck clean · 35 unit tests · boot, puzzle, recipe (incl. Black side), audit, **replay ×5**, **daily** (warm-up → three puzzles → spar started → resume after reload) all OK.

**Next (P4)**: voice coach (Web Speech API, graceful fallback), storm and lightning over a king under heavy pressure, sacrifice slow-motion, mate replay camera, a clarity pass on the pieces at small sizes; then P5 installers.
