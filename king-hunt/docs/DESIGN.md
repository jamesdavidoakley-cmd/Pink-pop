# King Hunt — design brief

**Deliverable:** a standalone, downloadable 3D chess game that teaches one young player (Max, 7–8, knows the basic moves, plays ~15 minutes a day) to be a fearless, effective **attacking** player. Defence appears only where it buys an attack.

Original IP, offline, no accounts, no ads, no chat. GPL components (Stockfish) are shipped as separate files under their own licence.

## 1 · Pillars

| Pillar | Meaning |
|---|---|
| **Attack is the score** | Win/loss is secondary. Every move is scored by how much pressure it creates on the enemy king and pieces. The game celebrates initiative. |
| **See the attack** | Pressure is rendered, not described: heat on squares, fire lines from attackers to the king zone, a storm that builds over a king in danger. |
| **Truth as guardrail** | Stockfish checks that bold moves are sound *enough*. Reckless sacrifices that just lose are gently flagged, never rewarded. |
| **Fifteen good minutes** | A daily session is one lesson bite, three puzzles and one short game. Sessions end on a win moment. |
| **Warmth, never shame** | Wrong answers get a hint, a reason and a retry. Lost games get "what was the attacking idea you missed?". |

## 2 · Teaching the *why* (the Tal method)

The goal is not "aim your pieces at the king". The goal is that Max understands **why kings fall** and reasons like an attacker. Every feature below produces a reason first and a move second.

**The five Tal principles** (every lesson, puzzle and debrief is tagged with one):

| Principle | In Max's words | Why it is true |
|---|---|---|
| **Initiative** | "Make them answer *me*." | Whoever is making threats chooses what happens next. The defender only reacts. |
| **Tempo** | "Every move must do something." | A move that makes a threat costs the opponent a move. Two free moves and the attack arrives first. |
| **Material is fuel** | "Pieces are for spending." | A pawn or a knight is only worth what it does. Spend it to open the king and the rest of your army is worth double. |
| **Open lines** | "Open the door, then walk in." | Rooks, bishops and queens need lines. Pawn breaks and sacrifices create them. |
| **The king cannot run** | "A king in the middle is a target." | The king moves one square. Trap it before it reaches safety, and more attackers than defenders ends the game. |

**Diagnosis before advice.** The Attack Lens outputs a *diagnosis* of the enemy king, in cause → effect form, before any move suggestion:

- "No escape squares. A check on the back rank would be mate."
- "Three attackers, one defender. The defender cannot hold."
- "The king is still in the middle. Open the e-file before it castles."
- "That knight is the only piece guarding f7. Remove it and f7 falls."

**Why-first puzzles.** Before Max may move, he answers one question: *What is the king's problem?* (pick from the diagnoses above). Correct diagnosis → move. Wrong diagnosis → a hint that shows the mechanism, not the answer. Solution shown → he names the principle that made it work.

**Why-first debriefs.** After each game: the best attacking moment, one missed moment, and for each the question *why did this work / why would this have worked?* He picks the reason. Reasons he gets wrong feed the next day's warm-up.

**Tal replays.** Guess-the-move through Tal, Morphy and Anderssen games. At each key move the why is written for a 7-year-old: "Tal gives the knight. Why? The pawn that takes it was the king's roof."

**Defence rule (applies everywhere):** when attacked, the drill is (a) can I attack something bigger, (b) can I check or threaten mate first, (c) only then, move the piece. Pure passive defence is never taught as a goal.

## 3 · The attack ladder (curriculum spine)

Opening up the king is taught from the start (rungs 2–5), before the tactical tools, because Max will not understand *why* a fork or a pin matters until he knows what he is trying to reach. Each rung has a taught idea with its why, themed puzzle packs (Lichess CC0, `content/puzzles/`), and a sparring bot whose flaw rewards that rung. Rungs unlock after 10 solves; earlier packs stay available for warm-ups.

