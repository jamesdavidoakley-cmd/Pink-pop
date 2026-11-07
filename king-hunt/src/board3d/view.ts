import * as THREE from 'three';
import type { Move } from 'chess.js';
import type { Rules } from '../chess/rules';
import { sq, type Color, type PieceType, type Square } from '../chess/types';
import { makePiece, sequence, strikeStyle, tweenBrace, tweenMove, tweenStrike, type PieceMesh, type Tween } from './pieces';
import { sfx } from '../audio/sfx';
import { squareToWorld } from './coords';
import type { BoardScene } from './scene';
import { AttackEffects } from './effects';
import { PALETTE } from './palette';
import { analyseAttack, type AttackReport } from '../chess/attack-lens';
import { Fx } from './fx';

/**
 * Owns the piece meshes and their animation for whatever position the
 * current mode is showing. Modes (play, puzzle) drive it; it never decides
 * chess rules itself.
 */
export class BoardView {
  readonly effects: AttackEffects;
  readonly fx: Fx;
  private meshes = new Map<Square, PieceMesh>();
  private tweens = new Set<Tween>();
  /** Bumped on every setPosition so delayed effects from a previous position are dropped. */
  private generation = 0;
  /** 1 = normal; < 1 slows piece animation (sacrifice slow-motion). */
  timeScale = 1;
  /** Called with the captured piece's world position and colour (for sound and camera). */
  onCapture: ((at: THREE.Vector3, victim: PieceMesh) => void) | null = null;
  /** Called when a fight begins: the attacker has arrived beside its victim and is winding up. */
  onStrike: ((at: THREE.Vector3, fromDir: THREE.Vector3, mover: PieceMesh, victim: PieceMesh) => void) | null = null;
  private awake: PieceMesh | null = null;
  /** Pieces of this side breathe very slightly: they are alive and it is their move. */
  liveSide: Color | null = null;
  private breath = 0;

  constructor(readonly scene: BoardScene) {
    this.effects = new AttackEffects(scene);
    this.fx = new Fx(scene);
    // Piece animation runs on wall-clock time (capped) so choreography keeps its timing on slow devices.
    scene.onTick((_dt, t, realDt) => {
      const d = realDt * this.timeScale;
      for (const tw of this.tweens) if (!tw.update(d)) this.tweens.delete(tw);
      // Idle breathing: a 1% scale pulse on the side to move, staggered per piece.
      this.breath = t;
      if (this.liveSide && this.tweens.size === 0) {
        for (const m of this.meshes.values()) {
          if (m.userData.color !== this.liveSide || m === this.awake) continue;
          const seed = m.position.x * 1.7 + m.position.z * 2.3;
          const k = 1 + 0.01 * Math.sin(t * 1.6 + seed);
          m.scale.set(1, k, 1);
        }
      }
    });
  }

