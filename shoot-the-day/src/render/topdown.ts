import { TUNING } from '../game/tuning';
import { clamp } from '../game/math';
import { PALETTE, shade, withAlpha } from './palette';
import { bodyTones, drawGuestTop } from './sprites';
import { litness } from './lighting';
import { snapshotGuest, type Sim } from '../game/sim';
import type { Furniture, SceneDef } from '../game/types';
import type { Rect } from './projection';

export interface Transform {
  ox: number;
  oy: number;
  s: number;
}

export function topdownTransform(scene: SceneDef, panel: Rect): Transform {
  const pad = TUNING.view.padding + 6;
  let w = 0;
  let h = 0;
  for (const wall of scene.walls) {
    w = Math.max(w, wall.a.x, wall.b.x);
    h = Math.max(h, wall.a.y, wall.b.y);
  }
  const s = Math.min((panel.w - pad * 2) / w, (panel.h - pad * 2) / h);
  return { ox: panel.x + (panel.w - w * s) / 2, oy: panel.y + (panel.h - h * s) / 2, s };
}

export const toScreen = (t: Transform, x: number, y: number) => ({ x: t.ox + x * t.s, y: t.oy + y * t.s });
export const toWorld = (t: Transform, px: number, py: number) => ({ x: (px - t.ox) / t.s, y: (py - t.oy) / t.s });

