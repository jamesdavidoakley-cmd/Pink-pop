import * as THREE from 'three';
import type { BoardScene } from '../board3d/scene';
import type { BoardView } from '../board3d/view';
import { Director } from '../board3d/director';
import { squareToWorld } from '../board3d/coords';
import type { CinemaOverlay } from '../cinema/overlay';
import { sfx } from '../audio/sfx';
import type { Color, Square } from '../chess/types';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The cinematic moments. Sessions call these at the dramatic beats; each one
 * drives the camera director, the effects layer, the overlay and the sound,
 * and always resolves (tap to skip, reduced-motion shortens everything).
 */
export class Moments {
  enabled = true;

  constructor(
    private scene: BoardScene,
    private view: BoardView,
    private overlay: CinemaOverlay,
  ) {
    overlay.onSkip = () => scene.director.skip();
    view.onCapture = (at) => {
      sfx.capture();
      view.fx.shockwave(at, 0xffffff);
      scene.director.shakeCamera(0.05, 0.25);
    };
    view.fx.onLightning = () => {
      overlay.flash('rgba(200,225,255,.55)', 180);
      sfx.thunder();
      scene.director.shakeCamera(0.06, 0.4);
    };
  }

  private side(sideFacing: Color) {
    return sideFacing === 'w' ? 1 : -1;
  }

  /** Opening: a low sweep across the board under a title. */
  async intro(big: string, kicker = '', sub = '', facing: Color = 'w') {
    if (!this.enabled || reduced()) {
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
    if (!this.enabled || reduced()) return;
    const target = squareToWorld(to);
    const fromDir = squareToWorld(from).sub(target);
    this.view.timeScale = 0.22;
    sfx.whoosh();
    const shot = Director.closeUp(target, fromDir.length() > 0.1 ? fromDir : new THREE.Vector3(0, 0, this.side(facing)), 3.2, 2.0);
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

  /** Checkmate: lightning, the king topples, the camera swoops, the title slams. */
  async mate(kingSquare: Square, winner: 'you' | 'them', facing: Color = 'w') {
    const king = squareToWorld(kingSquare);
    if (!this.enabled || reduced()) {
      this.view.topple(kingSquare, king.clone().add(new THREE.Vector3(0, 0, this.side(facing))));
      await this.overlay.showTitle(winner === 'you' ? 'Checkmate' : 'Mated', winner === 'you' ? 'The king hunt is complete' : '', '', 1400);
      return;
    }
    this.overlay.letterbox(true);
    this.view.fx.storm(1, king);
    const dir = new THREE.Vector3(0.6, 0, this.side(facing)).normalize();
    const close = Director.closeUp(king, dir, 2.6, 1.5);
    await this.scene.director.play([{ ...close, duration: 0.8, fov: 34, ease: Director.easeOut, hold: 0.15 }]);
    this.view.fx.lightning(king);
    await sleep(140);
    this.view.topple(kingSquare, king.clone().add(dir));
    this.view.fx.shockwave(king, 0xff3b1a);
    sfx.thud();
    const title = this.overlay.showTitle(winner === 'you' ? 'Checkmate' : 'Mated', winner === 'you' ? 'The king hunt is complete' : 'Their hunt got there first', '', 2600);
    if (winner === 'you') sfx.fanfare();
    const look = king.clone().setY(0.4);
    const a0 = Math.atan2(dir.x, dir.z);
    await this.scene.director.play([
      { pos: king.clone().add(new THREE.Vector3(Math.sin(a0 + 1.2) * 3.4, 2.2, Math.cos(a0 + 1.2) * 3.4)), look, duration: 2.4, fov: 38, ease: Director.easeInOut, hold: 0.3 },
    ]);
    await title;
    this.view.fx.storm(0, null);
    this.overlay.letterbox(false);
  }

  /** A rung unlocked: title over a slow pull-back. */
  async unlock(title: string) {
    if (!this.enabled) return;
    sfx.fanfare();
    this.overlay.flash('rgba(255,176,46,.5)', 400);
    await this.overlay.showTitle(title, 'New rung unlocked', '', 2200);
  }
}