| # | Rung | Idea Max learns | Puzzle packs | Principle |
|---|---|---|---|---|
| 1 | **Finish him** | Mate in 1. The king is the target: when every square it could go to is covered, one check ends the game. | mate-in-1 | The king cannot run |
| 2 | **The weak spot** | Before you can mate, you have to get at the king. f7 is the one square only the king guards. | f7-attack, hanging-piece | Initiative |
| 3 | **Keep him in the middle** | A king in the centre is a target. Open the centre before it can castle. | exposed-king, attraction | The king cannot run |
| 4 | **Castle, then charge** | Make your own king safe in one move, so every other piece is free to attack. | kingside-attack, queenside-attack | Tempo |
| 5 | **Rip the roof** | The pawns in front of the king are its roof. Give a pawn or a piece to tear them off. | sacrifice, clearance | Material is fuel |
| 6 | **Bring everyone** | Count attackers against defenders around the king. More attackers wins. | mate-in-2, kingside-attack | Initiative |
| 7 | **Back door** | The king's own pawn wall becomes its prison. A rook check from behind is mate. | back-rank | The king cannot run |
| 8 | **Two-pronged** | A fork attacks two things with one move. They can only save one. | fork, hanging-piece | Tempo |
| 9 | **Stuck** | Pins and skewers: when pieces line up, the front one cannot move or the back one falls. | pin, skewer | Initiative |
| 10 | **Surprise!** | Move one piece to unmask another. Two threats appear in one move. | discovered-attack, double-check | Tempo |
| 11 | **Smother & trap** | Some mates use the king's own pieces as the prison walls. | smothered, arabian, anastasia, hook | The king cannot run |
| 12 | **Deflect & decoy** | Pull the defender away, or drag the king onto a bad square. | deflection, capture-defender, interference | Initiative |
| 13 | **Ignore the threat** | When attacked, look for a check or a bigger threat first. Then deal with theirs. | zwischenzug, mate-in-3 | Tempo |
| 14 | **Finishing school** | Promotions and longer mates. King and queen, king and rook: close the game. | promotion, advanced-pawn, mate-in-3 | Open lines |

Each rung in `content/ladder.json` carries `why` (the mechanism in plain words) and `principle` (one of the five above).

## 4 · The Attack Lens (`src/chess/attack-lens.ts`)

Pure, engine-free analysis run every move for both sides:

- **King-zone attackers**: count of our pieces hitting the 3×3 around the enemy king.
- **Zone squares hit**, **fire lines** (attacker → zone square) for rendering.
- **Loose targets**: enemy pieces we attack that are undefended or hit by a cheaper piece.
- **Mate in one on the board**, **check given**, **development**, **castled**.
- **Score 0–100**: king pressure dominates; loose pieces and development support it; mate-in-one pins the meter at 100.
- **Diagnosis** (`diagnoseKing`): the enemy king's problems as cause → effect sentences (no escape squares, outnumbered in the zone, stuck in the centre, open file beside it, sole defender). The coach always leads with a diagnosis.

Per-move coaching lines come from the delta between before/after reports (`describeDelta`). Stockfish is consulted separately for blunder guardrails (later phase) and for the bots.

## 5 · Attack recipes and the payoff ledger

Puzzles teach moments. Recipes teach **plans**: get castle-ready, offer the bait, let the capture open the door, walk in. Each recipe (`content/recipes.json`) is a real line with a prompt and a why for every player move. On a bait move the player must first answer *"you want to give X: what does it buy?"* with the real payoff (open file, tempo, king dragged out, defender removed, mate threat) against Tal-wrong decoys, then sees the full ledger, and the lens confirms the payoff when it lands. The plan ends with a *Try it live* game from the same position against a bait-taking bot.

**Calculation, not generosity.** In live games the **sacrifice auditor** opens a ledger whenever material is given and settles it within three turns with Stockfish as the truth-teller: *paid* (pressure arrived, position holds), *gamble* (pressure arrived, but their best defence refutes it), *giveaway* (nothing bought). The attack meter never rewards a giveaway, and the debrief names it.

## 6 · Visual language