  setPosition(rules: Rules) {
    this.generation++;
    this.liveSide = rules.turn();
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

  /** Resolves when no piece animation is running (so replies wait for the fight to end). */
  whenIdle(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.tweens.size === 0) resolve();
        else window.setTimeout(check, 60);
      };
      check();
    });
  }

  /** Reflects an already-applied chess.js move. Captures are fights: approach, wind up, smash, settle. */
  applyMove(mv: Move, animate = true, rules?: Rules) {
    const from = mv.from as Square;
    const to = mv.to as Square;
    const mover = this.meshes.get(from);
    if (!mover) {
      if (rules) this.setPosition(rules);
      return;
    }
    this.sleep();
    let capSquare: Square | null = mv.captured ? to : null;
    if (mv.flags.includes('e')) capSquare = sq(to.charCodeAt(0) - 97, Number(to[1]) - 1 + (mv.color === 'w' ? -1 : 1));
    const victim = capSquare ? this.meshes.get(capSquare) : undefined;
    if (capSquare && victim) this.meshes.delete(capSquare);
    this.meshes.delete(from);
    this.meshes.set(to, mover);
    mover.userData.square = to;
    const dest = squareToWorld(to);
    const gen = this.generation;
    if (!animate) {
      mover.position.copy(dest);
      if (victim) this.scene.piecesGroup.remove(victim);
    } else if (victim) {
      const at = victim.position.clone();
      const color = (victim.material as THREE.MeshStandardMaterial).color.getHex();
      const dir = at.clone().sub(mover.position).setY(0).normalize();
      const style = strikeStyle(mover.userData.type);
      const approach = at.clone().addScaledVector(dir, style === 'smash' ? -0.95 : -0.62);
      this.fx.puff(mover.position.clone(), 3);
      this.tweens.add(
        sequence([
          () => tweenMove(mover, approach, style === 'smash' ? 0.26 : 0.32, style === 'stomp' ? 0.3 : 0.2),
          () => {
            if (gen === this.generation) {
              this.onStrike?.(at, dir, mover, victim);
              sfx.swing(style);
              this.tweens.add(tweenBrace(victim, mover.position.clone()));
            }
            return tweenStrike(mover, dir, style, () => {
              this.scene.piecesGroup.remove(victim);
              if (gen !== this.generation) return;
              this.fx.shatter(at, color, style === 'smash' || style === 'chop' ? 34 : 24, dir);
              this.fx.puff(at, style === 'slash' ? 5 : 9, color);
              sfx.strike(style);
              this.onCapture?.(at, victim);
            });
          },
          () => tweenMove(mover, dest, 0.22, 0.08),
        ]),
      );
    } else {
      this.fx.puff(mover.position.clone(), 2);
      this.tweens.add(tweenMove(mover, dest));
    }
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

  /**
   * The execution: the checking piece walks up to the king, winds up and strikes in its own
   * style; the king bursts into rubble and the attacker takes the square. Resolves at impact
   * (so lightning and sound can land with it) and again when the attacker has settled.
   */
  executeKing(attacker: Square, king: Square): { impact: Promise<void>; done: Promise<void> } {
    const mover = this.meshes.get(attacker);
    const victim = this.meshes.get(king);
    let impactResolve: () => void = () => {};
    let doneResolve: () => void = () => {};
    const impact = new Promise<void>((r) => (impactResolve = r));
    const done = new Promise<void>((r) => (doneResolve = r));
    if (!mover || !victim) {
      impactResolve();
      doneResolve();
      return { impact, done };
    }
    this.sleep();
    this.liveSide = null;
    const at = victim.position.clone().setY(0);
    const dir = at.clone().sub(mover.position).setY(0).normalize();
    const style = strikeStyle(mover.userData.type);
    const approach = at.clone().addScaledVector(dir, style === 'smash' ? -0.95 : -0.62);
    const color = (victim.material as THREE.MeshStandardMaterial).color.getHex();
    const gen = this.generation;
    this.fx.puff(mover.position.clone(), 3);
    this.tweens.add(
      sequence([
        () => tweenMove(mover, approach, 0.55, 0.12),
        () => {
          if (gen === this.generation) {
            sfx.swing(style);
            this.tweens.add(tweenBrace(victim, mover.position.clone()));
          }
          return tweenStrike(mover, dir, style, () => {
            this.scene.piecesGroup.remove(victim);
            this.meshes.delete(king);
            if (gen !== this.generation) return;
            this.fx.shatter(at.clone().setY(0.3), color, 44, dir);
            this.fx.puff(at, 12, color);
            this.fx.shockwave(at, 0xff3b1a);
            sfx.strike(style);
            impactResolve();
          });
        },
        () => tweenMove(mover, at, 0.3, 0.1),
        () => {
          impactResolve(); // safety: never leave the cut scene waiting
          doneResolve();
          return { update: () => false };
        },
      ]),
    );
    // Keep the mesh map honest: the attacker now stands on the king's square.
    this.meshes.delete(attacker);
    this.meshes.set(king, mover);
    mover.userData.square = king;
    return { impact, done };
  }

  /** A translucent red copy of the king that tries an escape square and either arrives or bumps back. */
  ghostKing(color: Color, from: Square, to: Square, blocked: boolean): Promise<void> {
    const g = makePiece('k', color, from);
    const mat = g.material as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mat.opacity = 0.55;
    mat.color.setHex(0xff5a3a);
    mat.emissive.setHex(0xff3b1a);
    mat.emissiveIntensity = 0.8;
    g.castShadow = false;
    this.scene.piecesGroup.add(g);
    const dest = squareToWorld(to);
    const target = blocked ? g.position.clone().lerp(dest, 0.45) : dest;
    return new Promise((resolve) => {
      this.tweens.add(
        sequence([
          () => tweenMove(g, target, 0.4, 0.18),
          () => {
            let t = 0;
            return {
              update: (dt) => {
                t += dt;
                if (blocked && t < 0.25) g.position.x += Math.sin(t * 60) * 0.02; // bump
                return t < 0.75;
              },
            };
          },
          () => {
            let t = 0;
            return {
              update: (dt) => {
                t += dt;
                mat.opacity = Math.max(0, 0.55 * (1 - t / 0.3));
                if (t >= 0.3) {
                  this.scene.piecesGroup.remove(g);
                  resolve();
                  return false;
                }
                return true;
              },
            };
          },
        ]),
      );
    });
  }

  /** Briefly light a piece up (the one that covers an escape square). */
  flashPiece(square: Square, color = 0xff6a1a, ms = 1100) {
    const m = this.meshes.get(square);
    if (!m) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const prevHex = mat.emissive.getHex();
    const prevI = mat.emissiveIntensity;
    mat.emissive.setHex(color);
    mat.emissiveIntensity = 1.1;
    window.setTimeout(() => {
      mat.emissive.setHex(prevHex);
      mat.emissiveIntensity = prevI;
    }, ms);
  }

  /** A selected piece wakes: it lifts and glows until it moves or is put back. */
  wake(square: Square) {
    this.sleep();
    const m = this.meshes.get(square);
    if (!m) return;
    this.awake = m;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.emissive.setHex(0xffb02e);
    mat.emissiveIntensity = 0.35;
    m.position.y = 0.12;
  }
  sleep() {
    const m = this.awake;
    if (!m) return;
    this.awake = null;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.emissive.setHex(m.userData.color === 'b' ? 0x0b2a3a : 0x000000);
    mat.emissiveIntensity = m.userData.color === 'b' ? 0.35 : 0;
    if (m.position.y === 0.12) m.position.y = 0;
  }

  /** The mated king falls over. */
  topple(square: Square, towards: THREE.Vector3) {
    const m = this.meshes.get(square);
    if (!m) return;
    const dir = towards.clone().sub(m.position).setY(0).normalize();
    const axis = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    let t = 0;
    const base = m.position.clone();
    this.tweens.add({
      update(dt) {
        t = Math.min(1, t + dt / 0.9);
        const k = t < 0.7 ? Math.pow(t / 0.7, 2) : 1 + Math.sin((t - 0.7) / 0.3 * Math.PI) * 0.06 * (1 - t);
        m.quaternion.setFromAxisAngle(axis, (Math.PI / 2) * Math.min(1, k));
        m.position.copy(base).addScaledVector(dir, 0.35 * Math.min(1, k));
        return t < 1;
      },
    });
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
    this.liveSide = rules.isGameOver() ? null : rules.turn();
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
