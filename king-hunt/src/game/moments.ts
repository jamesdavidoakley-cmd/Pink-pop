import * as THREE from 'three';
import type { BoardScene } from '../board3d/scene';
import type { BoardView } from '../board3d/view';
import { Director } from '../board3d/director';
import { squareToWorld } from '../board3d/coords';
import type { CinemaOverlay } from '../cinema/overlay';
import { sfx } from '../audio/sfx';
import type { Color, Square } from '../chess/types';
import { checkers, explainMate } from '../chess/mate-explain';
import { PALETTE } from '../board3d/palette';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The cinematic moments. Sessions call these at the dramatic beats; each one
 * drives the camera director, the effects layer, the overlay and the sound,
 * and always resolves (tap to skip, reduced-motion shortens everything).
 */
export type CinemaLevel = 'full' | 'light' | 'off';

export class Moments {
  level: CinemaLevel = 'full';
  get enabled() {
    return this.level !== 'off';
  }
  /** Camera takes part (dives, sweeps) only at full. */
  private get camera() {
    return this.level === 'full' && !reduced();
  }

  constructor(
    private scene: BoardScene,
    private view: BoardView,
    private overlay: CinemaOverlay,
  ) {
    overlay.onSkip = () => scene.director.skip();
    view.onCapture = (at, victim) => {
      // Sound comes from the strike itself; here the camera reacts to the weight of the blow.
      const value = ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as Record<string, number>)[victim.userData.type] ?? 1;
      view.fx.shockwave(at, 0xffffff);
      scene.director.shakeCamera(0.05 + value * 0.012, 0.25 + value * 0.03);
      if (value >= 5) overlay.flash('rgba(255,255,255,.25)', 160);
    };
    view.fx.onLightning = () => {
      overlay.flash('rgba(200,225,255,.55)', 180);
      sfx.thunder();
      scene.director.shakeCamera(0.06, 0.4);
    };
    // The fight: when an attacker winds up beside a valuable victim, dive to board level to watch.
    view.onStrike = (at, fromDir, mover, victim) => {
      const value = ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as Record<string, number>)[victim.userData.type] ?? 0;
      if (!this.camera || value < 3 || scene.director.active) return;
      void this.strike(at, fromDir, mover.userData.type);
    };
  }

  /** Low, wide shot of the smash from the attacker's shoulder, then back to the game. */
  async strike(at: THREE.Vector3, fromDir: THREE.Vector3, attacker: string = 'p') {
    this.view.timeScale = 0.55;
    const side = fromDir.clone().setY(0).normalize();
    const right = new THREE.Vector3(-side.z, 0, side.x);
    // Knights and queens rise, so the camera sits a little higher and further back to keep them in frame.
    const tall = attacker === 'n' || attacker === 'q';
    const f = this.far();
    const pos = at.clone().addScaledVector(side, (tall ? -2.6 : -2.2) * f).addScaledVector(right, 1.3 * f).setY((tall ? 1.5 : 1.1) * f);
    await this.scene.director.play([{ pos, look: at.clone().setY(0.5), duration: 0.35, fov: 52, ease: Director.easeOut, hold: tall ? 1.15 : 0.95 }]);
    this.view.timeScale = 1;
  }

  private side(sideFacing: Color) {
    return sideFacing === 'w' ? 1 : -1;
  }

  /** Portrait screens are narrow: pull shots further out and higher so the king's zone fits. */
  private far() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    return aspect < 0.8 ? 1.5 : aspect < 1.1 ? 1.25 : 1;
  }

  /**
   * A shot that frames all of `points` whatever the screen shape: look at their centre from
   * `angle` (around the up axis) at `elevationDeg`, far enough back that the group fits the
   * narrower of the two fields of view with `pad` of air.
   */
  private fit(points: THREE.Vector3[], angle: number, elevationDeg = 52, fovMin = 44, pad = 1.25): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    const c = new THREE.Vector3();
    for (const p of points) c.add(p);
    c.divideScalar(Math.max(1, points.length));
    let r = 0.9;
    for (const p of points) r = Math.max(r, p.distanceTo(c) + 0.7);
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const narrow = Math.min(1, aspect); // on portrait the width is the limit
    // Keep the camera at a comfortable distance and widen the lens instead of flying off into
    // the fog; only when the lens is as wide as it may go does the distance grow.
    let dist = Math.min(11, Math.max(4.5, r * pad * 1.9));
    let half = Math.atan((r * pad) / (dist * narrow));
    const maxHalf = (82 / 2) * (Math.PI / 180);
    if (half > maxHalf) {
      half = maxHalf;
      dist = (r * pad) / (Math.tan(half) * narrow);
    }
    const fov = Math.max(fovMin, (half * 2 * 180) / Math.PI);
    const el = elevationDeg * (Math.PI / 180);
    const pos = c.clone().add(new THREE.Vector3(Math.sin(angle) * dist * Math.cos(el), dist * Math.sin(el), Math.cos(angle) * dist * Math.cos(el)));
    return { pos, look: c.clone().setY(narrow < 1 ? -0.5 : 0.2), fov }; // tilt down a touch on portrait so the board sits higher
  }

  /** Squares that matter in a mate: the king's zone, the checker(s) and the pieces covering escapes. */
  private mateFocus(fen: string, kingSquare: Square): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const kf = kingSquare.charCodeAt(0) - 97;
    const kr = Number(kingSquare[1]) - 1;
    for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
      const f = kf + df, r = kr + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8) pts.push(squareToWorld(`${'abcdefgh'[f]}${r + 1}` as Square));
    }
    try {
      for (const b of checkers(fen).by) pts.push(squareToWorld(b));
      for (const beat of explainMate(fen, 5).beats) if (beat.by) pts.push(squareToWorld(beat.by));
    } catch { /* fen unavailable */ }
    return pts;
  }

  /** Opening: a low sweep across the board under a title. */
  async intro(big: string, kicker = '', sub = '', facing: Color = 'w') {
    if (!this.enabled) return;
    if (!this.camera) {
      await this.overlay.showTitle(big, kicker, sub, 900);
      return;
    }
    const z = this.side(facing);
    this.overlay.letterbox(true);
    sfx.whoosh();
    const title = this.overlay.showTitle(big, kicker, sub, 2300);
    const look = new THREE.Vector3(0, -0.2, 0);
    // Start low and wide on the far side, sweep round to behind the player's army.
    this.scene.camera.position.set(-7 * z, 1.4, -6 * z);
    await this.scene.director.play([
      { ...Director.orbit(Math.PI * (z > 0 ? 1.35 : 0.35), 9.5, 2.2, look), duration: 0.01 },
      { ...Director.orbit(Math.PI * (z > 0 ? 1.95 : 0.95), 9.0, 4.2, look), duration: 2.2, ease: Director.easeInOut },
    ]);
    await title;
    this.overlay.letterbox(false);
  }

  /** A piece is given away on purpose: slow motion, push-in, thud. */
  async sacrifice(from: Square, to: Square, facing: Color = 'w') {
    if (!this.enabled) return;
    if (!this.camera) {
      sfx.thud();
      this.view.fx.shockwave(squareToWorld(to));
      return;
    }
    const target = squareToWorld(to);
    const fromDir = squareToWorld(from).sub(target);
    this.view.timeScale = 0.22;
    sfx.whoosh();
    const shot = Director.closeUp(target, fromDir.length() > 0.1 ? fromDir : new THREE.Vector3(0, 0, this.side(facing)), 3.8 * this.far(), 2.4 * this.far());
    await this.scene.director.play([{ ...shot, duration: 0.9, fov: 36, ease: Director.easeOut, hold: 0.5 }]);
    this.view.timeScale = 1;
    this.view.fx.shockwave(target);
    sfx.thud();
    this.scene.director.shakeCamera(0.12, 0.45);
    this.overlay.flash('rgba(255,106,26,.35)', 220);
    await sleep(350);
  }

  /** Check: red edge pulse, a sting, a small shake. */
  check() {
    if (!this.enabled) return;
    this.overlay.danger();
    sfx.check();
    this.scene.director.shakeCamera(0.04, 0.2);
  }

  /** Puzzle solved / plan step landed: a chime and a quick punch-in. */
  hit() {
    if (!this.enabled) return;
    sfx.chime();
    this.scene.director.punchIn(2.5);
  }

  wrong() {
    if (!this.enabled) return;
    sfx.wrong();
  }

  /** Storm level over the enemy king, from the attack score (0..100). */
  storm(score: number, kingSquare: Square | null) {
    const level = score >= 100 ? 1 : score >= 60 ? (score - 60) / 40 : 0;
    this.view.fx.storm(this.enabled ? level : 0, kingSquare ? squareToWorld(kingSquare) : null);
  }

  private skipTour = false;

  /**
   * Checkmate. First the lesson: the king tries each escape as a red ghost while the
   * piece that covers it lights up with a beam and a caption says why. Then lightning,
   * the topple, the title. Tap skips the tour.
   */
  async mate(kingSquare: Square, winner: 'you' | 'them', facing: Color = 'w', fen?: string) {
    const king = squareToWorld(kingSquare);
    if (!this.enabled) {
      this.view.topple(kingSquare, king.clone().add(new THREE.Vector3(0, 0, this.side(facing))));
      return;
    }
    if (!this.camera) {
      this.view.topple(kingSquare, king.clone().add(new THREE.Vector3(0, 0, this.side(facing))));
      if (winner === 'you') sfx.fanfare();
      await this.overlay.showTitle(winner === 'you' ? 'Checkmate' : 'Mated', winner === 'you' ? 'The king hunt is complete' : '', '', 1400);
      return;
    }
    this.overlay.letterbox(true);
    this.view.fx.storm(1, king);
    const dir = new THREE.Vector3(0.6, 0, this.side(facing)).normalize();
    const f = this.far();
    const a0 = Math.atan2(dir.x, dir.z);
    // Wide enough to see the king, every square around it, and the pieces doing the mating.
    const focus = fen ? this.mateFocus(fen, kingSquare) : [king];
    const close = this.fit(focus, a0 - 0.4);
    await this.scene.director.play([{ ...close, duration: 0.9, ease: Director.easeOut, hold: 0.15 }]);
    if (fen) await this.escapeTour(fen, kingSquare, dir);
    if (this.skipTour) this.skipTour = false;
    // The execution: the checking piece comes for the king.
    let executed = false;
    if (fen) {
      try {
        const c = checkers(fen);
        const attacker = c.by[0];
        if (attacker) {
          const from = squareToWorld(attacker);
          const approachDir = king.clone().sub(from).setY(0).normalize();
          const side = new THREE.Vector3(-approachDir.z, 0, approachDir.x);
          const name = ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as Record<string, string>)[this.view.meshAt(attacker)?.userData.type ?? 'p'];
          this.overlay.caption(`The ${name} on ${attacker} takes the king.`);
          const run = this.view.executeKing(attacker, kingSquare);
          // Low three-quarter shot: between attacker and king, off to the side, looking at the king.
          void side;
          const shot = this.fit([king, from, ...this.mateFocus(fen, kingSquare).slice(0, 9)], Math.atan2(approachDir.x, approachDir.z) + 0.9, 38, 46, 1.2);
          void this.scene.director.play([{ ...shot, duration: 0.5, ease: Director.easeOut, hold: 8 }]);
          this.view.timeScale = 0.7;
          await run.impact;
          this.view.timeScale = 1;
          this.view.fx.lightning(king);
          this.scene.director.shakeCamera(0.16, 0.5);
          this.overlay.flash('rgba(255,255,255,.4)', 200);
          executed = true;
          await run.done;
          this.scene.director.cancel();
        }
      } catch {
        executed = false;
      }
    }
    if (!executed) {
      this.view.fx.lightning(king);
      await sleep(140);
      this.view.topple(kingSquare, king.clone().add(dir));
      this.view.fx.shockwave(king, 0xff3b1a);
      sfx.thud();
    }
    this.overlay.caption('');
    const title = this.overlay.showTitle(winner === 'you' ? 'Checkmate' : 'Mated', winner === 'you' ? 'The king hunt is complete' : 'Their hunt got there first', '', 2600);
    if (winner === 'you') sfx.fanfare();
    const zone = fen ? this.mateFocus(fen, kingSquare).slice(0, 9) : [king];
    await this.scene.director.play([
      { ...this.fit(zone, a0 + 1.3, 45, 40, 1.4), duration: 2.4, ease: Director.easeInOut, hold: 0.3 },
    ]);
    void f;
    await title;
    this.view.fx.storm(0, null);
    this.overlay.letterbox(false);
  }

  /** The king tries every way out and the board answers each one. */
  private async escapeTour(fen: string, kingSquare: Square, dir: THREE.Vector3) {
    let info: ReturnType<typeof explainMate>;
    try {
      info = explainMate(fen, 5);
    } catch {
      return;
    }
    if (info.beats.length === 0) return;
    this.skipTour = false;
    const prevSkip = this.overlay.onSkip;
    this.overlay.onSkip = () => {
      this.skipTour = true;
      this.scene.director.skip();
    };
    const king = squareToWorld(kingSquare);
    const a0 = Math.atan2(dir.x, dir.z);
    // A slow drift while the tour plays (not awaited): the escape zone, the checker and the
    // pieces covering the escapes all stay in frame on any screen.
    const total = info.beats.length * 1.75 + 0.6;
    const focus = this.mateFocus(fen, kingSquare);
    const start = this.fit(focus, a0 - 0.4);
    const end = this.fit(focus, a0 + 0.5);
    void this.scene.director.play([
      { ...start, duration: 0.01 },
      { ...end, duration: total, ease: (t) => t },
    ]);
    void king;
    this.overlay.caption(`${info.mated === 'w' ? 'White' : 'Black'}'s king looks for a way out.`);
    sfx.windup();
    await sleep(900);
    for (const b of info.beats) {
      if (this.skipTour) break;
      this.overlay.caption(b.text);
      const tiles = new Map<Square, THREE.Color>();
      tiles.set(b.square, new THREE.Color(b.kind === 'own' ? PALETTE.selected : PALETTE.captureTarget));
      if (b.by) tiles.set(b.by, new THREE.Color(PALETTE.heatHot));
      this.view.effects.setHighlights(tiles);
      if (b.kind === 'covered' || b.kind === 'own' || b.kind === 'guarded') {
        if (b.by) {
          this.view.flashPiece(b.by);
          this.view.fx.beam(squareToWorld(b.by), squareToWorld(b.square));
        }
        sfx.wrong();
        await this.view.ghostKing(info.mated, kingSquare, b.square, b.kind === 'own');
      } else {
        // The checker: light it, beam to the king, and the would-be taker if any.
        this.view.flashPiece(b.square, 0xffffff);
        this.view.fx.beam(squareToWorld(b.square), king, 0xffffff);
        if (b.by) this.view.flashPiece(b.by, 0x3aa0ff);
        sfx.check();
        await sleep(1500);
      }
      if (this.skipTour) break;
      await sleep(250);
    }
    this.view.clearHighlights();
    this.overlay.caption(this.skipTour ? '' : 'No way out.');
    if (!this.skipTour) await sleep(700);
    this.overlay.caption('');
    this.scene.director.cancel();
    this.overlay.onSkip = prevSkip;
  }

  /** A rung unlocked: title over a slow pull-back. */
  async unlock(title: string) {
    if (!this.enabled) return;
    sfx.fanfare();
    this.overlay.flash('rgba(255,176,46,.5)', 400);
    await this.overlay.showTitle(title, 'New rung unlocked', '', 2200);
  }
}
