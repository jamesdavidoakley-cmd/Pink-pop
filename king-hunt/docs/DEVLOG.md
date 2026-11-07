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

## P3.1 — Quicker questions (2026-11-07)

James, after playing the hosted build: the why-questions drag. Now **paced and skippable** (`src/game/questions.ts`):
- **Quick** (default): "what is the king's problem?" is asked on the first puzzle of a sitting, then every third puzzle, and again after any miss. "Why did that work?" is asked until he has named the principle right twice on the rung, and whenever he needed hints. Otherwise the why goes past as one coach line and play continues.
- **Every puzzle** and **Off** are available from a toggle on the home screen (Off still explains, never asks).
- Every question has a Skip. Follow-up cards auto-advance with a thin timer bar (sized to the text's reading time) and can still be tapped through. The recipe ledger keeps its question (it is the calculation step) but offers "Just play it", and the ledger then shows briefly instead of blocking.
- Saves record principle answers per rung and the last five why results; older saves load with defaults.
Tests 40/40; puzzle, recipe, daily and boot checks OK; republished.

## P3.2 — Fits every screen (2026-11-07)

James on a phone: the board overflowed the screen and the question card sat on top of what was left.
- The camera is now framed from the screen's aspect: phones look more top-down, and the vertical FOV is derived from the horizontal angle the board needs at the camera's distance, so the whole board always fits (never narrower than 44°).
- Cards anchor to the bottom of the screen. While one is open the projection renders the bottom of a taller virtual frame (`setViewOffset` with the full frame's aspect), lifting the board above the card: by the card's height on portrait screens (capped at half the screen), by a little on wide screens where the far rank already sits near the top bar. Smaller card type and padding under 640px.
- Checked at 412×915, 820×1180 and 1280×800 with the question open. Republished.

## P4 — Cinematic layer (2026-11-07)

James: "needs to be more exciting, cut scenes, very cinematic."

**Built**
- **Camera director** (`src/board3d/director.ts`): shot lists with easing, holds and FOV changes; shake and punch-in; runs on wall-clock time so cut scenes last as designed on slow devices; tap anywhere to skip; hands control back to the normal framing when done.
- **Moments** (`src/game/moments.ts`), called by every mode at its beats:
  - *Intro*: letterbox bars, a low sweep from the far side round to behind the player's army, under a slammed-in title (rung, recipe, bot, or "Paris Opera, 1858 · Morphy vs Duke of Brunswick").
  - *Sacrifice*: piece animation at 22% speed, camera push-in on the landing square, shockwave, thud, orange flash, shake. Fires on recipe bait moves, hero sacrifices in replays, and in live games when a ledger opens.
  - *Check*: red edge pulse, sting, small shake.
  - *Storm*: clouds gather over the enemy king as the attack score passes 60 and lightning strikes now and then at the top of the scale, with thunder and a flash.
  - *Checkmate*: close-up on the king, lightning strike, the king topples toward the attacker, shockwave, "CHECKMATE" title with fanfare while the camera orbits the fallen king.
  - *Hit* (puzzle solved, plan step landed): chime and punch-in. *Rung unlocked*: flash and title.
- **Effects** (`src/board3d/fx.ts`): captured pieces shatter into shards that bounce and fade; shockwave rings; jagged additive lightning with a point-light flash; sprite storm clouds; drifting dust motes for ambience.
- **Sound** (`src/audio/sfx.ts`): everything synthesised with WebAudio (no assets): move, capture, check, thud, whoosh, thunder, chime, fanfare, wrong. Unlocked on the first pointer down; *Sound: on/off* toggle on the home screen, saved.
- `prefers-reduced-motion` shortens every moment to a title only, with no shake or slow motion.

**Decisions**
- Piece animation uses a `timeScale` on the view's tween clock, so slow motion affects only the pieces while cards, timers and the director run at normal speed.
- Delayed capture effects carry a board generation and are dropped if the position was reset in between (switching modes mid-animation used to leave shards behind).
- Headless checks now wait for the mover to be live (after the intro) instead of the session merely existing.

**Gate evidence**
- typecheck clean · 40 tests · boot, puzzle, audit, recipe, replay, daily checks OK after the cut scenes were added · frames captured of the intro, sacrifice and mate moments. Republished.

## P4.1 — Living stone: fights, the escape tour, models and audio (2026-11-07)

James: "like wizard chess" and, mid-build, "when it does the little video for checkmate, show where the king can try to move and why it can't, with the pieces, in the same cinematic mode."

**Built**
- **Fights.** A capture is now a fight: the attacker slides up beside its victim (dust at departure), winds up, strikes, and the victim shatters into rubble that flies away from the blow; then the attacker settles onto the square. Each piece fights its own way (`strikeStyle`): pawns and kings *shove*, knights rear up and *stomp*, bishops *slash* with a sweeping spin, rooks *smash* with a straight battering charge, queens rise and *chop*. When the victim is worth a minor piece or more and cinema is at full, the camera dives to board level for the blow at half speed. Replies wait for the fight to finish (`view.whenIdle`).
- **The escape tour** (`src/chess/mate-explain.ts`, in the mate cut scene). After the close-up, the mated king looks for a way out: for each escape square a red ghost king slides there (or bumps into its own blocking piece), the covering piece lights up with a beam to that square, and a caption says why: "f8? The rook on a8 sees it." "g7? His own pawn is in the way." "Take the knight on h7? The bishop on d3 guards it." Then the checker: cannot be taken (pinned taker named) or blocked, or two checks at once. Up to five beats, tap to skip, then the lightning, the topple and the title. Lines through the king's own square are found by analysing the position with the king removed. Tested on back-rank, scholar's and smothered mates.
- **Models.** Lathe profiles at 40 segments; the king has a crown ring with studs under the cross; the queen eight crown points and a pearl; the bishop a mitre slit and finial; the knight eyes and a mane; rooks keep their battlements. Sandstone and basalt materials with a fine procedural grain (bump only; a roughness map streaked along the lathe and was removed). Pieces wake when picked up: lift and a warm glow.
- **Arena.** Four flickering torches with warm point lights, deeper fog, stone-grained tiles, stronger bloom, drifting dust.
- **Audio.** Stone slide for moves; per-piece swings (groan, rising whoosh, charge rumble, long overhead whoosh) and strikes (double thud, crack-and-ring, the big crunch, split stone); creak on the wind-up; the tour uses the "wrong" buzz for each failed escape and the check sting for the checker.
- **Settings.** *Cinema: full / light / off* on the home screen (light keeps effects but the camera stays put).

**Decisions**
- Piece animation runs on wall-clock time (capped at 0.25 s a frame) so fights and the tour keep their timing on slow devices; shard physics stays on the capped simulation step.
- The headless checks now allow much longer waits: software rendering with torches, particles and bloom runs a few frames a second, so cut scenes take several times longer there than on a real GPU. That is a harness property, not a game one, and is noted in each script.

**Gate evidence**
- typecheck clean · 44 tests (incl. mate-explain) · boot, puzzle, audit, recipe, replay, daily checks OK · frames: model close-up, a queen's chop frozen mid-fight.

**P4.1 addendum.** Victims brace (lean away) during the attacker's wind-up; moves slide with weight and squash on landing; the side to move breathes (a 1% pulse, staggered per piece); every piece stands on a sculpted plinth ring; a very quiet arena bed (wind and torch crackle) starts with the first tap and follows the sound toggle.
**Finding: faceted shading.** The pieces had shown vertical shading bands since the stone pass. Not geometry (normals tested smooth per triangle and around a ring), not bump, not shadows, not the torches: swapping geometry and material between a real pawn and fresh test meshes pinned it to the merged lathe geometry, and the cause was `computeVertexNormals()` overriding LatheGeometry's analytic normals. Removed; pieces are smooth again. Parts now merge through BufferGeometryUtils so UVs and normals survive.

**Coordinates.** James: "make it so the board is labelled, i.e. b2, as often we're not sure where." Camera-facing letter and number sprites sit on the frame along all four edges (so they read from either side), and the labels of any highlighted square light up amber, so "f7" in a caption is also visibly f and 7 on the board.

**The execution.** James: "show the piece taking the king, not just how it can't move." After the escape tour the checking piece now walks over, winds up and strikes the king in its own style; the king bursts into rubble, the attacker takes the square, lightning and the title follow. A caption names it ("The rook on a8 takes the king."). Found and fixed on the way: on slow frames the strike's short blow phase could be stepped over and the impact never fired (the victim stayed, and the cut scene waited forever); impact is now guaranteed by time, not by phase.

## P4b + P5 — Voice, graphics presets, installers (2026-11-07)

**Built**
- **Voice coach** (`src/audio/voice.ts`): the browser's speech synthesis reads every coach line and cut-scene caption (square names spoken as "F 7"), preferring an en-GB voice, cancelling the previous line when a new one arrives, silent where speech synthesis is missing. *Voice: on/off* on the home screen.
- **Graphics presets** (`src/board3d/quality.ts`): *auto* detects phones and small machines (touch + small screen, ≤4 cores or ≤4 GB) and uses the low preset: pixel ratio 1.25, 1024 shadow map, softer bloom, 50 dust motes, 8 clouds, two lit torches, no SMAA. High keeps everything. *Graphics: auto/high/low* on the home screen (reloads to rebuild the renderer).
- **Installers**: `build/icon.png` (generated), `publish: null` and repository metadata so electron-builder runs without a publish provider; `--smoke` flag in the Electron main process. The **Linux AppImage builds here** (118 MB) and the Electron shell loads the game under a virtual display ("smoke ok: page loaded"). Windows needs wine and macOS needs a Mac, so those build in the `king-hunt-release` GitHub Actions workflow on every `king-hunt-v*` tag.

**Gate evidence**
- typecheck clean · 44 tests · boot and puzzle checks OK · AppImage built · Electron smoke OK.

**Mate camera, fitted.** James on a phone: "camera still too close, a bit further out so we can see where the king tries to go." Fixed distances could never suit every mate (a back-rank rook is seven squares away; a smothered knight is next door) or every screen, so the mate shots now use a *fit* camera: it frames the king's 3×3 zone plus the checker and every piece covering an escape, from a chosen angle and elevation, and sizes the shot to the narrower field of view. On portrait it widens the lens (up to 82°) rather than retreating into the fog, which an earlier attempt did. Used for the close-up, the tour drift, the execution and the final orbit; sacrifice and strike dives pull back a little on portrait too.
