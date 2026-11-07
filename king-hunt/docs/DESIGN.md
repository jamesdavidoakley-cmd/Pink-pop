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

Each rung has: a 2-minute taught idea, a themed puzzle pack (from the Lichess CC0 database, see `content/puzzles/`), and a sparring bot whose flaw rewards that rung. Rungs unlock in order; earlier packs stay available for "warm-ups".

| # | Rung | Idea Max learns | Puzzle packs | Bot flaw it punishes |
|---|---|---|---|---|
| 1 | **Finish him** | Mate in 1. The king is the target. | mate-in-1 | wanders into mates |
| 2 | **Back door** | Back-rank mate; the rook/queen checks on the last rank. | back-rank, mate-in-1 | never makes luft |
| 3 | **Two-pronged** | Fork: one move, two targets. | fork, hanging-piece | leaves pieces loose |
| 4 | **Stuck** | Pin and skewer: pieces in a line. | pin, skewer | lines king and queen up |
| 5 | **Surprise!** | Discovered attack and double check. | discovered-attack, double-check | ignores batteries |
| 6 | **Castle, then charge** | Castle early *so you can* attack. King safety as fuel. | f7-attack, exposed-king | castles late |
| 7 | **Bring everyone** | Count attackers vs defenders on the king zone. | kingside-attack, queenside-attack | defends with too few |
| 8 | **Open the door** | Pawn levers and sacrifices that rip open the king's shelter. | sacrifice, clearance, attraction | over-pushes shelter pawns |
| 9 | **Smother & trap** | Smothered, Arabian, Anastasia, hook mates. | smothered, arabian, anastasia, hook | boxes in its own king |
| 10 | **Deflect & decoy** | Overload the defender; drag the king out. | deflection, capture-defender, interference | relies on one defender |
| 11 | **Ignore the threat** | Zwischenzug: check or mate threat before responding. | zwischenzug, mate-in-2 | assumes recaptures |
| 12 | **Finishing school** | Mate in 3, promotion races. K+Q and K+R mates to close games. | mate-in-3, promotion, advanced-pawn | runs to endgames |

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

## 5 · Visual language

- **Board**: dark-navy stage, cream + deep-teal tiles, bloom + vignette, ACES tone mapping.
- **Heat**: our pressure glows warm orange in enemy territory and on enemy pieces; their pressure on *our* king zone glows cold blue (danger awareness without teaching passivity).
- **Fire lines**: thin glowing beams from each attacker to the king-zone square it hits.
- **Danger ring**: pulses under the enemy king; intensity follows pressure; flares when mate is on.
- Later: storm clouds and lightning over a king under heavy attack, slow-motion sacrifice moment, orbiting mate replay, voice coach.

## 6 · Sparring bots

Stockfish lite (single-threaded WASM) is the muscle; `content/bots/*.json` (later phase) supplies strength (Skill Level / depth / move slack) and a **flaw profile** that biases move choice toward the rung's teachable weakness. Phase 0 ships one soft bot, Pawnsworth.

## 7 · Daily session (15 minutes)

1. **Warm-up** (3 min): one taught idea or a replay of a famous attack (Morphy, Anderssen, Tal), guess-the-move style.
2. **Hunt** (4 min): three puzzles from the current rung, attack heat map on.
3. **Spar** (8 min): one game vs the rung's bot, with a 10-minute clock on the bot only. Attack meter live; a one-line debrief at the end: the best attacking moment, one missed chance.

Progress, streaks and rung unlocks save locally (`localStorage`, later file-backed in Electron).

## 8 · Tech

TypeScript strict · Vite · Three.js + `postprocessing` · chess.js · Stockfish 17.1 lite-single WASM (Web Worker, no COOP/COEP headers needed) · Vitest · Playwright boot checks · Electron + electron-builder for Windows/macOS/Linux installers via GitHub Actions.

## 9 · Phases

| Phase | Ships | Gate |
|---|---|---|
| **P0 Skeleton** ✅ | 3D board, legal play vs a soft bot, Attack Lens + heat/fire/ring visuals, attack meter HUD, puzzle packs built from Lichess | typecheck · tests · `boot-check.mjs` zero console errors + bot replies |
| **P1 Puzzles** | Why-first puzzle mode on the ladder's packs (diagnose → move → name the principle), hints that show mechanism, rung progression, save | puzzle-check script solves/fails a pack headless |
| **P2 Bots with flaws** | 12 bots in JSON, flaw-biased move choice, bot clock, debrief | ai-sim proves each bot exhibits its flaw ≥ N% of games |
| **P3 Lessons & replays** | Why-stories per rung, Tal/Morphy/Anderssen guess-the-move replays with reasons, why-first debriefs, daily session flow | session-check completes a full 15-minute loop |
| **P4 Voice & polish** | Coach voice (Web Speech API), storm/lightning, sacrifice slow-mo, mate replay camera | voice degrades gracefully; 60 fps on mid laptop |
| **P5 Download** | Electron shell, installers from CI, file-backed saves | installers build green for win/mac/linux |
