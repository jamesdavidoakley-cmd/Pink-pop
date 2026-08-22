import { TUNING } from '../game/tuning';
import { clamp } from '../game/math';
import { PALETTE, shade, withAlpha } from './palette';
import { bodyTones, drawGuestBillboard } from './sprites';
import { brightnessAt, litness, rimAt } from './lighting';
import { Projector, type CamPoint, type CamState, type Rect } from './projection';
import { facingnessOf } from '../game/scoring';
import type { FrameGuest, Furniture, SceneDef } from '../game/types';

export interface FrameParticle {
  x: number;
  y: number;
  z: number;
  r: number;
  tone: string;
}

export interface FrameRenderOpts {
  scene: SceneDef;
  cam: CamState;
  guests: FrameGuest[];
  particles: FrameParticle[];
  frame: Rect;
  time: number;
  /** 0 = camera at the hip and dim, 1 = up at the eye. */
  exposure: number;
  detail?: boolean;
}

interface Drawable {
  fwd: number;
  draw: () => void;
}

const BIG = 12000;
const clampX = (x: number) => (x < -BIG ? -BIG : x > BIG ? BIG : x);

function wallQuad(ctx: CanvasRenderingContext2D, proj: Projector, a: { x: number; y: number }, b: { x: number; y: number }, h0: number, h1: number): boolean {
  const clipped = proj.clipNear(proj.toCam(a), proj.toCam(b));
  if (!clipped) return false;
  const [ca, cb] = clipped;
  const ax = clampX(proj.screenX(ca));
  const bx = clampX(proj.screenX(cb));
  ctx.beginPath();
  ctx.moveTo(ax, proj.screenY(ca, h0));
  ctx.lineTo(ax, proj.screenY(ca, h1));
  ctx.lineTo(bx, proj.screenY(cb, h1));
  ctx.lineTo(bx, proj.screenY(cb, h0));
  ctx.closePath();
  return true;
}

/** Clip a convex polygon in camera space against the near plane. */
function clipPolyNear(pts: CamPoint[]): CamPoint[] {
  const n = TUNING.camera.nearPlane;
  const out: CamPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const aIn = a.fx >= n;
    const bIn = b.fx >= n;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (n - a.fx) / (b.fx - a.fx);
      out.push({ fx: n, fy: a.fy + (b.fy - a.fy) * t });
    }
  }
  return out;
}

