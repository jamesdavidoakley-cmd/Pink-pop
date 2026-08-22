import { TUNING } from '../game/tuning';
import type { Vec2 } from '../game/math';

export interface CamState {
  x: number;
  y: number;
  heading: number;
  crouched: boolean;
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface CamPoint { fx: number; fy: number }

export interface Billboard {
  /** Screen x of the centre line. */
  sx: number;
  feetY: number;
  headY: number;
  halfW: number;
  /** Distance along the camera axis, metres. */
  fwd: number;
  /** True distance, metres. */
  dist: number;
  /** Signed angle off the camera axis, radians. */
  rel: number;
}

/**
 * A pinhole camera on a flat floor. The viewfinder, the contact sheet
 * thumbnails and the shot scorer all project through this one object, so
 * what you are scored on is exactly what you saw.
 */
export class Projector {
  readonly focal: number;
  readonly cx: number;
  readonly horizonY: number;
  readonly eye: number;
  private readonly cos: number;
  private readonly sin: number;

  constructor(readonly cam: CamState, readonly frame: Rect) {
    this.focal = frame.w / 2 / Math.tan(TUNING.camera.fovH / 2);
    this.cx = frame.x + frame.w / 2;
    this.horizonY = frame.y + frame.h * TUNING.camera.horizonFrac;
    this.eye = cam.crouched ? TUNING.camera.eyeCrouched : TUNING.camera.eyeStanding;
    this.cos = Math.cos(cam.heading);
    this.sin = Math.sin(cam.heading);
  }

  toCam(p: Vec2): CamPoint {
    const dx = p.x - this.cam.x;
    const dy = p.y - this.cam.y;
    return { fx: dx * this.cos + dy * this.sin, fy: -dx * this.sin + dy * this.cos };
  }

  screenX(c: CamPoint): number {
    return this.cx + (this.focal * c.fy) / Math.max(c.fx, TUNING.camera.nearPlane);
  }

  /** Screen y of a point `h` metres above the floor at camera-space `c`. */
  screenY(c: CamPoint, h: number): number {
    return this.horizonY + (this.focal * (this.eye - h)) / Math.max(c.fx, TUNING.camera.nearPlane);
  }

  /** Clip a camera-space segment against the near plane. Null if wholly behind. */
  clipNear(a: CamPoint, b: CamPoint): [CamPoint, CamPoint] | null {
    const n = TUNING.camera.nearPlane;
    const aIn = a.fx >= n;
    const bIn = b.fx >= n;
    if (!aIn && !bIn) return null;
    if (aIn && bIn) return [a, b];
    const t = (n - a.fx) / (b.fx - a.fx);
    const mid: CamPoint = { fx: n, fy: a.fy + (b.fy - a.fy) * t };
    return aIn ? [a, mid] : [mid, b];
  }

  /** A standing body of `height` metres and `width` metres, facing the lens. */
  billboard(p: Vec2, height: number, width: number): Billboard | null {
    const c = this.toCam(p);
    if (c.fx < TUNING.camera.nearPlane) return null;
    const dist = Math.hypot(c.fx, c.fy);
    return {
      sx: this.screenX(c),
      feetY: this.screenY(c, 0),
      headY: this.screenY(c, height),
      halfW: (this.focal * (width / 2)) / c.fx,
      fwd: c.fx,
      dist,
      rel: Math.atan2(c.fy, c.fx),
    };
  }

  /** Is any part of this billboard inside the frame? */
  onScreen(b: Billboard): boolean {
    return b.sx + b.halfW > this.frame.x && b.sx - b.halfW < this.frame.x + this.frame.w && b.feetY > this.frame.y;
  }
}

/** The frame rectangle inside a panel, at the camera's aspect ratio. */
export function frameRect(px: number, py: number, pw: number, ph: number, inset = 0): Rect {
  const aspect = TUNING.camera.frameAspect;
  const availW = pw - inset * 2;
  const availH = ph - inset * 2;
  let w = availH * aspect;
  let h = availH;
  if (w > availW) {
    w = availW;
    h = availW / aspect;
  }
  return { x: px + (pw - w) / 2, y: py + (ph - h) / 2, w, h };
}
