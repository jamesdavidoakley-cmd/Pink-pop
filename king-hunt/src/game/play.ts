import * as THREE from 'three';
import type { Move } from 'chess.js';
import { Rules } from '../chess/rules';
import { analyseAttack, coachLines, diagnoseKing, type AttackReport } from '../chess/attack-lens';
import { Engine } from '../chess/engine';
import { BOTS, pickBotMove, type BotSpec } from './bots';
import type { BoardScene } from '../board3d/scene';
import { AttackEffects } from '../board3d/effects';
import { BoardInput } from '../board3d/input';
import { makePiece, tweenMove, tweenVanish, type PieceMesh, type Tween } from '../board3d/pieces';
import { squareToWorld } from '../board3d/coords';
import { PALETTE } from '../board3d/palette';
import type { Hud } from '../ui/hud';
import { sq, type Color, type Square } from '../chess/types';

/**
 * One human-vs-bot game: owns the rules, the piece meshes, input, the lens
 * visuals and the HUD. Phase 0 keeps the human on white.
 */
export class PlaySession {
  private rules = new Rules();
  private meshes = new Map<Square, PieceMesh>();
  private tweens = new Set<Tween>();
  private effects: AttackEffects;
  private input: BoardInput;
  private selected: Square | null = null;
  private dragging: PieceMesh | null = null;
  private thinking = false;
  private lastReport: AttackReport | null = null;
  readonly human: Color = 'w';
  bot: BotSpec = BOTS[0]!;

  constructor(
    private board: BoardScene,
    private hud: Hud,
    private engine: Engine,
  ) {
    this.effects = new AttackEffects(board);
    this.input = new BoardInput(board);
    this.input.onDown = (p) => this.pointerDown(p.square, p.piece as PieceMesh | null);
    this.input.onMove = (_p, world) => this.pointerMove(world);
    this.input.onUp = (p) => this.pointerUp(p.square);
    board.onTick((dt) => this.tick(dt));
    hud.onNewGame = () => this.newGame();
    this.newGame();
  }

  newGame() {
    this.rules = new Rules();
    for (const m of this.meshes.values()) this.board.piecesGroup.remove(m);
    this.meshes.clear();
    this.tweens.clear();
    for (const p of this.rules.pieces()) this.addMesh(p.square, p.type, p.color);
    this.selected = null;
    this.dragging = null;
    this.thinking = false;
    this.lastReport = null;
    this.refreshLens();
    this.hud.say(['Your move. Aim your pieces at the black king.']);
    this.hud.setStatus(`You are White. ${this.bot.name} is Black.`);
    (window as unknown as { __game: unknown }).__game = this;
  }

  // ---------- input ----------
  private pointerDown(square: Square | null, piece: PieceMesh | null) {
    if (this.thinking || this.rules.isGameOver() || this.rules.turn() !== this.human) return;
    if (!square) return this.clearSelection();
    if (this.selected && this.rules.isLegal({ from: this.selected, to: square })) {
      void this.humanMove(this.selected, square);
      return;
    }
    const p = this.rules.pieceAt(square);
    if (p && p.color === this.human) {
      this.selected = square;
      this.dragging = piece && piece.userData.square === square ? piece : (this.meshes.get(square) ?? null);
      this.showTargets(square);
    } else {
      this.clearSelection();
    }
  }
  private pointerMove(world: THREE.Vector3) {
    if (!this.dragging) return;
    this.dragging.position.set(world.x, 0.45, world.z);
  }
  private pointerUp(square: Square | null) {
    if (!this.dragging) return;
    const from = this.dragging.userData.square;
    const mesh = this.dragging;
    this.dragging = null;
    if (square && square !== from && this.rules.isLegal({ from, to: square })) {
      mesh.position.copy(squareToWorld(square));
      void this.humanMove(from, square, false);
    } else {
      mesh.position.copy(squareToWorld(from));
    }
  }
  private showTargets(from: Square) {
    const map = new Map<Square, THREE.Color>();
    map.set(from, new THREE.Color(PALETTE.selected));
    for (const m of this.rules.legalMoves(from)) {
      map.set(m.to as Square, new THREE.Color(m.captured ? PALETTE.captureTarget : PALETTE.legalTarget));
    }
    this.effects.setHighlights(map);
  }
  private clearSelection() {
    this.selected = null;
    this.dragging = null;
    this.effects.setHighlights(new Map());
  }

  // ---------- moves ----------
  private async humanMove(from: Square, to: Square, animate = true) {
    const before = analyseAttack(this.rules.raw(), this.human);
    const diagBefore = diagnoseKing(this.rules.raw(), this.human);
    const mv = this.rules.play({ from, to });
    if (!mv) return this.clearSelection();
    this.clearSelection();
    this.applyMoveVisuals(mv, animate);
    const after = analyseAttack(this.rules.raw(), this.human);
    const diagAfter = diagnoseKing(this.rules.raw(), this.human);
    this.refreshLens();
    // The coach leads with WHY the king is in trouble, then what this move changed.
    const lines = coachLines(before, after, diagBefore, diagAfter);
    if (lines.length) this.hud.say(lines);
    if (this.checkGameOver()) return;
    await this.botMove();
  }

