// Canvas 2D. Draws either the child's build (grid coords) or a running Sim (node coords) in one style:
// blueprint paper, chalk lines, glowing parts that shift green → amber → red as they strain.
import { SEGMENTS, BLOCKS, type ToolKind, type SegmentKind, type BlockKind } from './parts';
import { WORLD_W, WORLD_H, type LevelDef } from './levels';
import type { Build } from './build';
import type { Sim } from './sim';
import type { Node, Link } from './physics';

export type Ghost =
  | { type: 'segment'; kind: SegmentKind; ax: number; ay: number; bx: number; by: number; ok: boolean }
  | { type: 'block'; kind: BlockKind; x: number; y: number; ok: boolean }
  | { type: 'pivot'; x: number; ok: boolean };

export interface Focus { x: number; y: number; k: number; circle: boolean }

export interface DrawState {
  level: LevelDef;
  build: Build;
  sim: Sim | null;
  ghost: Ghost | null;
  hover: { x: number; y: number } | null;
  tool: ToolKind;
  focus: Focus | null;
  time: number;
  loadLabel: string | null;
}

const COL = {
  paper0: '#0b1440', paper1: '#101d5e', chalk: 'rgba(190, 205, 255, 0.16)', chalkStrong: 'rgba(200, 215, 255, 0.55)',
  ground: '#1b1f3a', groundTop: '#5561a8', water: 'rgba(60, 140, 255, 0.28)', bolt: '#ffe27a', star: '#ffe27a',
  danger: '#ff5a3c', ok: '#3ee6c7', ghostBad: 'rgba(255, 90, 60, 0.7)', ghostGood: 'rgba(255, 255, 255, 0.85)',
  max: '#4f9cff', maxDark: '#2d6ed6', goat: '#e8e3d4', rock: '#7c7f93', sheep: '#f4f1ea', crate: '#c98a4b',
};

