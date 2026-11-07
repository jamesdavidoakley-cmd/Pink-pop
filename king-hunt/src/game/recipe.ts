import { Rules } from '../chess/rules';
import { analyseAttack, diagnoseKing } from '../chess/attack-lens';
import type { BoardView } from '../board3d/view';
import type { Hud } from '../ui/hud';
import type { HumanMover } from './mover';
import type { MoveInput, Square } from '../chess/types';
import { PALETTE } from '../board3d/palette';
import { PRINCIPLE_WHY } from '../content/ladder';
import type { Recipe } from '../content/recipes';
import { recordRecipe, type Progress } from './progress';
import { readMs } from './questions';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Plan Lab: one attack recipe, played step by step on rails.
 * For every player move: a prompt, hints that explain the mechanism, and on
 * bait moves the ledger question ("you give X: what do you get?") BEFORE the
 * sacrifice executes. The payoff is verified by the lens when it arrives.
 */
export class RecipeSession {
  rules = new Rules();
  private ply = 0;
  private wrong = 0;
  private alive = true;
  private busy = false;
  private baitScores = new Map<number, number>(); // bait ply → pressure before it
  countRight = 0;
  countAsked = 0;
  finished = false;
  onFinished: ((r: Recipe, startFen: string) => void) | null = null;

  constructor(
    private view: BoardView,
    private hud: Hud,
    private mover: HumanMover,
    readonly recipe: Recipe,
    private progress: Progress,
    private onProgress: (p: Progress) => void,
  ) {}

  startFen(): string {
    const r = new Rules(this.recipe.fen);
    for (let i = 0; i < this.recipe.start; i++) r.raw().move(this.recipe.moves[i]!);
    return r.fen();
  }

  async start() {
    const r = this.recipe;
    this.hud.setActions([]);
    this.hud.setTitle(`<b>${r.title}</b> · ${r.principle}`);
    this.hud.setStatus('Plan Lab');
    this.hud.say([]);
    await this.hud.showCard({ kicker: 'Attack recipe', title: r.title, body: `<b>The plan:</b> ${r.goal}<br><br><b>How we got here:</b> ${r.howWeGotHere}`, button: 'Show me' });
    if (!this.alive) return;
    this.rules = new Rules(this.startFen());
    this.ply = r.start;
    this.view.setPosition(this.rules);
    this.view.scene.setOrientation(r.side);
    this.hud.setAttack(this.view.paintLens(this.rules, r.side));
    this.mover.rules = this.rules;
    this.mover.side = r.side;
    this.mover.onMove = (m) => void this.humanMove(m);
    await this.step();
  }

  dispose() {
    this.alive = false;
    this.mover.enabled = false;
    this.mover.onMove = null;
    this.hud.hideCard();
  }

  /** Player plies alternate from whoever is to move in the recipe's start position. */
  private isPlayerPly(ply: number) {
    const startTurn = (this.recipe.fen ?? 'w').split(' ')[1] ?? 'w';
    return (ply % 2 === 0) === (startTurn === this.recipe.side);
  }

  private expectedUci(): string {
    const probe = this.rules.clone();
    const mv = probe.raw().move(this.recipe.moves[this.ply]!);
    return `${mv.from}${mv.to}${mv.promotion ?? ''}`;
  }

  /** Advances the rails: prompt the player, or play the scripted reply. */
  private async step() {
    if (!this.alive) return;
    if (this.ply >= this.recipe.moves.length) return this.finish();
    if (this.isPlayerPly(this.ply)) {
      const s = this.recipe.steps[String(this.ply)];
      this.wrong = 0;
      this.hud.say([s?.prompt ?? 'Your move in the plan.']);
      this.mover.enabled = true;
      return;
    }
    this.mover.enabled = false;
    await sleep(650);
    if (!this.alive) return;
    const mv = this.rules.raw().move(this.recipe.moves[this.ply]!);
    this.view.applyMove(mv, true, this.rules);
    this.hud.setAttack(this.view.paintLens(this.rules, this.recipe.side));
    const took = !!mv.captured;
    const prev = this.recipe.steps[String(this.ply - 1)];
    if (prev?.bait && took) this.hud.setStatus(`They took the bait (${mv.san}).`);
    else this.hud.setStatus(`They played ${mv.san}.`);
    this.ply++;
    this.checkPayoffs();
    await this.step();
  }

  private checkPayoffs() {
    for (const [baitPly, before] of this.baitScores) {
      const bait = this.recipe.steps[String(baitPly)]?.bait;
      const due = bait?.payoffPly ?? baitPly + 4;
      if (this.ply - 1 === due || (this.ply >= this.recipe.moves.length && this.ply - 1 <= due)) {
        const now = analyseAttack(this.rules.raw(), this.recipe.side);
        const d = diagnoseKing(this.rules.raw(), this.recipe.side)[0];
        this.hud.say([`Paid: pressure ${before} → ${now.score}. ${d ? d.text : ''}`.trim()]);
        this.baitScores.delete(baitPly);
      }
    }
  }

