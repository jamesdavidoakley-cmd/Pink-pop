import * as THREE from 'three';
import type { Move } from 'chess.js';
import type { Rules } from '../chess/rules';
import { sq, type Color, type PieceType, type Square } from '../chess/types';
import { makePiece, tweenMove, tweenVanish, type PieceMesh, type Tween } from './pieces';
import { squareToWorld } from './coords';
import type { BoardScene } from './scene';
import { AttackEffects } from './effects';
import { PALETTE } from './palette';
import { analyseAttack, type AttackReport } from '../chess/attack-lens';

/**
 * Owns the piece meshes and their animation for whatever position the
 * current mode is showing. Modes (play, puzzle) drive it; it never decides
 * chess rules itself.
 */
export class BoardView {
  readonly effects: AttackEffects;
  private meshes = new Map<Square, PieceMesh>();
  private tweens = new Set<Tween>();

  constructor(readonly scene: BoardScene) {
    this.effects = new AttackEffects(scene);
    scene.onTick((dt) => {
      for (const t of this.tweens) if (!t.update(dt)) this.tweens.delete(t);
    });
  }

  setPosition(rules: Rules) {
    for (const m of this.meshes.values()) this.scene.piecesGroup.remove(m);
    this.meshes.clear();
    this.tweens.clear();
    for (const p of rules.pieces()) this.add(p.square, p.type, p.color);
  }

  meshAt(square: Square): PieceMesh | undefined {
    return this.meshes.get(square);
  }

  private add(square: Square, type: PieceType, color: Color) {
    const m = makePiece(type, color, square);
    this.meshes.set(square, m);
    this.scene.piecesGroup.add(m);
  }

  /** Reflects an already-applied chess.js move. */
  applyMove(mv: Move, animate = true, rules?: Rules) {
    const from = mv.from as Square;
    const to = mv.to as Square;
    const mover = this.meshes.get(from);
    if (!mover) {
      if (rules) this.setPosition(rules);
      return;
    }
    let capSquare: Square | null = mv.captured ? to : null;
    if (mv.flags.includes('e')) capSquare = sq(to.charCodeAt(0) - 97, Number(to[1]) - 1 + (mv.color === 'w' ? -1 : 1));
    if (capSquare) {
      const victim = this.meshes.get(capSquare);
      if (victim) {
        this.meshes.delete(capSquare);
        this.tweens.add(tweenVanish(victim, () => this.scene.piecesGroup.remove(victim)));
      }
    }
    this.meshes.delete(from);
    this.meshes.set(to, mover);
    mover.userData.square = to;
    if (animate) this.tweens.add(tweenMove(mover, squareToWorld(to)));
    else mover.position.copy(squareToWorld(to));
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
      this.scene.piecesGroup.remove(mover);
      this.meshes.delete(to);
      this.add(to, mv.promotion, mv.color);
    }
  }

  /** Lifts a piece while dragging; `null` drops it back. */
  drag(square: Square, world: THREE.Vector3 | null) {
    const m = this.meshes.get(square);
    if (!m) return;
    if (world) m.position.set(world.x, 0.45, world.z);
    else m.position.copy(squareToWorld(square));
  }

  /** A quick "no" wobble for a wrong puzzle move. */
  shake(square: Square) {
    const m = this.meshes.get(square);
    if (!m) return;
    const base = squareToWorld(square);
    let t = 0;
    this.tweens.add({
      update(dt) {
        t += dt;
        m.position.x = base.x + Math.sin(t * 40) * 0.08 * Math.max(0, 1 - t / 0.35);
        if (t >= 0.35) {
          m.position.copy(base);
          return false;
        }
        return true;
      },
    });
  }

  showTargets(rules: Rules, from: Square) {
    const map = new Map<Square, THREE.Color>();
    map.set(from, new THREE.Color(PALETTE.selected));
    for (const m of rules.legalMoves(from)) {
      map.set(m.to as Square, new THREE.Color(m.captured ? PALETTE.captureTarget : PALETTE.legalTarget));
    }
    this.effects.setHighlights(map);
  }

  highlight(squares: Square[], color: number = PALETTE.selected) {
    const map = new Map<Square, THREE.Color>();
    for (const s of squares) map.set(s, new THREE.Color(color));
    this.effects.setHighlights(map);
  }

  clearHighlights() {
    this.effects.setHighlights(new Map());
  }

  /** Recomputes the lens for `side` and paints it. Returns our report. */
  paintLens(rules: Rules, side: Color): AttackReport {
    const chess = rules.raw();
    const ours = analyseAttack(chess, side);
    const theirs = analyseAttack(chess, side === 'w' ? 'b' : 'w');
    const all = new Map<Square, number>();
    for (let f = 0; f < 8; f++)
      for (let r = 0; r < 8; r++) {
        const s = sq(f, r);
        const enemyHalf = side === 'w' ? r >= 4 : r <= 3;
        const onEnemy = chess.get(s)?.color === (side === 'w' ? 'b' : 'w');
        if (!enemyHalf && !onEnemy) continue;
        const n = chess.attackers(s, side).length;
        if (n) all.set(s, n);
      }
    this.effects.setReports(ours, theirs, all);
    return ours;
  }
}
