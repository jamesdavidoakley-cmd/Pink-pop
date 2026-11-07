import { Rules } from '../chess/rules';
import { diagnoseKing, type Diagnosis } from '../chess/attack-lens';
import type { BoardView } from '../board3d/view';
import type { Hud, QuestionOption } from '../ui/hud';
import type { HumanMover } from './mover';
import type { Color, MoveInput, Square } from '../chess/types';
import { PuzzleRunner } from './puzzle-runner';
import { LADDER, LICHESS_TO_PACK, PRINCIPLES, PRINCIPLE_WHY, THEME_IDEA, loadPack, type Pack, type Puzzle, type Rung } from '../content/ladder';
import { recordSolve, recordWhy, rungProgress, type Progress } from './progress';
import { PALETTE } from '../board3d/palette';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wrong-but-tempting answers for "what is the king's problem?" */
const DISTRACTORS = [
  'Nothing is wrong with the king yet. Build up slowly.',
  'Their defenders outnumber your attackers. Retreat.',
  'Trade queens to make it simpler.',
  'Defend your own pieces first.',
];

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface WhyQuestion {
  prompt: string;
  kicker: string;
  options: QuestionOption[];
  explanation: string;
  squares: Square[];
}

/** Builds the why-first question for a puzzle position. Diagnosis when we have one, theme idea otherwise. */
export function buildWhyQuestion(rules: Rules, side: Color, packName: string, puzzle: Puzzle, diag: Diagnosis[]): WhyQuestion {
  if (diag[0]) {
    const d = diag[0];
    const options = shuffle([{ text: d.text, correct: true }, ...shuffle([...DISTRACTORS]).slice(0, 2).map((t) => ({ text: t, correct: false }))]);
    return { prompt: 'What is the king\'s problem?', kicker: 'Look first', options, explanation: `${d.text} That is "${d.principle}": ${PRINCIPLE_WHY[d.principle]}`, squares: d.squares };
  }
  const mine = new Set([packName, ...puzzle.themes.map((t) => LICHESS_TO_PACK[t]).filter(Boolean)]);
  const others = shuffle(Object.keys(THEME_IDEA).filter((k) => !mine.has(k))).slice(0, 2);
  const options = shuffle([{ text: THEME_IDEA[packName]!, correct: true }, ...others.map((k) => ({ text: THEME_IDEA[k]!, correct: false }))]);
  return { prompt: 'What is the idea here?', kicker: 'Look first', options, explanation: THEME_IDEA[packName]!, squares: [] };
}

/**
 * Puzzle mode on one ladder rung. Loop per puzzle:
 *   rung card (first time) → setup move → WHY question → moves with
 *   escalating mechanism hints → "why did that work?" → next.
 */
export class PuzzleSession {
  rules = new Rules();
  runner: PuzzleRunner | null = null;
  pack: Pack | null = null;
  side: Color = 'w';
  private seen = new Set<string>();
  private alive = true;
  private introShown = false;
  private busy = false;
  solvedThisSession = 0;

  constructor(
    private view: BoardView,
    private hud: Hud,
    private mover: HumanMover,
    readonly rung: Rung,
    private progress: Progress,
    private onProgress: (p: Progress) => void,
  ) {}

  async start() {
    this.hud.setActions([{ label: 'Skip', onClick: () => void this.next() }]);
    if (!this.introShown) {
      this.introShown = true;
      await this.hud.showCard({ kicker: `Rung ${LADDER.rungs.indexOf(this.rung) + 1} · ${this.rung.principle}`, title: this.rung.title, body: `${this.rung.idea}<br><br><b>Why it works:</b> ${this.rung.why}`, button: 'Start hunting' });
    }
    await this.next();
  }

  dispose() {
    this.alive = false;
    this.mover.enabled = false;
    this.mover.onMove = null;
    this.hud.hideCard();
  }

  private pickPuzzle(): Puzzle {
    const list = this.pack!.puzzles.filter((p) => !this.seen.has(p.id));
    const pool = list.length ? list : this.pack!.puzzles;
    // Easier puzzles first for a new rung; widen as solves accumulate.
    const solved = rungProgress(this.progress, this.rung.id).solved;
    const window = Math.min(pool.length, 40 + solved * 15);
    const p = pool[Math.floor(Math.random() * window)]!;
    this.seen.add(p.id);
    return p;
  }