function drawFurnitureTop(ctx: CanvasRenderingContext2D, f: Furniture, t: Transform, scene: SceneDef) {
  const p = toScreen(t, f.x, f.y);
  const w = f.w * t.s;
  const d = f.d * t.s;
  const lit = 0.6 + 0.5 * litness(scene, f.x, f.y);
  ctx.save();
  ctx.translate(p.x, p.y);
  if (f.facing !== undefined) ctx.rotate(f.facing);
  switch (f.shape) {
    case 'chair':
      ctx.fillStyle = shade(PALETTE.wood, lit * 0.85);
      ctx.fillRect(-d / 2, -w / 2, d, w);
      break;
    case 'table':
    case 'altar':
      ctx.fillStyle = shade(PALETTE.cloth, lit);
      ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.strokeStyle = shade(PALETTE.wood, lit * 0.8);
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      break;
    case 'roundTable':
      ctx.fillStyle = shade(PALETTE.cloth, lit);
      ctx.beginPath();
      ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'lamp': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, t.s * 3.4);
      g.addColorStop(0, withAlpha(PALETTE.glass, 0.42));
      g.addColorStop(1, withAlpha(PALETTE.glass, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, t.s * 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.glass;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, w / 2), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'arch':
      ctx.strokeStyle = shade(PALETTE.wood, lit);
      ctx.lineWidth = Math.max(2, d);
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawLight(ctx: CanvasRenderingContext2D, scene: SceneDef, t: Transform) {
  if (scene.lightPoint) return;
  const d = scene.lightDir;
  if (!d) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const w of scene.windows) {
    const reach = 9.5;
    const spread = 2.2;
    const pts = [
      { x: w.a.x, y: w.a.y },
      { x: w.b.x, y: w.b.y },
      { x: w.b.x + d.x * reach + -d.y * spread, y: w.b.y + d.y * reach + d.x * spread },
      { x: w.a.x + d.x * reach - -d.y * spread, y: w.a.y + d.y * reach - d.x * spread },
    ];
    const a = toScreen(t, pts[0]!.x, pts[0]!.y);
    const far = toScreen(t, pts[2]!.x, pts[2]!.y);
    const g = ctx.createLinearGradient(a.x, a.y, far.x, far.y);
    g.addColorStop(0, withAlpha(PALETTE.glass, 0.3 * w.strength));
    g.addColorStop(1, withAlpha(PALETTE.glass, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const q = toScreen(t, p.x, p.y);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export interface TopdownOptions {
  panel: Rect;
  time: number;
  /** Text prompt overlaid during the first seconds of the ceremony. */
  prompt: string | null;
}

export function drawTopdown(ctx: CanvasRenderingContext2D, sim: Sim, o: TopdownOptions) {
  const { panel } = o;
  const t = topdownTransform(sim.scene, panel);
  const scene = sim.scene;

  ctx.save();
  ctx.beginPath();
  ctx.rect(panel.x, panel.y, panel.w, panel.h);
  ctx.clip();

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);

  // floor
  let maxX = 0;
  let maxY = 0;
  for (const w of scene.walls) {
    maxX = Math.max(maxX, w.a.x, w.b.x);
    maxY = Math.max(maxY, w.a.y, w.b.y);
  }
  const o0 = toScreen(t, 0, 0);
  ctx.fillStyle = shade(scene.floor, 0.35 + scene.ambient * 0.5);
  ctx.fillRect(o0.x, o0.y, maxX * t.s, maxY * t.s);

  drawLight(ctx, scene, t);

  // forbidden ground
  for (const z of scene.forbidden) {
    ctx.save();
    ctx.beginPath();
    z.poly.forEach((p, i) => {
      const q = toScreen(t, p.x, p.y);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
    const inside = sim.forbiddenNow !== null;
    ctx.fillStyle = withAlpha(PALETTE.accent, inside ? 0.2 : 0.06);
    ctx.fill();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = withAlpha(PALETTE.accent, inside ? 0.85 : 0.3);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  // walls
  ctx.strokeStyle = shade(scene.wall, 0.55);
  ctx.lineWidth = 3;
  for (const w of scene.walls) {
    const a = toScreen(t, w.a.x, w.a.y);
    const b = toScreen(t, w.b.x, w.b.y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.strokeStyle = PALETTE.glass;
  ctx.lineWidth = 4;
  for (const w of scene.windows) {
    const a = toScreen(t, w.a.x, w.a.y);
    const b = toScreen(t, w.b.x, w.b.y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const f of scene.furniture) drawFurnitureTop(ctx, f, t, scene);

  // confetti, seen from above
  for (const p of sim.particles) {
    const q = toScreen(t, p.x, p.y);
    ctx.fillStyle = withAlpha(p.tone, 0.5);
    const r = Math.max(0.8, p.r * t.s * (1 + p.z * 0.12));
    ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
  }

  // the camera cone
  const p = sim.player;
  const ps = toScreen(t, p.x, p.y);
  const reach = 9.5 * t.s;
  const half = TUNING.camera.fovH / 2;
  const cone = ctx.createRadialGradient(ps.x, ps.y, 0, ps.x, ps.y, reach);
  const strength = p.raised ? 0.3 : 0.13;
  cone.addColorStop(0, withAlpha(PALETTE.ink, strength));
  cone.addColorStop(1, withAlpha(PALETTE.ink, 0));
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(ps.x, ps.y);
  ctx.arc(ps.x, ps.y, reach, p.heading - half, p.heading + half);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha(PALETTE.ink, p.raised ? 0.5 : 0.22);
  ctx.lineWidth = 1;
  ctx.stroke();

  // guests
  const telling = new Map<string, number>();
  for (const m of sim.moments) {
    if (m.phase !== 'tell') continue;
    const k = clamp(Math.sin((m.elapsed / TUNING.moment.tell) * Math.PI) * 1.2);
    for (const id of m.subjects) telling.set(id, Math.max(telling.get(id) ?? 0, k));
  }
  for (const g of sim.guests) {
    const q = toScreen(t, g.x, g.y);
    // the plan is a plan: bodies stay readable even in the dim room
    const b = 0.62 + 0.45 * litness(scene, g.x, g.y);
    drawGuestTop(ctx, snapshotGuest(g), {
      px: q.x,
      py: q.y,
      s: t.s,
      tones: bodyTones(g.palette, clamp(b, 0.6, 1.2), PALETTE.glass, 0.12),
      time: o.time,
      awareness: g.awareness,
      posed: g.posed,
      telling: telling.get(g.id) ?? 0,
    });
  }

  // the photographer
  ctx.save();
  ctx.translate(ps.x, ps.y);
  ctx.rotate(p.heading);
  const pr = t.s * (p.crouched ? 0.2 : 0.28);
  ctx.fillStyle = PALETTE.accent;
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(PALETTE.accent, 1.35);
  ctx.beginPath();
  ctx.moveTo(pr * 0.4, -pr * 0.75);
  ctx.lineTo(pr * 1.9, 0);
  ctx.lineTo(pr * 0.4, pr * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (p.crouched) {
    ctx.strokeStyle = withAlpha(PALETTE.accent, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, pr * 2.1, 0, Math.PI * 2);
    ctx.stroke();
  }

  // chrome: scene, clock, and nothing else
  const left = panel.x + TUNING.view.padding;
  ctx.fillStyle = withAlpha(PALETTE.ink, 0.85);
  ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(scene.title.toUpperCase(), left, panel.y + 12);
  const remain = Math.max(0, scene.duration - sim.t);
  ctx.font = '600 26px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = remain < 12 ? PALETTE.accent : withAlpha(PALETTE.ink, 0.9);
  ctx.fillText(`${Math.floor(remain / 60)}:${String(Math.floor(remain % 60)).padStart(2, '0')}`, left, panel.y + 30);

  for (const z of scene.forbidden) {
    const cx = z.poly.reduce((a, q) => a + q.x, 0) / z.poly.length;
    const cy = z.poly.reduce((a, q) => a + q.y, 0) / z.poly.length;
    const q = toScreen(t, cx, cy);
    ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = withAlpha(PALETTE.accent, sim.forbiddenNow ? 0.9 : 0.4);
    ctx.textAlign = 'center';
    ctx.fillText(z.label.toUpperCase(), q.x, q.y);
  }

  if (o.prompt) {
    ctx.textAlign = 'center';
    ctx.font = '500 14px ui-sans-serif, system-ui, sans-serif';
    const y = panel.y + panel.h - 46;
    const w = ctx.measureText(o.prompt).width + 26;
    ctx.fillStyle = withAlpha('#000000', 0.55);
    ctx.fillRect(panel.x + panel.w / 2 - w / 2, y - 8, w, 28);
    ctx.fillStyle = PALETTE.ink;
    ctx.textBaseline = 'top';
    ctx.fillText(o.prompt, panel.x + panel.w / 2, y);
  }

  if (sim.forbiddenNow) {
    ctx.textAlign = 'center';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('THEY CAN ALL SEE YOU', panel.x + panel.w / 2, panel.y + 16);
  }

  ctx.restore();
  return t;
}
