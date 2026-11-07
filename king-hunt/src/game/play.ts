import { Rules } from '../chess/rules';
import { analyseAttack, coachLines, diagnoseKing } from '../chess/attack-lens';
import type { Engine } from '../chess/engine';
import { BOTS, pickBotMove, type BotSpec } from './bots';
import { audit, type Audit } from './auditor';
import type { BoardView } from '../board3d/view';
import type { Hud } from '../ui/hud';
import type { HumanMover } from './mover';
import type { Color, MoveInput } from '../chess/types';

export interface PlayOptions {
  bot?: BotSpec;
  fen?: string;
  side?: Color;
  label?: string; // e.g. the recipe being tried live
}

interface Turn {
  moveNo: number;
  san: string;
  fenBefore: string; // before our move
  fenAfterReply: string | null; // after their reply
  delta: number; // our attack score change over the turn
  audit: Audit | null;
}

/**
 * One human-vs-bot game. The coach leads with why the enemy king is in
 * trouble; every sacrifice is audited (paid / gamble / giveaway); the game
 * ends with a debrief: best moment, any giveaway, one missed chance.
 */
export class PlaySession {
  rules = new Rules();
  readonly human: Color;
  readonly bot: BotSpec;
  private thinking = false;
  private alive = true;
  private turns: Turn[] = [];
  private pending: { fenBefore: string; san: string; moveNo: number; scoreBefore: number } | null = null;
  /** Open ledgers: sacrifices waiting (up to AUDIT_WINDOW turns) for their payoff. */
  private open: { turnIndex: number; fenBefore: string; san: string; moveNo: number }[] = [];
  lastAudit: Audit | null = null;
  static readonly AUDIT_WINDOW = 3;

  constructor(
    private view: BoardView,
    private hud: Hud,
    private mover: HumanMover,
    private engine: Engine,
    private opts: PlayOptions = {},
  ) {
    this.human = opts.side ?? 'w';
    this.bot = opts.bot ?? BOTS[0]!;
  }

  start() {
    this.rules = new Rules(this.opts.fen);
    this.turns = [];
    this.pending = null;
    this.open = [];
    this.view.setPosition(this.rules);
    this.view.scene.setOrientation(this.human);
    this.mover.rules = this.rules;
    this.mover.side = this.human;
    this.mover.enabled = true;
    this.mover.onMove = (m) => void this.humanMove(m);
    this.hud.maskMeter(false);
    this.hud.hideCard();
    this.hud.setTitle(`${this.opts.label ? `<b>${this.opts.label}</b> · ` : ''}vs <b>${this.bot.name}</b>`);
    this.hud.setActions([{ label: 'New game', onClick: () => this.start() }]);
    this.hud.say([`${this.bot.name}: ${this.bot.blurb}`]);
    this.hud.setStatus(`You are ${this.human === 'w' ? 'White' : 'Black'}. ${this.bot.name} is ${this.human === 'w' ? 'Black' : 'White'}.`);
    this.paint();
    if (this.rules.turn() !== this.human) void this.botMove();
  }

  dispose() {
    this.alive = false;
    this.mover.enabled = false;
    this.mover.onMove = null;
  }

  private paint() {
    return this.hud.setAttack(this.view.paintLens(this.rules, this.human));
  }

  async humanMove(m: MoveInput) {
    if (this.thinking || this.rules.isGameOver() || this.rules.turn() !== this.human) return;
    const fenBefore = this.rules.fen();
    const before = analyseAttack(this.rules.raw(), this.human);
    const diagBefore = diagnoseKing(this.rules.raw(), this.human);
    const mv = this.rules.play(m);
    if (!mv) return;
    this.pending = { fenBefore, san: mv.san, moveNo: this.rules.history().length, scoreBefore: before.score };
    this.view.applyMove(mv, true, this.rules);
    const after = analyseAttack(this.rules.raw(), this.human);
    const diagAfter = diagnoseKing(this.rules.raw(), this.human);
    this.paint();
    const lines = coachLines(before, after, diagBefore, diagAfter);
    if (lines.length) this.hud.say(lines);
    if (this.checkGameOver()) return;
    await this.botMove();
  }