  async next() {
    if (this.busy) return;
    this.busy = true;
    this.mover.enabled = false;
    this.hud.hideCard();
    const packName = this.rung.packs[Math.floor(Math.random() * this.rung.packs.length)]!;
    this.pack = await loadPack(packName);
    if (!this.alive) return;
    const puzzle = this.pickPuzzle();
    this.runner = new PuzzleRunner(puzzle);
    this.rules = new Rules(puzzle.fen);
    this.side = this.rules.turn() === 'w' ? 'b' : 'w';
    this.view.setPosition(this.rules);
    this.view.scene.setOrientation(this.side);
    this.view.clearHighlights();
    this.hud.setTitle(`<b>${this.rung.title}</b> · ${rungProgress(this.progress, this.rung.id).solved}/${LADDER.unlockAfter} solved`);
    this.hud.setStatus(`You are ${this.side === 'w' ? 'White' : 'Black'}. Puzzle ${puzzle.id} · ${puzzle.rating}`);
    this.hud.say(['Watch what they do…']);
    this.hud.maskMeter(true);
    this.hud.setAttack(this.view.paintLens(this.rules, this.side));
    await sleep(700);
    if (!this.alive) return;
    const setup = this.rules.playUci(this.runner.setupMove());
    if (setup) this.view.applyMove(setup, true, this.rules);
    this.hud.setAttack(this.view.paintLens(this.rules, this.side));
    await sleep(500);
    if (!this.alive) return;

    // WHY first.
    const diag = diagnoseKing(this.rules.raw(), this.side);
    const q = buildWhyQuestion(this.rules, this.side, packName, puzzle, diag);
    if (q.squares.length) this.view.highlight(q.squares, PALETTE.heatHot);
    const choice = await this.hud.ask(q.prompt, q.options, q.kicker);
    if (!this.alive) return;
    const right = q.options[choice]?.correct === true;
    this.hud.maskMeter(false);
    this.progress = recordWhy(this.progress, right);
    this.onProgress(this.progress);
    if (right) {
      this.hud.say(['Yes. ' + q.explanation]);
    } else {
      await this.hud.showCard({ kicker: 'Not quite', title: 'Here is the real problem', body: q.explanation, button: 'Got it' });
      if (!this.alive) return;
      this.hud.say(['Now find the move that uses it.']);
    }
    this.view.clearHighlights();
    this.mover.rules = this.rules;
    this.mover.side = this.side;
    this.mover.onMove = (m) => void this.humanMove(m);
    this.mover.enabled = true;
    this.busy = false;
  }

  async humanMove(m: MoveInput) {
    if (!this.runner || this.busy) return;
    const uci = `${m.from}${m.to}${m.promotion ?? ''}`;
    // Is it mate? Lichess accepts any mating move at the end of the line.
    const probe = this.rules.clone();
    const probeMove = probe.play(m);
    const isMate = !!probeMove && probe.isCheckmate();
    const result = this.runner.tryMove(uci, isMate);
    if (result === 'wrong') return this.wrong(m);
    const mv = this.rules.play(m)!;
    this.view.applyMove(mv, true, this.rules);
    this.hud.setAttack(this.view.paintLens(this.rules, this.side));
    if (result === 'complete') {
      void this.solved(); // not awaited: solved() waits on the player answering the why-question
      return;
    }
    this.hud.say(['Yes! Keep the pressure on.']);
    this.mover.enabled = false;
    await sleep(600);
    if (!this.alive) return;
    const reply = this.runner.opponentReply();
    if (reply) {
      const rm = this.rules.playUci(reply);
      if (rm) this.view.applyMove(rm, true, this.rules);
      this.hud.setAttack(this.view.paintLens(this.rules, this.side));
    }
    if (this.runner.isComplete()) {
      void this.solved();
      return;
    }
    const d = diagnoseKing(this.rules.raw(), this.side)[0];
    this.hud.say([d ? d.text : 'Your move. What is the biggest threat you can make?']);
    this.mover.enabled = true;
  }

  private async wrong(m: MoveInput) {
    if (!this.runner) return;
    this.view.shake(m.from);
    const level = this.runner.hintLevel();
    const expected = this.runner.expected()!;
    const from = expected.slice(0, 2) as Square;
    const to = expected.slice(2, 4) as Square;
    const diag = diagnoseKing(this.rules.raw(), this.side)[0];
    if (level === 1) {
      this.hud.say(['Not that one. ' + (diag ? diag.text : 'Look for the move that makes the biggest threat.')]);
      if (diag) this.view.highlight(diag.squares, PALETTE.heatHot);
    } else if (level === 2) {
      const piece = this.rules.pieceAt(from);
      this.hud.say([`Use the ${pieceName(piece?.type)} on ${from}. Where does it hurt most?`]);
      this.view.highlight([from]);
    } else {
      this.hud.say([`The move is ${from} to ${to}. Play it, and notice why it works.`]);
      this.view.highlight([from, to], PALETTE.legalTarget);
      this.runner.revealed = true;
    }
  }

  private async solved() {
    if (!this.runner) return;
    this.busy = true;
    this.mover.enabled = false;
    this.solvedThisSession++;
    const firstTry = this.runner.firstTry();
    this.progress = recordSolve(this.progress, this.rung.id, { firstTry, revealed: this.runner.revealed });
    this.onProgress(this.progress);
    this.hud.say([firstTry ? 'First try. That is how Tal does it.' : 'Solved. Next time you will see it faster.']);
    await sleep(900);
    if (!this.alive) return;
    const options = shuffle(PRINCIPLES.map((p) => ({ text: p, correct: p === this.rung.principle })));
    const pick = await this.hud.ask('Why did that work?', options, 'Name it');
    if (!this.alive) return;
    const right = options[pick]?.correct === true;
    this.progress = recordWhy(this.progress, right);
    this.onProgress(this.progress);
    await this.hud.showCard({
      kicker: right ? 'Exactly' : 'Close',
      title: this.rung.principle,
      body: PRINCIPLE_WHY[this.rung.principle],
      button: 'Next puzzle',
    });
    this.busy = false;
    if (this.alive) await this.next();
  }

  state() {
    return { fen: this.rules.fen(), expected: this.runner?.expected() ?? null, complete: this.runner?.isComplete() ?? false, solved: this.solvedThisSession, busy: this.busy };
  }
}

function pieceName(t?: string) {
  return ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as Record<string, string>)[t ?? ''] ?? 'piece';
}