/** The pool of light a window throws across the floor. */
function drawFloorLight(ctx: CanvasRenderingContext2D, proj: Projector, scene: SceneDef) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const d = scene.lightDir;
  if (d) {
    const reach = 9.5;
    const spread = 2.2;
    for (const w of scene.windows) {
      const world = [
        { x: w.a.x, y: w.a.y },
        { x: w.b.x, y: w.b.y },
        { x: w.b.x + d.x * reach + d.y * spread, y: w.b.y + d.y * reach - d.x * spread },
        { x: w.a.x + d.x * reach - d.y * spread, y: w.a.y + d.y * reach + d.x * spread },
      ];
      const poly = clipPolyNear(world.map((p) => proj.toCam(p)));
      if (poly.length < 3) continue;
      ctx.beginPath();
      poly.forEach((c, i) => {
        const x = clampX(proj.screenX(c));
        const y = proj.screenY(c, 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      const near = proj.screenY(proj.toCam({ x: w.a.x, y: w.a.y }), 0);
      const g = ctx.createLinearGradient(0, near, 0, proj.horizonY);
      g.addColorStop(0, withAlpha(PALETTE.glass, 0.3 * w.strength));
      g.addColorStop(1, withAlpha(PALETTE.glass, 0.02));
      ctx.fillStyle = g;
      ctx.fill();
    }
  } else if (scene.lightPoint) {
    const poly: CamPoint[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      poly.push(proj.toCam({ x: scene.lightPoint.x + Math.cos(a) * 3.2, y: scene.lightPoint.y + Math.sin(a) * 3.2 }));
    }
    const clipped = clipPolyNear(poly);
    if (clipped.length >= 3) {
      ctx.beginPath();
      clipped.forEach((c, i) => {
        const x = clampX(proj.screenX(c));
        const y = proj.screenY(c, 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = withAlpha(PALETTE.glass, 0.1);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawFurnitureBillboard(ctx: CanvasRenderingContext2D, f: Furniture, proj: Projector, scene: SceneDef) {
  const width = f.shape === 'roundTable' ? f.w : Math.max(f.w, f.d);
  const b = proj.billboard(f, f.height, width);
  if (!b || !proj.onScreen(b)) return;
  const lit = brightnessAt(scene, f.x, f.y);
  const top = b.headY;
  const bottom = b.feetY;
  const hw = b.halfW;
  ctx.save();
  switch (f.shape) {
    case 'chair':
      ctx.fillStyle = shade(PALETTE.wood, lit * 0.9);
      ctx.fillRect(b.sx - hw, top, hw * 2, bottom - top);
      break;
    case 'table':
    case 'roundTable':
    case 'altar': {
      ctx.fillStyle = shade(PALETTE.cloth, lit * 0.92);
      ctx.fillRect(b.sx - hw, top, hw * 2, bottom - top);
      ctx.fillStyle = shade(PALETTE.cloth, lit * 1.12);
      ctx.beginPath();
      ctx.ellipse(b.sx, top, hw, Math.max(1, hw * 0.16), 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'lamp': {
      const g = ctx.createRadialGradient(b.sx, top, 0, b.sx, top, Math.max(6, hw * 9));
      g.addColorStop(0, withAlpha(PALETTE.glass, 0.85));
      g.addColorStop(0.35, withAlpha(PALETTE.glass, 0.25));
      g.addColorStop(1, withAlpha(PALETTE.glass, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.sx, top, Math.max(6, hw * 9), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(PALETTE.wood, 0.5);
      ctx.fillRect(b.sx - hw * 0.15, top, hw * 0.3, bottom - top);
      break;
    }
    case 'arch': {
      ctx.strokeStyle = shade(PALETTE.wood, lit * 0.8);
      ctx.lineWidth = Math.max(1.5, hw * 0.14);
      ctx.beginPath();
      ctx.moveTo(b.sx - hw, bottom);
      ctx.lineTo(b.sx - hw, top + (bottom - top) * 0.3);
      ctx.quadraticCurveTo(b.sx, top - (bottom - top) * 0.12, b.sx + hw, top + (bottom - top) * 0.3);
      ctx.lineTo(b.sx + hw, bottom);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/**
 * Through the lens. This is the only renderer used for the live viewfinder
 * and for every thumbnail on the contact sheet, so a frame is judged and
 * shown the same way it was taken.
 */
export function renderFrame(ctx: CanvasRenderingContext2D, o: FrameRenderOpts) {
  const { frame, scene, cam } = o;
  const proj = new Projector(cam, frame);

  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();

  // sky/ceiling and floor bands
  ctx.fillStyle = shade(scene.wall, scene.ambient * 0.55);
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  const floorGrad = ctx.createLinearGradient(0, proj.horizonY, 0, frame.y + frame.h);
  floorGrad.addColorStop(0, shade(scene.floor, scene.ambient * 0.55));
  floorGrad.addColorStop(1, shade(scene.floor, scene.ambient * 0.95));
  ctx.fillStyle = floorGrad;
  ctx.fillRect(frame.x, proj.horizonY, frame.w, frame.y + frame.h - proj.horizonY);

  // walls, far ones first
  const walls = [...scene.walls].sort((a, b) => {
    const da = Math.hypot((a.a.x + a.b.x) / 2 - cam.x, (a.a.y + a.b.y) / 2 - cam.y);
    const db = Math.hypot((b.a.x + b.b.x) / 2 - cam.x, (b.a.y + b.b.y) / 2 - cam.y);
    return db - da;
  });
  for (const w of walls) {
    const mx = (w.a.x + w.b.x) / 2;
    const my = (w.a.y + w.b.y) / 2;
    const lit = clamp(scene.ambient * (0.45 + 0.6 * litness(scene, mx, my)), 0.12, 1.2);
    ctx.fillStyle = shade(scene.wall, lit);
    if (wallQuad(ctx, proj, w.a, w.b, 0, w.height)) ctx.fill();
    ctx.fillStyle = shade(scene.floor, lit * 0.8);
    if (wallQuad(ctx, proj, w.a, w.b, 0, 0.12)) ctx.fill();
  }
  for (const win of scene.windows) {
    if (wallQuad(ctx, proj, win.a, win.b, win.h0, win.h1)) {
      ctx.fillStyle = shade(PALETTE.glass, 1.0);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha(PALETTE.glass, 0.35);
      ctx.fill();
      ctx.restore();
    }
  }

  drawFloorLight(ctx, proj, scene);

  // everything with depth
  const draws: Drawable[] = [];
  for (const f of scene.furniture) {
    const c = proj.toCam(f);
    if (c.fx < TUNING.camera.nearPlane) continue;
    draws.push({ fwd: c.fx + (f.shape === 'chair' ? 0.25 : 0), draw: () => drawFurnitureBillboard(ctx, f, proj, scene) });
  }
  for (const g of o.guests) {
    const b = proj.billboard(g, g.height, g.width);
    if (!b || !proj.onScreen(b)) continue;
    const bright = brightnessAt(scene, g.x, g.y);
    const rim = rimAt(scene, g.x, g.y, cam.heading);
    const tones = bodyTones(g.palette, bright, PALETTE.glass, 0.14 * litness(scene, g.x, g.y));
    const facingness = facingnessOf(g, cam);
    draws.push({
      fwd: b.fwd,
      draw: () =>
        drawGuestBillboard(ctx, g, {
          sx: b.sx,
          feetY: b.feetY,
          headY: b.headY,
          halfW: b.halfW,
          tones,
          facingness,
          time: o.time,
          rim,
          detail: o.detail,
        }),
    });
  }
  for (const p of o.particles) {
    const c = proj.toCam(p);
    if (c.fx < TUNING.camera.nearPlane) continue;
    const sx = proj.screenX(c);
    const sy = proj.screenY(c, p.z);
    const s = Math.max(0.8, (proj.focal * p.r) / c.fx);
    draws.push({
      fwd: c.fx,
      draw: () => {
        ctx.fillStyle = p.tone;
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s * 1.4);
      },
    });
  }
  draws.sort((a, b) => b.fwd - a.fwd);
  for (const d of draws) d.draw();

  // the light itself, when you are pointed into it
  const ld = scene.lightDir;
  if (ld) {
    const far = { x: cam.x - ld.x * 24, y: cam.y - ld.y * 24 };
    const c = proj.toCam(far);
    if (c.fx > 0.5) {
      const sx = proj.screenX(c);
      const g = ctx.createRadialGradient(sx, proj.horizonY, 0, sx, proj.horizonY, frame.w * 0.85);
      g.addColorStop(0, withAlpha(PALETTE.glass, 0.3));
      g.addColorStop(1, withAlpha(PALETTE.glass, 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
      ctx.restore();
    }
  }

  // exposure and vignette
  const dark = (1 - clamp(o.exposure)) * 0.5;
  if (dark > 0.001) {
    ctx.fillStyle = withAlpha('#000000', dark);
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  }
  const vig = ctx.createRadialGradient(
    frame.x + frame.w / 2,
    frame.y + frame.h / 2,
    frame.w * 0.32,
    frame.x + frame.w / 2,
    frame.y + frame.h / 2,
    frame.w * 0.95,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.36)');
  ctx.fillStyle = vig;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);

  ctx.restore();
}

export interface ViewfinderChrome {
  frame: Rect;
  framesLeft: number;
  framesTotal: number;
  raised: boolean;
  flash: number;
}

/** Frame lines, focus box, frames remaining. Nothing else. */
export function drawViewfinderChrome(ctx: CanvasRenderingContext2D, c: ViewfinderChrome) {
  const { frame } = c;
  ctx.save();
  ctx.strokeStyle = withAlpha(PALETTE.ink, c.raised ? 0.75 : 0.3);
  ctx.lineWidth = 1;
  ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, frame.w - 1, frame.h - 1);

  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h * TUNING.camera.horizonFrac + frame.h * 0.06;
  const s = frame.w * 0.16;
  ctx.strokeStyle = withAlpha(PALETTE.ink, c.raised ? 0.55 : 0.2);
  ctx.lineWidth = 1;
  const corner = s * 0.35;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = cx + dx * s;
    const y = cy + dy * s;
    ctx.beginPath();
    ctx.moveTo(x, y - dy * corner);
    ctx.lineTo(x, y);
    ctx.lineTo(x - dx * corner, y);
    ctx.stroke();
  }

  ctx.font = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = c.framesLeft <= 4 ? PALETTE.accent : withAlpha(PALETTE.ink, 0.9);
  ctx.fillText(`${c.framesLeft}/${c.framesTotal}`, frame.x + frame.w - 10, frame.y + frame.h - 8);
  ctx.textAlign = 'left';
  ctx.fillStyle = withAlpha(PALETTE.ink, 0.55);
  ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(c.raised ? 'FRAMES' : 'CAMERA DOWN', frame.x + 10, frame.y + frame.h - 8);

  if (c.flash > 0) {
    ctx.fillStyle = withAlpha('#000000', clamp(c.flash / 0.09) * 0.85);
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  }
  ctx.restore();
}