  private async botMove() {
    this.thinking = true;
    this.hud.setStatus(`${this.bot.name} is thinking…`);
    const uci = await pickBotMove(this.engine, this.rules.fen(), this.bot);
    const mv = this.rules.playUci(uci);
    this.thinking = false;
    if (!mv) {
      this.hud.setStatus('Engine returned an odd move; your turn.');
      return;
    }
    this.applyMoveVisuals(mv, true);
    this.refreshLens();
    this.hud.setStatus(`${this.bot.name} played ${mv.san}. Your move.`);
    if (this.rules.inCheck()) {
      this.hud.say(['You are in check. First question: can you answer with a bigger threat?']);
    } else {
      // Keep the why on screen: the standing diagnosis of the enemy king.
      const diag = diagnoseKing(this.rules.raw(), this.human)[0];
      if (diag) this.hud.say([diag.text]);
    }
    this.checkGameOver();
  }

  private checkGameOver(): boolean {
    if (!this.rules.isGameOver()) return false;
    if (this.rules.isCheckmate()) {
      const winner = this.rules.turn() === this.human ? this.bot.name : 'You';
      this.hud.say([winner === 'You' ? 'CHECKMATE! The king hunt is complete.' : `Checkmate. ${this.bot.name} got there first. Again?`]);
      this.hud.setStatus('Game over');
    } else {
      this.hud.say(['Draw. No king fell this time.']);
      this.hud.setStatus('Game over');
    }
    return true;
  }

  // ---------- visuals ----------
  private addMesh(square: Square, type: PieceMesh['userData']['type'], color: Color) {
    const m = makePiece(type, color, square);
    this.meshes.set(square, m);
    this.board.piecesGroup.add(m);
  }

  private applyMoveVisuals(mv: Move, animate: boolean) {
    const from = mv.from as Square;
    const to = mv.to as Square;
    const mover = this.meshes.get(from);
    if (!mover) return this.resyncAll();
    // capture (incl. en passant)
    let capSquare: Square | null = mv.captured ? to : null;
    if (mv.flags.includes('e')) capSquare = sq(to.charCodeAt(0) - 97, Number(to[1]) - 1 + (mv.color === 'w' ? -1 : 1));
    if (capSquare) {
      const victim = this.meshes.get(capSquare);
      if (victim) {
        this.meshes.delete(capSquare);
        this.tweens.add(tweenVanish(victim, () => this.board.piecesGroup.remove(victim)));
      }
    }
    this.meshes.delete(from);
    this.meshes.set(to, mover);
    mover.userData.square = to;
    if (animate) this.tweens.add(tweenMove(mover, squareToWorld(to)));
    else mover.position.copy(squareToWorld(to));
    // castling: move the rook too
    if (mv.flags.includes('k') || mv.flags.includes('q')) {
      const rank = mv.color === 'w' ? 0 : 7;
      const rf = mv.flags.includes('k') ? sq(7, rank) : sq(0, rank);
      const rt = mv.flags.includes('k') ? sq(5, rank) : sq(3, rank);
      const rook = this.meshes.get(rf);
      if (rook) {
        this.meshes.delete(rf);
        this.meshes.set(rt, rook);
        rook.userData.square = rt;
        this.tweens.add(tweenMove(rook, squareToWorld(rt), 0.3, 0.15));
      }
    }
    if (mv.promotion) {
      this.board.piecesGroup.remove(mover);
      this.meshes.delete(to);
      this.addMesh(to, mv.promotion, mv.color);
    }
  }

  private resyncAll() {
    for (const m of this.meshes.values()) this.board.piecesGroup.remove(m);
    this.meshes.clear();
    for (const p of this.rules.pieces()) this.addMesh(p.square, p.type, p.color);
  }

  private refreshLens() {
    const chess = this.rules.raw();
    const ours = analyseAttack(chess, this.human);
    const theirs = analyseAttack(chess, this.human === 'w' ? 'b' : 'w');
    const all = new Map<Square, number>();
    for (let f = 0; f < 8; f++)
      for (let r = 0; r < 8; r++) {
        const s = sq(f, r);
        // Only show general pressure in enemy territory or on enemy pieces:
        // glow on our own half is noise, not attack.
        const enemyHalf = this.human === 'w' ? r >= 4 : r <= 3;
        const onEnemy = chess.get(s)?.color === (this.human === 'w' ? 'b' : 'w');
        if (!enemyHalf && !onEnemy) continue;
        const n = chess.attackers(s, this.human).length;
        if (n) all.set(s, n);
      }
    this.effects.setReports(ours, theirs, all);
    this.hud.setAttack(ours);
    this.lastReport = ours;
  }

  private tick(dt: number) {
    for (const t of this.tweens) if (!t.update(dt)) this.tweens.delete(t);
  }

  /** For tooling / tests. */
  state() {
    return { fen: this.rules.fen(), report: this.lastReport, thinking: this.thinking };
  }
}