function lerpColor(a: string, b: string, t: number): string {
  const pa = hex(a); const pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function hex(h: string): number[] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  scale = 40;
  ox = 0;
  oy = 0;
  private zoom = { x: 12, y: 7, k: 1 };
  private dpr = 1;
  width = 0;
  height = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth || window.innerWidth;
    this.height = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    // Leave room for the top panel and the bottom palette.
    const usableH = this.height - 150 - 120;
    this.scale = Math.max(8, Math.min(this.width / (WORLD_W + 1), usableH / WORLD_H));
    this.ox = (this.width - WORLD_W * this.scale) / 2;
    this.oy = 150 + (usableH - WORLD_H * this.scale) / 2;
  }

  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  private applyZoom(): void {
    const ctx = this.ctx;
    const f = this.toScreen(this.zoom.x, this.zoom.y);
    ctx.translate(f.x, f.y);
    ctx.scale(this.zoom.k, this.zoom.k);
    ctx.translate(-f.x, -f.y);
  }

  draw(s: DrawState, dt: number): void {
    const ctx = this.ctx;
    const target = s.focus ?? { x: 12, y: 7, k: 1 };
    const ease = 1 - Math.pow(0.02, dt);
    this.zoom.x += (target.x - this.zoom.x) * ease;
    this.zoom.y += (target.y - this.zoom.y) * ease;
    this.zoom.k += (target.k - this.zoom.k) * ease;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background();
    ctx.save();
    this.applyZoom();
    this.grid(s.level);
    this.terrain(s.level, s.time);
    this.zones(s.level, s.time);
    if (s.sim) this.drawSim(s.sim, s.time);
    else this.drawBuild(s.level, s.build);
    this.anchors(s.level, s.sim);
    if (s.ghost) this.drawGhost(s.ghost, s.level);
    if (s.hover && !s.sim && s.tool !== 'eraser' && s.tool !== 'pivot' && !(s.tool in BLOCKS)) this.hoverDot(s.hover);
    if (s.focus?.circle) this.chalkCircle(s.focus.x, s.focus.y, s.time);
    ctx.restore();
  }

  // ---- backdrop ----

  private background(): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, COL.paper1);
    g.addColorStop(1, COL.paper0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
    // faint paper vignette
    const r = ctx.createRadialGradient(this.width / 2, this.height * 0.45, this.height * 0.2, this.width / 2, this.height / 2, this.height * 0.9);
    r.addColorStop(0, 'rgba(255,255,255,0.04)');
    r.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private grid(level: LevelDef): void {
    const ctx = this.ctx;
    const s = this.scale;
    ctx.lineWidth = 1;
    ctx.strokeStyle = COL.chalk;
    ctx.beginPath();
    for (let x = 0; x <= WORLD_W; x++) { const p = this.toScreen(x, 0); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + WORLD_H * s); }
    for (let y = 0; y <= WORLD_H; y++) { const p = this.toScreen(0, y); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + WORLD_W * s, p.y); }
    ctx.stroke();
    // the build box: chalk dashes
    const b = level.build;
    const p1 = this.toScreen(b.x1, b.y1); const p2 = this.toScreen(b.x2, b.y2);
    ctx.setLineDash([s * 0.3, s * 0.2]);
    ctx.strokeStyle = COL.chalkStrong;
    ctx.lineWidth = 2;
    ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    ctx.setLineDash([]);
    // grid dots inside the box
    ctx.fillStyle = 'rgba(220, 230, 255, 0.5)';
    for (let x = b.x1; x <= b.x2; x++) for (let y = b.y1; y <= b.y2; y++) {
      const p = this.toScreen(x, y);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  private terrain(level: LevelDef, time: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    if (level.water !== undefined) {
      const left = level.ground[1][0]; const right = level.ground[2][0];
      const a = this.toScreen(left, level.water); const b = this.toScreen(right, 13);
      ctx.fillStyle = COL.water;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = 'rgba(140, 200, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = left; x <= right; x += 0.25) {
        const p = this.toScreen(x, level.water + Math.sin(x * 2.2 + time * 2.5) * 0.08);
        if (x === left) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // ground fill under horizontal segments, then the chalk edge on every segment
    ctx.fillStyle = COL.ground;
    for (const [x1, y1, x2, y2] of level.ground) {
      if (y1 === y2) {
        const a = this.toScreen(Math.min(x1, x2), y1); const b = this.toScreen(Math.max(x1, x2), WORLD_H);
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      }
    }
    ctx.strokeStyle = COL.groundTop;
    ctx.lineWidth = Math.max(2, s * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of level.ground) { const a = this.toScreen(x1, y1); const b = this.toScreen(x2, y2); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
  }

  private zones(level: LevelDef, time: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    if (level.zone) {
      const z = level.zone;
      const a = this.toScreen(z.x1, z.y1); const b = this.toScreen(z.x2, z.y2);
      ctx.fillStyle = 'rgba(120, 220, 140, 0.08)';
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([s * 0.2, s * 0.15]);
      ctx.strokeStyle = 'rgba(160, 240, 170, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
      const n = Math.max(1, Math.floor((z.x2 - z.x1) / 1.6));
      for (let i = 0; i < n; i++) this.sheep(z.x1 + 0.9 + i * 1.6, z.y2 - 0.45, time + i);
    }
    if (level.starY !== undefined) {
      const y = level.starY;
      const a = this.toScreen(level.build.x1, y); const b = this.toScreen(level.build.x2, y);
      ctx.setLineDash([s * 0.25, s * 0.2]);
      ctx.strokeStyle = COL.star;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      this.star((level.build.x1 + level.build.x2) / 2, y - 0.45, 0.35, time);
    }
    if (level.lever) {
      // pivot choices as faint chalk triangles
      for (const px of level.lever.pivotXs) this.triangle(px, level.lever.y, 0.32, 'rgba(255, 226, 122, 0.22)');
    }
  }

  private sheep(x: number, y: number, t: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    const p = this.toScreen(x, y);
    const bob = Math.sin(t * 3) * 0.02 * s;
    ctx.fillStyle = COL.sheep;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + bob, s * 0.42, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2a3a';
    ctx.beginPath(); ctx.ellipse(p.x + s * 0.38, p.y - s * 0.08 + bob, s * 0.16, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(p.x - s * 0.25, p.y + s * 0.22, s * 0.08, s * 0.2);
    ctx.fillRect(p.x + s * 0.12, p.y + s * 0.22, s * 0.08, s * 0.2);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(p.x + s * 0.42, p.y - s * 0.1 + bob, s * 0.035, 0, Math.PI * 2); ctx.fill();
  }

  private star(x: number, y: number, r: number, t: number): void {
    const ctx = this.ctx;
    const p = this.toScreen(x, y);
    const R = r * this.scale * (1 + Math.sin(t * 3) * 0.06);
    ctx.fillStyle = COL.star;
    ctx.shadowColor = COL.star; ctx.shadowBlur = 16;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? R * 0.45 : R;
      ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
  }

  private triangle(x: number, y: number, size: number, color: string): void {
    const ctx = this.ctx;
    const p = this.toScreen(x, y);
    const s = this.scale * size;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - s, p.y + s * 1.6); ctx.lineTo(p.x + s, p.y + s * 1.6); ctx.closePath(); ctx.fill();
  }

  private anchors(level: LevelDef, sim: Sim | null): void {
    const ctx = this.ctx;
    const s = this.scale;
    const pts = sim ? sim.anchors.map((n) => [n.x, n.y]) : level.anchors;
    for (const [x, y] of pts) {
      const p = this.toScreen(x, y);
      ctx.fillStyle = '#2a2f5a';
      ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = COL.bolt; ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = COL.bolt;
      ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.07, 0, Math.PI * 2); ctx.fill();
    }
  }

  private hoverDot(h: { x: number; y: number }): void {
    const ctx = this.ctx;
    const p = this.toScreen(h.x, h.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, this.scale * 0.22, 0, Math.PI * 2); ctx.stroke();
  }

  private chalkCircle(x: number, y: number, t: number): void {
    const ctx = this.ctx;
    const p = this.toScreen(x, y);
    const r = this.scale * (1.1 + Math.sin(t * 5) * 0.06);
    ctx.strokeStyle = COL.danger;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---- parts ----

  private segment(kind: SegmentKind, ax: number, ay: number, bx: number, by: number, stress: number, mid?: { x: number; y: number }, slack = false, alpha = 1): void {
    const ctx = this.ctx;
    const s = this.scale;
    const def = SEGMENTS[kind];
    const a = this.toScreen(ax, ay); const b = this.toScreen(bx, by);
    const color = stress > 0.5 ? lerpColor('#ffb347', COL.danger, (stress - 0.5) * 2) : lerpColor(def.color, '#ffb347', stress * 2);
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (stress > 0.45) { ctx.shadowColor = color; ctx.shadowBlur = 8 + stress * 18; }
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, def.thickness * s * 1.6);
    if (kind === 'rope') {
      ctx.setLineDash([s * 0.18, s * 0.1]);
      ctx.lineWidth = Math.max(2, s * 0.09);
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (slack) { const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2 + s * 0.35; ctx.quadraticCurveTo(mx, my, b.x, b.y); } else ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (mid) { const m = this.toScreen(mid.x, mid.y); ctx.lineTo(m.x, m.y); }
      ctx.lineTo(b.x, b.y); ctx.stroke();
      // a lighter core line gives the crystal look
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, def.thickness * s * 0.5);
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (mid) { const m = this.toScreen(mid.x, mid.y); ctx.lineTo(m.x, m.y); }
      ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  private joint(x: number, y: number): void {
    const ctx = this.ctx;
    const p = this.toScreen(x, y);
    ctx.fillStyle = '#eef1ff';
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, this.scale * 0.08), 0, Math.PI * 2); ctx.fill();
  }

  private block(kind: BlockKind, corners: { x: number; y: number }[], alpha = 1): void {
    const ctx = this.ctx;
    const def = BLOCKS[kind];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    corners.forEach((c, i) => { const p = this.toScreen(c.x, c.y); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.stroke();
    // inner highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    const inset = 0.12;
    const cx = corners.reduce((s, c) => s + c.x, 0) / 4; const cy = corners.reduce((s, c) => s + c.y, 0) / 4;
    corners.forEach((c, i) => { const p = this.toScreen(cx + (c.x - cx) * (1 - inset), cy + (c.y - cy) * (1 - inset)); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawBuild(level: LevelDef, build: Build): void {
    for (const p of build.parts) {
      const def = SEGMENTS[p.kind];
      const mid = def.bend ? { x: (p.ax + p.bx) / 2, y: (p.ay + p.by) / 2 } : undefined;
      this.segment(p.kind, p.ax, p.ay, p.bx, p.by, 0, mid);
    }
    for (const p of build.parts) { this.joint(p.ax, p.ay); this.joint(p.bx, p.by); }
    for (const b of build.blocks) {
      const d = BLOCKS[b.kind];
      this.block(b.kind, [{ x: b.x, y: b.y - d.h }, { x: b.x + d.w, y: b.y - d.h }, { x: b.x + d.w, y: b.y }, { x: b.x, y: b.y }]);
    }
    if (level.lever) {
      const lv = level.lever;
      this.plank([{ x: lv.x1, y: lv.y }, { x: lv.x2, y: lv.y }]);
      this.boulder(lv.x1 + 0.3, lv.y + 0.85, 0.75);
      if (build.pivotX !== null) this.triangle(build.pivotX, lv.y, 0.36, COL.bolt);
    }
  }

  private plank(pts: { x: number; y: number }[]): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#d9b36c'; ctx.lineWidth = Math.max(3, this.scale * 0.28); ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => { const q = this.toScreen(p.x, p.y); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(1, this.scale * 0.08);
    ctx.stroke();
  }

  private boulder(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    const p = this.toScreen(x, y);
    const R = r * this.scale;
    ctx.fillStyle = COL.rock;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const rr = R * (0.85 + ((i * 37) % 5) * 0.04); ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  }

  private drawSim(sim: Sim, time: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    // parts
    for (const part of sim.parts) {
      const axial = part.links.filter((l) => l.role === 'axial');
      const bend = part.links.find((l) => l.role === 'bend');
      const stress = Math.max(...part.links.map((l) => (l.broken ? 1 : l.stress)));
      if (bend && !bend.broken && axial.every((l) => !l.broken)) {
        this.segment(part.kind, bend.a.x, bend.a.y, bend.b.x, bend.b.y, stress, { x: bend.m!.x, y: bend.m!.y });
      } else {
        for (const l of axial) {
          if (l.broken) this.brokenStub(part.kind, l);
          else this.segment(part.kind, l.a.x, l.a.y, l.b.x, l.b.y, l.stress, undefined, part.kind === 'rope' && l.force < 1);
        }
        if (bend?.broken) this.snapSpark(bend.m!.x, bend.m!.y, time);
      }
    }
    for (const n of sim.structureNodes) this.joint(n.x, n.y);
    for (const b of sim.blocks) this.block(b.kind, b.corners);
    if (sim.lever) {
      this.plank(sim.lever.plank);
      this.boulder(sim.lever.boulder.x, sim.lever.boulder.y, 0.75);
      if (sim.lever.pivot) this.triangle(sim.lever.pivot.x, sim.lever.pivot.y, 0.36, COL.bolt);
    }
    for (const r of sim.rocks) this.boulder(r.x, r.y, r.r);
    for (const g of sim.goats) g.max ? this.maxAt(g.node.x, g.node.y - 0.3, 0, 1.3) : this.goat(g.node, time);
    if (sim.cart) this.cart(sim.cart.nodes, sim.cart.wheels, sim.cart.crates, sim.cart.max);
    if (sim.drop) {
      const c = sim.drop.corners;
      const ang = Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x);
      const cx = (c[0].x + c[2].x) / 2; const cy = (c[0].y + c[2].y) / 2;
      this.maxAt(cx, cy, ang, 1.5);
    }
    void s; void ctx;
  }

  private brokenStub(kind: SegmentKind, l: Link): void {
    const dx = l.b.x - l.a.x; const dy = l.b.y - l.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len; const uy = dy / len;
    const stub = Math.min(0.4, len * 0.3);
    this.segment(kind, l.a.x, l.a.y, l.a.x + ux * stub, l.a.y + uy * stub, 1, undefined, false, 0.9);
    this.segment(kind, l.b.x - ux * stub, l.b.y - uy * stub, l.b.x, l.b.y, 1, undefined, false, 0.9);
  }

  private snapSpark(x: number, y: number, t: number): void {
    const ctx = this.ctx;
    const p = this.toScreen(x, y);
    ctx.strokeStyle = COL.danger; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = t * 4 + (i * Math.PI * 2) / 5;
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4); ctx.lineTo(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12); ctx.stroke();
    }
  }

  private cart(nodes: Node[], wheels: Node[], crates: number, max: boolean): void {
    const ctx = this.ctx;
    const s = this.scale;
    const [wl, wr, tl, tr] = nodes;
    // body: a trapezoid from wheel axle line up to the top corners
    ctx.fillStyle = '#7b5cff';
    ctx.beginPath();
    const a = this.toScreen(wl.x - 0.15, wl.y - 0.15); const b = this.toScreen(wr.x + 0.15, wr.y - 0.15);
    const c = this.toScreen(tr.x, tr.y); const d = this.toScreen(tl.x, tl.y);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    // cargo
    const cx = (tl.x + tr.x) / 2; const cy = (tl.y + tr.y) / 2;
    const ang = Math.atan2(tr.y - tl.y, tr.x - tl.x);
    if (max) this.maxAt(cx, cy - 0.55, ang, 1.4);
    else for (let i = 0; i < crates; i++) {
      const ox = (i - (crates - 1) / 2) * 0.55;
      const px = cx + Math.cos(ang) * ox; const py = cy + Math.sin(ang) * ox - 0.3;
      const p = this.toScreen(px, py);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
      ctx.fillStyle = COL.crate; ctx.fillRect(-s * 0.25, -s * 0.25, s * 0.5, s * 0.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(-s * 0.25, -s * 0.25, s * 0.5, s * 0.5);
      ctx.beginPath(); ctx.moveTo(-s * 0.25, -s * 0.25); ctx.lineTo(s * 0.25, s * 0.25); ctx.moveTo(s * 0.25, -s * 0.25); ctx.lineTo(-s * 0.25, s * 0.25); ctx.stroke();
      ctx.restore();
    }
    for (const w of wheels) {
      const p = this.toScreen(w.x, w.y);
      const R = w.r * s;
      ctx.fillStyle = '#1c1f3a';
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#cfd6ff'; ctx.lineWidth = 3; ctx.stroke();
      const rot = w.x / w.r;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const an = rot + (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(p.x - Math.cos(an) * R * 0.8, p.y - Math.sin(an) * R * 0.8); ctx.lineTo(p.x + Math.cos(an) * R * 0.8, p.y + Math.sin(an) * R * 0.8); ctx.stroke(); }
    }
  }

  private goat(n: Node, t: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    const p = this.toScreen(n.x, n.y);
    const bob = Math.sin(t * 14) * s * 0.04;
    ctx.fillStyle = COL.goat;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + bob, s * 0.55, s * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(p.x + s * 0.55, p.y - s * 0.25 + bob, s * 0.25, s * 0.2, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x + s * 0.55, p.y - s * 0.42 + bob); ctx.lineTo(p.x + s * 0.35, p.y - s * 0.7 + bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x + s * 0.68, p.y - s * 0.42 + bob); ctx.lineTo(p.x + s * 0.55, p.y - s * 0.72 + bob); ctx.stroke();
    ctx.strokeStyle = COL.goat; ctx.lineWidth = 4;
    for (const dx of [-0.3, -0.1, 0.15, 0.35]) { ctx.beginPath(); ctx.moveTo(p.x + dx * s, p.y + s * 0.25 + bob); ctx.lineTo(p.x + dx * s + Math.sin(t * 14 + dx * 9) * s * 0.1, p.y + s * 0.6); ctx.stroke(); }
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(p.x + s * 0.62, p.y - s * 0.3 + bob, s * 0.04, 0, Math.PI * 2); ctx.fill();
  }

  /** Max the blue T-Rex, drawn about (x, y) with rotation, `size` cells tall. */
  private maxAt(x: number, y: number, ang: number, size: number): void {
    const ctx = this.ctx;
    const s = this.scale * size;
    const p = this.toScreen(x, y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = COL.max;
    // tail
    ctx.beginPath(); ctx.moveTo(-s * 0.25, s * 0.05); ctx.lineTo(-s * 0.75, -s * 0.1); ctx.lineTo(-s * 0.25, s * 0.25); ctx.closePath(); ctx.fill();
    // body
    ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.36, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    // legs
    ctx.fillStyle = COL.maxDark;
    ctx.fillRect(-s * 0.2, s * 0.2, s * 0.14, s * 0.3);
    ctx.fillRect(s * 0.06, s * 0.2, s * 0.14, s * 0.3);
    // head
    ctx.fillStyle = COL.max;
    ctx.beginPath(); ctx.ellipse(s * 0.38, -s * 0.3, s * 0.28, s * 0.22, 0.1, 0, Math.PI * 2); ctx.fill();
    // jaw
    ctx.fillStyle = COL.maxDark;
    ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.2); ctx.lineTo(s * 0.66, -s * 0.22); ctx.lineTo(s * 0.4, -s * 0.08); ctx.closePath(); ctx.fill();
    // teeth
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(s * (0.38 + i * 0.08), -s * 0.2); ctx.lineTo(s * (0.42 + i * 0.08), -s * 0.13); ctx.lineTo(s * (0.46 + i * 0.08), -s * 0.2); ctx.fill(); }
    // eye
    ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.38, s * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(s * 0.44, -s * 0.38, s * 0.03, 0, Math.PI * 2); ctx.fill();
    // tiny arms
    ctx.strokeStyle = COL.maxDark; ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.02); ctx.lineTo(s * 0.34, s * 0.04); ctx.stroke();
    ctx.restore();
  }

  private drawGhost(g: Ghost, level: LevelDef): void {
    const ctx = this.ctx;
    if (g.type === 'segment') {
      const def = SEGMENTS[g.kind];
      const mid = def.bend ? { x: (g.ax + g.bx) / 2, y: (g.ay + g.by) / 2 } : undefined;
      this.segment(g.kind, g.ax, g.ay, g.bx, g.by, 0, mid, false, 0.55);
      if (!g.ok) {
        const p = this.toScreen((g.ax + g.bx) / 2, (g.ay + g.by) / 2);
        ctx.strokeStyle = COL.ghostBad; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - 8, p.y - 8); ctx.lineTo(p.x + 8, p.y + 8); ctx.moveTo(p.x + 8, p.y - 8); ctx.lineTo(p.x - 8, p.y + 8); ctx.stroke();
      }
    } else if (g.type === 'block') {
      const d = BLOCKS[g.kind];
      this.block(g.kind, [{ x: g.x, y: g.y - d.h }, { x: g.x + d.w, y: g.y - d.h }, { x: g.x + d.w, y: g.y }, { x: g.x, y: g.y }], g.ok ? 0.5 : 0.25);
    } else if (g.type === 'pivot' && level.lever) {
      this.triangle(g.x, level.lever.y, 0.36, g.ok ? 'rgba(255,226,122,0.6)' : COL.ghostBad);
    }
  }
}
