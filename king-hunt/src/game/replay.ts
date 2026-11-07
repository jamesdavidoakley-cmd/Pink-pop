import { Rules } from '../chess/rules';
import { diagnoseKing } from '../chess/attack-lens';
import type { BoardView } from '../board3d/view';
import type { Hud } from '../ui/hud';
import type { HumanMover } from './mover';
import type { MoveInput, Square } from '../chess/types';
import { PALETTE } from '../board3d/palette';
import { PRINCIPLE_WHY } from '../content/ladder';
import type { Replay } from '../content/replays';
import { recordReplay, type Progress } from './progress';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Great hunts: guess-the-move through a famous attacking game. At each key
 * hero move the player guesses; wrong guesses get the hint, then the piece,
 * then the move. Every move carries its reason.
 */
export class ReplaySession {
  rules = new Rules();
  private ply = 0;
  private wrong = 0;
  private alive = true;
  private busy = false;
  asked = 0;
  guessedFirst = 0;
  finished = false;
  onFinished: (() => void) | null = null;

  constructor(
    private view: BoardView,
    private hud: Hud,
    private mover: HumanMover,
    readonly replay: Replay,
    private progress: Progress,
    private onProgress: (p: Progress) => void,
  ) {}

  async start() {
    const r = this.replay;
    this.hud.setActions([]);
    this.hud.setTitle(`<b>${r.hero}</b> vs ${r.opponent}, ${r.year}`);
    this.hud.setStatus(r.where);
    this.hud.say([]);
    await this.hud.showCard({ kicker: 'Great hunt', title: r.title, body: r.story + `<br><br>You play ${r.hero}'s moves. When the card asks, find the move he found.`, button: 'Watch the opening' });
    if (!this.alive) return;
    this.rules = new Rules();
    this.view.setPosition(this.rules);
    this.view.scene.setOrientation(r.heroSide);
    this.mover.rules = this.rules;
    this.mover.side = r.heroSide;
    this.mover.onMove = (m) => void this.humanMove(m);
    // Fast-forward the opening with notes.
    for (this.ply = 0; this.ply < r.start; this.ply++) {
      await this.autoPlay(this.ply, 420);
      if (!this.alive) return;
    }
    await this.step();
  }

  dispose() {
    this.alive = false;
    this.mover.enabled = false;
    this.mover.onMove = null;
    this.hud.hideCard();
  }

  private isHeroPly(ply: number) {
    return (ply % 2 === 0) === (this.replay.heroSide === 'w');
  }

  private expectedUci(): string {
    const probe = this.rules.clone();
    const mv = probe.raw().move(this.replay.moves[this.ply]!);
    return `${mv.from}${mv.to}${mv.promotion ?? ''}`;
  }

  private async autoPlay(ply: number, pause: number) {
    const mv = this.rules.raw().move(this.replay.moves[ply]!);
    this.view.applyMove(mv, true, this.rules);
    this.hud.setAttack(this.view.paintLens(this.rules, this.replay.heroSide));
    const note = this.replay.notes[String(ply)];
    const who = this.isHeroPly(ply) ? this.replay.hero.split(' ').pop() : this.replay.opponent.split(/[ &]/)[0];
    this.hud.setStatus(`${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'} ${mv.san}  (${who})`);
    if (note) this.hud.say([note]);
    await sleep(note ? Math.max(pause, 1600) : pause);
  }

  private async step() {
    if (!this.alive) return;
    const r = this.replay;
    if (this.ply >= r.moves.length) return this.finish();
    const ask = r.asks[String(this.ply)];
    if (this.isHeroPly(this.ply) && ask) {
      this.wrong = 0;
      this.asked++;
      this.hud.say([ask.prompt]);
      this.hud.setStatus(`What did ${r.hero.split(' ').pop()} play?`);
      this.mover.enabled = true;
      return;
    }
    this.mover.enabled = false;
    await this.autoPlay(this.ply, 900);
    this.ply++;
    await this.step();
  }

  async humanMove(m: MoveInput) {
    if (this.busy || !this.mover.enabled) return;
    const uci = `${m.from}${m.to}${m.promotion ?? ''}`;
    const expected = this.expectedUci();
    const ask = this.replay.asks[String(this.ply)]!;
    if (uci !== expected) {
      this.wrong++;
      this.view.shake(m.from);
      const from = expected.slice(0, 2) as Square;
      const to = expected.slice(2, 4) as Square;
      if (this.wrong === 1) {
        this.hud.say([`Not that. Hint: ${ask.hint}`]);
        const d = diagnoseKing(this.rules.raw(), this.replay.heroSide)[0];
        if (d) this.view.highlight(d.squares, PALETTE.heatHot);
      } else if (this.wrong === 2) {
        this.hud.say([`It is the piece on ${from}.`]);
        this.view.highlight([from]);
      } else {
        this.hud.say([`${from} to ${to}. Play it and read why.`]);
        this.view.highlight([from, to], PALETTE.legalTarget);
      }
      return;
    }
    if (this.wrong === 0) this.guessedFirst++;
    this.busy = true;
    this.mover.enabled = false;
    const mv = this.rules.play(m)!;
    this.view.applyMove(mv, true, this.rules);
    this.view.clearHighlights();
    this.hud.setAttack(this.view.paintLens(this.rules, this.replay.heroSide));
    this.hud.say([(this.wrong === 0 ? 'Yes! ' : '') + ask.why]);
    this.hud.setStatus(`${ask.principle}: ${PRINCIPLE_WHY[ask.principle]}`);
    this.ply++;
    await sleep(2200);
    this.busy = false;
    await this.step();
  }

  private async finish() {
    this.finished = true;
    this.mover.enabled = false;
    this.progress = recordReplay(this.progress, this.replay.id, this.guessedFirst, this.asked);
    this.onProgress(this.progress);
    await this.hud.showCard({
      kicker: 'The hunt is over',
      title: this.replay.title,
      body: `${this.replay.finale}<br><br>You found ${this.guessedFirst} of ${this.asked} key moves first time.`,
      button: 'Done',
    });
    if (this.alive) this.onFinished?.();
  }

  state() {
    return { fen: this.rules.fen(), ply: this.ply, expected: this.mover.enabled ? this.expectedUci() : null, finished: this.finished, asked: this.asked, guessedFirst: this.guessedFirst };
  }
}