  private async botMove() {
    this.thinking = true;
    this.hud.setStatus(`${this.bot.name} is thinking…`);
    const uci = await pickBotMove(this.engine, this.rules.fen(), this.bot);
    if (!this.alive) return;
    const mv = this.rules.playUci(uci);
    this.thinking = false;
    if (!mv) return this.hud.setStatus('Engine returned an odd move; your turn.');
    this.view.applyMove(mv, true, this.rules);
    const report = this.paint();
    this.hud.setStatus(`${this.bot.name} played ${mv.san}. Your move.`);
    void report;
    const gameOver = this.checkGameOver();
    // Close the turn. A sacrifice opens a ledger; it is settled as soon as the
    // payoff arrives, or at the end of the window with the engine as the truth-teller.
    let said = false;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      const fenAfter = this.rules.fen();
      const scoreAfter = analyseAttack(this.rules.raw(), this.human).score;
      const turn: Turn = { moveNo: p.moveNo, san: p.san, fenBefore: p.fenBefore, fenAfterReply: fenAfter, delta: scoreAfter - p.scoreBefore, audit: null };
      this.turns.push(turn);
      const quick = audit(p.fenBefore, fenAfter, this.human, null);
      if (quick.verdict !== 'none' && !this.open.some((o) => o.turnIndex === this.turns.length - 1)) {
        this.open.push({ turnIndex: this.turns.length - 1, fenBefore: p.fenBefore, san: p.san, moveNo: p.moveNo });
        if (!gameOver) {
          this.hud.say([`You gave ${quick.gave}. Now show me what it buys.`]);
          said = true;
        }
      }
      // Settle open ledgers.
      for (const o of [...this.open]) {
        const age = this.turns.length - 1 - o.turnIndex;
        const now = audit(o.fenBefore, fenAfter, this.human, null);
        const windowOver = age >= PlaySession.AUDIT_WINDOW - 1 || gameOver;
        if (now.verdict === 'none' && !windowOver) continue; // material came back: nothing to judge yet
        if (now.verdict === 'paid' || windowOver) {
          const evalCp = await this.evalFor(fenAfter);
          if (!this.alive) return;
          const settled = audit(o.fenBefore, fenAfter, this.human, evalCp);
          this.open = this.open.filter((x) => x !== o);
          if (settled.verdict === 'none') continue;
          this.turns[o.turnIndex]!.audit = settled;
          this.lastAudit = settled;
          if (!gameOver) {
            this.hud.say([`${o.san}: ${settled.text}`]);
            said = true;
          }
        }
      }
    }
    if (gameOver) return;
    if (!said) {
      if (this.rules.inCheck()) this.hud.say(['You are in check. First question: can you answer with a bigger threat?']);
      else {
        const diag = diagnoseKing(this.rules.raw(), this.human)[0];
        if (diag) this.hud.say([diag.text]);
      }
    }
    this.lastAudit = null;
  }

  /** Engine eval from our side, in centipawns (mates mapped to ±10000). */
  private async evalFor(fen: string): Promise<number | null> {
    try {
      const res = await this.engine.search(fen, { depth: 8, multiPv: 1, skillLevel: 20 });
      const l = res.lines[0];
      if (!l) return null;
      const stm: Color = fen.split(' ')[1] === 'w' ? 'w' : 'b';
      const raw = l.mate !== undefined ? (l.mate > 0 ? 10000 : -10000) : (l.cp ?? 0);
      return stm === this.human ? raw : -raw;
    } catch {
      return null;
    }
  }

  private checkGameOver(): boolean {
    if (!this.rules.isGameOver()) return false;
    this.mover.enabled = false;
    let headline: string;
    if (this.rules.isCheckmate()) {
      const youWon = this.rules.turn() !== this.human;
      headline = youWon ? 'CHECKMATE! The king hunt is complete.' : `Checkmate. ${this.bot.name} got there first.`;
    } else headline = 'Draw. No king fell this time.';
    this.hud.say([headline]);
    this.hud.setStatus('Game over');
    void this.debrief(headline);
    return true;
  }

  /** Best moment, any giveaway, and one missed chance (engine-checked). */
  private async debrief(headline: string) {
    const best = [...this.turns].sort((a, b) => b.delta - a.delta)[0];
    const giveaway = this.turns.find((t) => t.audit?.verdict === 'giveaway');
    const paid = this.turns.find((t) => t.audit?.verdict === 'paid');
    const missed = await this.findMissedChance();
    if (!this.alive) return;
    const lines: string[] = [];
    if (paid) lines.push(`<b>Paid for:</b> move ${paid.moveNo} ${paid.san}. ${paid.audit!.text}`);
    else if (best && best.delta > 0) lines.push(`<b>Best moment:</b> move ${best.moveNo} ${best.san} (+${best.delta} pressure).`);
    if (giveaway) lines.push(`<b>Giveaway:</b> move ${giveaway.moveNo} ${giveaway.san}. ${giveaway.audit!.text}`);
    if (missed) lines.push(`<b>Missed chance:</b> at move ${missed.moveNo} you played ${missed.played}; <b>${missed.better}</b> was there. ${missed.why}`);
    if (lines.length === 0) lines.push('Short game. Next time, look for the king\'s problem before every move.');
    await this.hud.showCard({ kicker: 'Debrief', title: headline, body: lines.join('<br><br>'), button: 'Play again' });
    if (this.alive) this.start();
  }

  private async findMissedChance(): Promise<{ moveNo: number; played: string; better: string; why: string } | null> {
    // Check our last 10 moves: where did the engine's best move create far more pressure than ours?
    const candidates = this.turns.slice(-10);
    let bestGap = 12;
    let found: { moveNo: number; played: string; better: string; why: string } | null = null;
    for (const t of candidates) {
      try {
        const res = await this.engine.search(t.fenBefore, { depth: 8, multiPv: 1, skillLevel: 20 });
        if (!this.alive) return null;
        const probe = new Rules(t.fenBefore);
        const scoreBefore = analyseAttack(probe.raw(), this.human).score;
        const mv = probe.playUci(res.best);
        if (!mv || mv.san === t.san) continue;
        const after = analyseAttack(probe.raw(), this.human);
        const gap = after.score - scoreBefore - t.delta;
        if (gap > bestGap) {
          bestGap = gap;
          const d = diagnoseKing(probe.raw(), this.human)[0];
          found = { moveNo: t.moveNo, played: t.san, better: mv.san, why: d ? d.text : after.mateInOne ? 'It sets up checkmate.' : 'It brings more attackers to the king.' };
        }
      } catch {
        /* engine hiccup: skip */
      }
    }
    return found;
  }

  state() {
    return { fen: this.rules.fen(), thinking: this.thinking, turns: this.turns.length, lastAudit: this.lastAudit };
  }
}
