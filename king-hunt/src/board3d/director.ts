import * as THREE from 'three';

export interface Shot {
  /** camera position at the end of the shot */
  pos: THREE.Vector3;
  /** what the camera looks at (interpolated too) */
  look: THREE.Vector3;
  duration: number; // seconds
  fov?: number;
  ease?: (t: number) => number;
  /** hold at the end before the next shot */
  hold?: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The camera director: plays shot lists, shakes and punches the camera, and
 * hands control back to the scene's normal framing when done.
 */
export class Director {
  active = false;
  private queue: Shot[] = [];
  private from = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
  private look = new THREE.Vector3(0, -0.4, 0);
  private t = 0;
  private holding = 0;
  private resolve: (() => void) | null = null;
  private shake = { amp: 0, time: 0, dur: 0 };
  private punch = 0;
  private skipRequested = false;
  onFinish: (() => void) | null = null;

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** Plays the shots in order. Resolves when done or skipped. */
  play(shots: Shot[]): Promise<void> {
    this.cancel();
    this.queue = [...shots];
    this.active = true;
    this.skipRequested = false;
    this.begin();
    return new Promise((r) => (this.resolve = r));
  }

  skip() {
    if (this.active) this.skipRequested = true;
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.queue = [];
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  shakeCamera(amp = 0.08, dur = 0.35) {
    this.shake = { amp, time: 0, dur };
  }
  punchIn(amount = 3) {
    this.punch = amount;
  }

  private begin() {
    this.from.pos.copy(this.camera.position);
    this.from.look.copy(this.look);
    this.from.fov = this.camera.fov;
    this.t = 0;
    this.holding = 0;
  }

  /** Called by the scene each frame. Returns true when it drove the camera. */
  update(dt: number): boolean {
    // Shake and punch apply on top of whatever else is happening.
    if (this.shake.time < this.shake.dur) {
      this.shake.time += dt;
      const k = 1 - this.shake.time / this.shake.dur;
      this.camera.position.x += (Math.random() - 0.5) * this.shake.amp * k;
      this.camera.position.y += (Math.random() - 0.5) * this.shake.amp * k;
    }
    if (this.punch > 0.01) {
      this.camera.fov -= this.punch;
      this.punch *= Math.pow(0.02, dt); // decays in ~1s
      this.camera.fov += this.punch;
      this.camera.updateProjectionMatrix();
    }
    if (!this.active) return false;
    const shot = this.queue[0];
    if (!shot || this.skipRequested) {
      this.finish();
      return false;
    }
    if (this.t < shot.duration) {
      this.t += dt;
      const k = (shot.ease ?? easeInOut)(Math.min(1, this.t / shot.duration));
      this.camera.position.lerpVectors(this.from.pos, shot.pos, k);
      this.look.lerpVectors(this.from.look, shot.look, k);
      if (shot.fov !== undefined) {
        this.camera.fov = this.from.fov + (shot.fov - this.from.fov) * k;
        this.camera.updateProjectionMatrix();
      }
      this.camera.lookAt(this.look);
      return true;
    }
    this.holding += dt;
    this.camera.lookAt(this.look);
    if (this.holding >= (shot.hold ?? 0)) {
      this.queue.shift();
      if (this.queue.length) this.begin();
      else this.finish();
    }
    return true;
  }

  private finish() {
    this.active = false;
    this.queue = [];
    const r = this.resolve;
    this.resolve = null;
    this.onFinish?.();
    r?.();
  }

  // Shot helpers --------------------------------------------------------
  static orbit(angle: number, radius: number, height: number, look = new THREE.Vector3(0, -0.4, 0)): { pos: THREE.Vector3; look: THREE.Vector3 } {
    return { pos: new THREE.Vector3(Math.sin(angle) * radius, height, Math.cos(angle) * radius), look };
  }
  static closeUp(target: THREE.Vector3, fromDir: THREE.Vector3, dist = 2.6, height = 1.6): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const d = fromDir.clone().setY(0).normalize().multiplyScalar(dist);
    return { pos: target.clone().add(d).setY(target.y + height), look: target.clone().setY(target.y + 0.5) };
  }
  static readonly easeInOut = easeInOut;
  static readonly easeOut = easeOut;
}