  async humanMove(m: MoveInput) {
    if (this.busy || !this.mover.enabled) return;
    const uci = `${m.from}${m.to}${m.promotion ?? ''}`;
    const expected = this.expectedUci();
    const step = this.recipe.steps[String(this.ply)];
    if (uci !== expected) return this.hint(m, expected);

    // Bait: justify it before it executes.
    if (step?.bait) {
      this.busy = true;
      this.mover.enabled = false;
      const b = step.bait;
      const correct = b.get[Math.floor(Math.random() * b.get.length)]!;
      const options = shuffle([{ text: correct, correct: true }, ...shuffle([...b.decoys]).slice(0, 2).map((t) => ({ text: t, correct: false }))]);
      const mode = this.progress.settings.questions;
      const ledger = `${b.get.map((g) => `• ${g}`).join('<br>')}${b.count ? `<br><br>${b.count}` : ''}`;
      const pick = mode === 'off' ? -1 : await this.hud.ask(`You want to give ${b.give === 1 ? 'a pawn' : b.give >= 9 ? 'your queen' : b.give >= 5 ? 'a rook' : 'a piece'} (${b.give}). What does it buy?`, options, 'Count it', 'Just play it');
      if (!this.alive) return;
      if (pick >= 0) {
        this.countAsked++;
        const right = options[pick]?.correct === true;
        if (right) this.countRight++;
        await this.hud.showCard({
          kicker: right ? 'Right. The ledger' : 'Not that. The ledger',
          title: `Give ${b.give}. Get:`,
          body: ledger,
          button: right ? 'Play it' : 'Play it anyway, and watch',
          autoMs: mode === 'quick' && right ? readMs(ledger, mode) : undefined,
        });
      } else {
        // Skipped: the ledger still goes past, briefly, so the calculation is seen.
        await this.hud.showCard({ kicker: 'The ledger', title: `Give ${b.give}. Get:`, body: ledger, button: 'Play it', autoMs: readMs(ledger, 'quick') });
      }
      if (!this.alive) return;
      this.baitScores.set(this.ply, analyseAttack(this.rules.raw(), this.recipe.side).score);
      this.busy = false;
    }

    const mv = this.rules.play(m)!;
    this.view.applyMove(mv, true, this.rules);
    this.view.clearHighlights();
    this.hud.setAttack(this.view.paintLens(this.rules, this.recipe.side));
    this.hud.say([step?.why ?? 'Good.']);
    this.ply++;
    this.mover.enabled = false;
    await sleep(1400);
    await this.step();
  }

  private hint(m: MoveInput, expected: string) {
    this.wrong++;
    this.view.shake(m.from);
    const from = expected.slice(0, 2) as Square;
    const to = expected.slice(2, 4) as Square;
    const step = this.recipe.steps[String(this.ply)];
    if (this.wrong === 1) {
      const d = diagnoseKing(this.rules.raw(), this.recipe.side)[0];
      this.hud.say([`Not in the plan. ${step?.prompt ?? ''} ${d ? d.text : ''}`.trim()]);
      if (d) this.view.highlight(d.squares, PALETTE.heatHot);
    } else if (this.wrong === 2) {
      this.hud.say([`Use the piece on ${from}.`]);
      this.view.highlight([from]);
    } else {
      this.hud.say([`${from} to ${to}. Play it and read why.`]);
      this.view.highlight([from, to], PALETTE.legalTarget);
    }
  }

  private async finish() {
    this.finished = true;
    this.mover.enabled = false;
    this.progress = recordRecipe(this.progress, this.recipe.id, this.countRight, this.countAsked);
    this.onProgress(this.progress);
    const r = this.recipe;
    this.hud.say(['Plan complete.']);
    await this.hud.showCard({
      kicker: 'The payoff',
      title: r.title,
      body: `${r.payoff}<br><br><b>${r.principle}:</b> ${PRINCIPLE_WHY[r.principle]}<br><br>Ledger questions right: ${this.countRight}/${this.countAsked}.`,
      button: 'Try it live',
    });
    if (!this.alive) return;
    this.onFinished?.(r, this.startFen());
  }

  state() {
    return { fen: this.rules.fen(), ply: this.ply, expected: this.ply < this.recipe.moves.length && this.isPlayerPly(this.ply) ? this.expectedUci() : null, finished: this.finished, busy: this.busy, countRight: this.countRight, countAsked: this.countAsked };
  }
}
