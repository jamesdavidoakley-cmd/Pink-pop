import { Rules } from '../chess/rules';
import { analyseAttack, coachLines, diagnoseKing } from '../chess/attack-lens';
import type { Engine } from '../chess/engine';
import { BOTS, pickBotMove, type BotSpec } from './bots';
import type { BoardView } from '../board3d/view';
import type { Hud } from '../ui/hud';
import type { HumanMover } from './mover';
import type { Color, MoveInput } from '../chess/types';

/** One human-vs-bot game. The coach leads with why the enemy king is in trouble. */
export class PlaySession {
  rules = new Rules();
  readonly human: Color = 'w';
  bot: BotSpec = BOTS[0]!;
  private thinking = false;
  private alive = true;

  constructor(
    private view: BoardView,
    private hud: Hud,
    private mover: HumanMover,
    private engine: Engine,
  ) {}

  start() {
    this.rules = new Rules();
    this.view.setPosition(this.rules);
    this.view.scene.setOrientation(this.human);
    this.mover.rules = this.rules;
    this.mover.side = this.human;
    this.mover.enabled = true;
    this.mover.onMove = (m) => void this.humanMove(m);
    this.hud.maskMeter(false);
    this.hud.setTitle(`vs <b>${this.bot.name}</b>`);
    this.hud.setActions([{ label: 'New game', onClick: () => this.start() }]);
    this.hud.say(['Your move. First question every move: what is the black king\'s problem?']);
    this.hud.setStatus(`You are White. ${this.bot.name} is Black.`);
    this.paint();
  }

  dispose() {
    this.alive = false;
    this.mover.enabled = false;
    this.mover.onMove = null;
  }

  private paint() {
    this.hud.setAttack(this.view.paintLens(this.rules, this.human));
  }

  async humanMove(m: MoveInput) {
    if (this.thinking || this.rules.isGameOver()) return;
    const before = analyseAttack(this.rules.raw(), this.human);
    const diagBefore = diagnoseKing(this.rules.raw(), this.human);
    const mv = this.rules.play(m);
    if (!mv) return;
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
    this.paint();
    this.hud.setStatus(`${this.bot.name} played ${mv.san}. Your move.`);
    if (this.rules.inCheck()) {
      this.hud.say(['You are in check. First question: can you answer with a bigger threat?']);
    } else {
      const diag = diagnoseKing(this.rules.raw(), this.human)[0];
      if (diag) this.hud.say([diag.text]);
    }
    this.checkGameOver();
  }

  private checkGameOver(): boolean {
    if (!this.rules.isGameOver()) return false;
    if (this.rules.isCheckmate()) {
      const youWon = this.rules.turn() !== this.human;
      this.hud.say([youWon ? 'CHECKMATE! The king hunt is complete.' : `Checkmate. ${this.bot.name} got there first. Again?`]);
    } else {
      this.hud.say(['Draw. No king fell this time.']);
    }
    this.hud.setStatus('Game over');
    return true;
  }

  state() {
    return { fen: this.rules.fen(), thinking: this.thinking };
  }
}