- **Board**: dark-navy stage, cream + deep-teal tiles, bloom + vignette, ACES tone mapping.
- **Heat**: our pressure glows warm orange in enemy territory and on enemy pieces; their pressure on *our* king zone glows cold blue (danger awareness without teaching passivity).
- **Fire lines**: thin glowing beams from each attacker to the king-zone square it hits.
- **Danger ring**: pulses under the enemy king; intensity follows pressure; flares when mate is on.
- Later: storm clouds and lightning over a king under heavy attack, slow-motion sacrifice moment, orbiting mate replay, voice coach.

## 7 · Sparring bots

Stockfish lite (single-threaded WASM) is the muscle; `content/bots.json` supplies strength (Skill Level, depth, slack) and a **flaw profile** (greedy, blind, late castler, thin defence, roof pusher, no luft, huddle, queen trader) that re-scores the engine's candidate moves toward the rung's teachable weakness. Nothing outside the slack is ever chosen: bots are beatable, not suicidal.

## 8 · Today's hunt (15 minutes)

1. **Warm-up** (1 min): the current rung's idea, why it works, and its principle.
2. **Hunt** (5 min): three why-first puzzles from the rung.
3. **Plan or Spar** (8 min): on alternate days, a recipe for the rung (with its ledger questions) or one game against the rung's bot, with the sacrifice auditor live and a debrief at the end.
4. **Wrap** (1 min): puzzles, first tries, streak, and what tomorrow unlocks.

Every step is saved, so a hunt interrupted at step two resumes at step three. **Great hunts** (guess-the-move through Morphy, Anderssen and Tal, with the reason at every move) sit beside the daily loop for when he wants more.

Progress, streaks and rung unlocks save locally (`localStorage`, later file-backed in Electron).

## 9 · Tech

TypeScript strict · Vite · Three.js + `postprocessing` · chess.js · Stockfish 17.1 lite-single WASM (Web Worker, no COOP/COEP headers needed) · Vitest · Playwright boot checks · Electron + electron-builder for Windows/macOS/Linux installers via GitHub Actions.

## 10 · Phases

| Phase | Ships | Gate |
|---|---|---|
| **P0 Skeleton** ✅ | 3D board, legal play vs a soft bot, Attack Lens + heat/fire/ring visuals, attack meter HUD, puzzle packs built from Lichess | typecheck · tests · `boot-check.mjs` zero console errors + bot replies |
| **P1 Puzzles** ✅ | Why-first puzzle mode on the ladder's packs (diagnose → move → name the principle), hints that show mechanism, rung progression, save | puzzle-check script solves/fails a pack headless |
| **P2 Recipes, ledger, bots** ✅ | Attack recipes (Plan Lab) with the payoff ledger before every sacrifice; x-ray roads in the lens; the sacrifice auditor (paid / gamble / giveaway) and end-of-game debrief; 12 bots with flaw profiles; Try it live | recipe test (legal, annotated, baits pay off) · recipe-check ×5 · audit-check |
| **P3 Today's hunt & Great hunts** ✅ | The 15-minute daily session with resume; guess-the-move replays of five classic attacks with the why at every move; Black-side recipes by mirroring | daily-check (warm-up → 3 puzzles → spar/plan → resume) · replay-check ×5 |
| **P4 Cinematic layer** ✅ | Camera director with intro sweeps, sacrifice slow-motion and push-in, storm and lightning over a king under pressure, the mate sequence (lightning, topple, orbit, title), shattering captures, synthesised sound, reduced-motion fallbacks | all headless checks pass with the cut scenes on; frames captured |
| **P4.1 Living stone** ✅ | Pieces fight (per-piece shove / stomp / slash / smash / chop with a board-level camera dive), the escape tour inside the mate scene (the king tries each way out and the board answers), upgraded models, torches and arena mood, per-piece audio, cinema level setting | mate-explain tests; all headless checks pass |
| **P4b Voice & presets** ✅ | Coach voice (speech synthesis) reading why-lines and captions; graphics presets by device | boot/puzzle checks with voice on |
| **P5 Download** ✅ (Linux verified) | Electron shell, electron-builder, release workflow for Windows/macOS/Linux; icon; smoke flag | AppImage built here, Electron smoke OK; Windows/macOS via CI |
