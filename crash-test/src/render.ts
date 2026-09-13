// Canvas 2D. A sunset canyon with an engineer's chalk overlay. Draws either the child's build (grid coords)
// or a running Sim (node coords). Parts are riveted girders that glow green → amber → red as they strain.
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

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'spark' | 'dust' | 'confetti' | 'star'; rot: number; vr: number }

const C = {
  chalk: 'rgba(200, 225, 255, 0.10)', chalkBox: 'rgba(210, 235, 255, 0.7)', chalkDot: 'rgba(230, 240, 255, 0.55)',
  bolt: '#ffe27a', star: '#ffe27a', danger: '#ff5a3c',
  ghostBad: 'rgba(255, 90, 60, 0.8)',
  max: '#4f9cff', maxDark: '#2d6ed6', maxBelly: '#a9d3ff',
  goat: '#efe9d8', goatDark: '#b9ad90', rock: '#8a8da3', rockDark: '#5d6078', sheep: '#f7f4ee',
  wood: '#c98a4b', woodDark: '#8f5a2a', woodLight: '#e3ad72', stone: '#9aa3b8', stoneDark: '#5e677f',
  steel: '#cfd6e6', steelDark: '#6b7390',
};

function hex(h: string): number[] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a: string, b: string, t: number): string {
  const pa = hex(a); const pb = hex(b); const k = Math.max(0, Math.min(1, t));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
}
function shade(h: string, amt: number): string {
  const p = hex(h).map((v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt)))));
  return `rgb(${p.join(',')})`;
}
function rand(seed: number): number { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  scale = 40;
  ox = 0;
  oy = 0;
  private zoom = { x: 12, y: 7, k: 1 };
  private dpr = 1;
  width = 0;
  height = 0;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private particles: Particle[] = [];
  private shakeAmt = 0;
  private clouds = Array.from({ length: 5 }, (_, i) => ({ x: rand(i + 1) * 30 - 3, y: 0.8 + rand(i + 11) * 2.4, w: 3 + rand(i + 21) * 3, v: 0.06 + rand(i + 31) * 0.08 }));

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
    const usableH = this.height - 150 - 120;
    this.scale = Math.max(8, Math.min(this.width / (WORLD_W + 1), usableH / WORLD_H));
    this.ox = (this.width - WORLD_W * this.scale) / 2;
    this.oy = 150 + (usableH - WORLD_H * this.scale) / 2;
    this.bg = null;
  }

  toScreen(x: number, y: number): { x: number; y: number } { return { x: this.ox + x * this.scale, y: this.oy + y * this.scale }; }
  toWorld(sx: number, sy: number): { x: number; y: number } { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }

  // ---- effects API (called by the game) ----

  sparks(x: number, y: number, n = 30): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; const s = 4 + Math.random() * 12;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, life: 0, max: 0.5 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.06, color: Math.random() < 0.5 ? '#ffe27a' : '#ff8a3c', kind: 'spark', rot: 0, vr: 0 });
    }
  }
  dust(x: number, y: number, n = 14, spread = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; const s = 1 + Math.random() * 3;
      this.particles.push({ x: x + (Math.random() - 0.5) * spread, y, vx: Math.cos(a) * s, vy: -Math.abs(Math.sin(a)) * s - 1, life: 0, max: 0.8 + Math.random() * 0.8, size: 0.1 + Math.random() * 0.14, color: 'rgba(214, 190, 160, 0.45)', kind: 'dust', rot: 0, vr: 0 });
    }
  }
  confetti(n = 90): void {
    const cols = ['#ffb347', '#3ee6c7', '#d76cff', '#8fc4ff', '#ffe27a', '#ff6fb1'];
    for (let i = 0; i < n; i++) {
      this.particles.push({ x: Math.random() * WORLD_W, y: -1 - Math.random() * 4, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, life: 0, max: 3 + Math.random() * 2, size: 0.18 + Math.random() * 0.14, color: cols[i % cols.length], kind: 'confetti', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8 });
    }
  }
  twinkle(x: number, y: number, n = 10): void {
    for (let i = 0; i < n; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 2, y: y + (Math.random() - 0.5) * 2, vx: 0, vy: -0.6, life: 0, max: 0.6 + Math.random() * 0.5, size: 0.12 + Math.random() * 0.15, color: '#fff7c0', kind: 'star', rot: 0, vr: 0 });
  }
  shake(amount: number): void { this.shakeAmt = Math.max(this.shakeAmt, amount); }

  // ---- frame ----

  draw(s: DrawState, dt: number): void {
    const ctx = this.ctx;
    const target = s.focus ?? { x: 12, y: 7, k: 1 };
    const ease = 1 - Math.pow(0.02, dt);
    this.zoom.x += (target.x - this.zoom.x) * ease;
    this.zoom.y += (target.y - this.zoom.y) * ease;
    this.zoom.k += (target.k - this.zoom.k) * ease;
    this.shakeAmt *= Math.pow(0.02, dt);
    if (s.sim && s.sim.world.shakeAmp > 0) this.shakeAmt = Math.max(this.shakeAmt, s.sim.world.shakeAmp * 14);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(s.level, s.time);
    ctx.save();
    if (this.shakeAmt > 0.2) ctx.translate((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt);
    const f = this.toScreen(this.zoom.x, this.zoom.y);
    ctx.translate(f.x, f.y); ctx.scale(this.zoom.k, this.zoom.k); ctx.translate(-f.x, -f.y);

    this.terrainDynamic(s.level, s.time);
    this.chalk(s.level, s.sim !== null);
    this.zones(s.level, s.time);
    if (s.sim) this.drawSim(s.sim, s.time); else this.drawBuild(s.level, s.build);
    this.anchors(s.level, s.sim);
    if (s.ghost) this.drawGhost(s.ghost, s.level);
    if (s.hover && !s.sim && s.tool !== 'eraser' && s.tool !== 'pivot' && !(s.tool in BLOCKS)) this.hoverDot(s.hover);
    this.updateParticles(dt);
    if (s.focus?.circle) this.chalkCircle(s.focus.x, s.focus.y, s.time);
    ctx.restore();
    this.vignette();
  }

  // ---- background: cached sky, sun, mountains, ground; live clouds, stars, water ----

  private drawBackground(level: LevelDef, time: number): void {
    const key = `${this.width}x${this.height}:${JSON.stringify(level.ground)}:${level.water ?? ''}`;
    if (!this.bg || this.bgKey !== key) { this.bg = this.renderStatic(level); this.bgKey = key; }
    const ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0, this.width, this.height);
    // twinkling stars up top
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) {
      const x = rand(i + 100) * this.width; const y = rand(i + 200) * this.height * 0.28;
      const a = 0.3 + 0.7 * Math.abs(Math.sin(time * (0.8 + rand(i) * 1.5) + i));
      ctx.globalAlpha = a * 0.8;
      ctx.beginPath(); ctx.arc(x, y, 0.8 + rand(i + 300) * 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // clouds
    for (const c of this.clouds) {
      const x = ((c.x + time * c.v) % 30) - 3;
      this.cloud(x, c.y, c.w);
    }
  }

  private renderStatic(level: LevelDef): HTMLCanvasElement {
    const off = document.createElement('canvas');
    off.width = Math.round(this.width * this.dpr); off.height = Math.round(this.height * this.dpr);
    const g = off.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.width; const H = this.height;
    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#16184a'); sky.addColorStop(0.35, '#4a2f7d'); sky.addColorStop(0.62, '#c95c7a'); sky.addColorStop(0.8, '#ff9a5c'); sky.addColorStop(1, '#ffd08a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // sun
    const sun = this.toScreen(19.5, 3.2);
    const glow = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, this.scale * 6);
    glow.addColorStop(0, 'rgba(255, 236, 170, 0.9)'); glow.addColorStop(0.25, 'rgba(255, 190, 110, 0.45)'); glow.addColorStop(1, 'rgba(255, 150, 90, 0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(sun.x, sun.y, this.scale * 1.1, 0, Math.PI * 2); g.fill();
    // mountains (two layers)
    const groundY = Math.min(...level.ground.map((s) => Math.min(s[1], s[3])));
    const ridge = (yBase: number, amp: number, color: string, seed: number) => {
      g.fillStyle = color; g.beginPath();
      const p0 = this.toScreen(-8, yBase); g.moveTo(p0.x, p0.y);
      for (let x = -8; x <= WORLD_W + 8; x += 0.5) {
        const y = yBase - amp * (0.5 + 0.5 * Math.sin(x * 0.9 + seed)) - amp * 0.4 * Math.sin(x * 2.3 + seed * 2) - amp * 0.2 * Math.sin(x * 5.1 + seed * 3);
        const p = this.toScreen(x, y); g.lineTo(p.x, p.y);
      }
      g.lineTo(W + 10, H); g.lineTo(-10, H); g.closePath(); g.fill();
    };
    ridge(groundY - 0.2, 3.2, 'rgba(70, 40, 110, 0.75)', 1.3);
    ridge(groundY + 0.2, 1.8, 'rgba(45, 28, 80, 0.9)', 4.1);
    // haze at the horizon
    const haze = g.createLinearGradient(0, this.toScreen(0, groundY - 2).y, 0, this.toScreen(0, groundY + 0.5).y);
    haze.addColorStop(0, 'rgba(255, 170, 120, 0)'); haze.addColorStop(1, 'rgba(255, 170, 120, 0.25)');
    g.fillStyle = haze; g.fillRect(0, 0, W, H);
    // ground fills with strata
    for (const [x1, y1, x2, y2] of level.ground) {
      if (y1 !== y2) continue;
      const a = this.toScreen(Math.min(x1, x2), y1); const b = this.toScreen(Math.max(x1, x2), WORLD_H + 1);
      if (Math.min(x1, x2) <= 0) a.x = 0;
      if (Math.max(x1, x2) >= WORLD_W) b.x = W;
      b.y = H;
      const gr = g.createLinearGradient(0, a.y, 0, this.toScreen(0, WORLD_H + 1).y);
      gr.addColorStop(0, '#5a4a6e'); gr.addColorStop(0.08, '#3b2f52'); gr.addColorStop(1, '#1c1630');
      g.fillStyle = gr; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      const gx1 = Math.min(x1, x2) <= 0 ? -3 : Math.min(x1, x2); const gx2 = Math.max(x1, x2) >= WORLD_W ? WORLD_W + 3 : Math.max(x1, x2);
      // strata lines
      g.strokeStyle = 'rgba(255, 200, 160, 0.08)'; g.lineWidth = 2;
      for (let yy = y1 + 0.9; yy < WORLD_H + 4; yy += 0.9 + rand(yy) * 0.6) {
        g.beginPath();
        for (let xx = gx1; xx <= gx2; xx += 0.5) { const p = this.toScreen(xx, yy + Math.sin(xx * 1.7 + yy) * 0.08); if (xx === Math.min(x1, x2)) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); }
        g.stroke();
      }
      // grass tufts along the top
      for (let xx = gx1 + 0.2; xx < gx2; xx += 0.35 + rand(xx * 7) * 0.4) {
        const p = this.toScreen(xx, y1);
        g.strokeStyle = rand(xx * 3) < 0.5 ? '#6fbf73' : '#4e9f5c'; g.lineWidth = 2; g.lineCap = 'round';
        const h = this.scale * (0.15 + rand(xx * 5) * 0.2); const lean = (rand(xx * 9) - 0.5) * this.scale * 0.2;
        g.beginPath(); g.moveTo(p.x, p.y + 2); g.lineTo(p.x + lean, p.y - h); g.stroke();
      }
      // top edge
      g.strokeStyle = '#8b7a9e'; g.lineWidth = Math.max(2, this.scale * 0.1); g.lineCap = 'round';
      const ex1 = Math.min(x1, x2) <= 0 ? 0 : a.x; const ex2 = Math.max(x1, x2) >= WORLD_W ? W : b.x;
      g.beginPath(); g.moveTo(ex1, a.y); g.lineTo(ex2, a.y); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(ex1, a.y - 2); g.lineTo(ex2, a.y - 2); g.stroke();
    }
    // cliff faces
    for (const [x1, y1, x2, y2] of level.ground) {
      if (x1 !== x2) continue;
      const a = this.toScreen(x1, Math.min(y1, y2)); const b = this.toScreen(x2, Math.max(y1, y2));
      g.strokeStyle = '#6a5a80'; g.lineWidth = Math.max(2, this.scale * 0.12); g.lineCap = 'round';
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      // ledge rocks
      for (let yy = Math.min(y1, y2) + 0.6; yy < Math.max(y1, y2); yy += 1.1) {
        const side = x1 < WORLD_W / 2 ? -1 : 1;
        const p = this.toScreen(x1 + side * 0.15, yy);
        g.fillStyle = 'rgba(120, 100, 140, 0.9)'; g.beginPath(); g.ellipse(p.x, p.y, this.scale * 0.22, this.scale * 0.14, 0, 0, Math.PI * 2); g.fill();
      }
    }
    // water base (waves drawn live)
    if (level.water !== undefined) {
      const left = level.ground[1][0]; const right = level.ground[2][0];
      const a = this.toScreen(left, level.water); const b = this.toScreen(right, 13);
      const wg = g.createLinearGradient(0, a.y, 0, b.y);
      wg.addColorStop(0, 'rgba(90, 170, 255, 0.55)'); wg.addColorStop(1, 'rgba(20, 60, 140, 0.85)');
      g.fillStyle = wg; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      // riverbed pebbles
      for (let xx = left + 0.3; xx < right; xx += 0.5 + rand(xx) * 0.5) {
        const p = this.toScreen(xx, 12.85 - rand(xx * 2) * 0.1);
        g.fillStyle = `rgba(${120 + rand(xx * 3) * 60}, ${110 + rand(xx * 4) * 40}, ${140 + rand(xx * 5) * 40}, 0.9)`;
        g.beginPath(); g.ellipse(p.x, p.y, this.scale * (0.12 + rand(xx * 6) * 0.14), this.scale * 0.09, 0, 0, Math.PI * 2); g.fill();
      }
    }
    return off;
  }

  private cloud(x: number, y: number, w: number): void {
    const ctx = this.ctx;
    const p = this.toScreen(x, y);
    const s = this.scale;
    ctx.fillStyle = 'rgba(255, 225, 210, 0.16)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, s * w * 0.6, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(p.x + s * w * 0.15, p.y - s * 0.18, s * w * 0.32, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(p.x - s * w * 0.2, p.y - s * 0.1, s * w * 0.25, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  }

  private terrainDynamic(level: LevelDef, time: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    if (level.water === undefined) return;
    const left = level.ground[1][0]; const right = level.ground[2][0];
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = k === 0 ? 'rgba(200, 235, 255, 0.85)' : 'rgba(150, 205, 255, 0.35)';
      ctx.lineWidth = k === 0 ? 2.5 : 1.5;
      ctx.beginPath();
      const yb = level.water + k * 0.55;
      for (let x = left; x <= right; x += 0.2) {
        const p = this.toScreen(x, yb + Math.sin(x * 2.4 + time * 2.2 + k) * 0.07);
        if (x === left) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // sun glints
    ctx.fillStyle = 'rgba(255, 245, 200, 0.5)';
    for (let i = 0; i < 8; i++) {
      const x = left + 0.5 + rand(i + 50) * (right - left - 1); const y = level.water + 0.3 + rand(i + 60) * 1.4;
      const a = Math.abs(Math.sin(time * 1.7 + i * 1.3));
      const p = this.toScreen(x, y);
      ctx.globalAlpha = a * 0.7; ctx.fillRect(p.x, p.y, s * 0.25, 2);
    }
    ctx.globalAlpha = 1;
  }

  private chalk(level: LevelDef, testing: boolean): void {
    const ctx = this.ctx;
    const s = this.scale;
    ctx.globalAlpha = testing ? 0.35 : 1;
    ctx.lineWidth = 1; ctx.strokeStyle = C.chalk;
    ctx.beginPath();
    for (let x = 0; x <= WORLD_W; x++) { const p = this.toScreen(x, 0); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + WORLD_H * s); }
    for (let y = 0; y <= WORLD_H; y++) { const p = this.toScreen(0, y); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + WORLD_W * s, p.y); }
    ctx.stroke();
    const b = level.build;
    const p1 = this.toScreen(b.x1, b.y1); const p2 = this.toScreen(b.x2, b.y2);
    ctx.setLineDash([s * 0.3, s * 0.2]); ctx.strokeStyle = C.chalkBox; ctx.lineWidth = 2;
    ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    ctx.setLineDash([]);
    if (!testing) {
      ctx.fillStyle = C.chalkDot;
      for (let x = b.x1; x <= b.x2; x++) for (let y = b.y1; y <= b.y2; y++) { const p = this.toScreen(x, y); ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  private zones(level: LevelDef, time: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    if (level.zone) {
      const z = level.zone;
      const a = this.toScreen(z.x1, z.y1); const b = this.toScreen(z.x2, z.y2);
      ctx.fillStyle = 'rgba(120, 220, 140, 0.10)'; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      // fence
      ctx.strokeStyle = '#d9b36c'; ctx.lineWidth = Math.max(2, s * 0.07); ctx.lineCap = 'round';
      for (const xx of [z.x1, z.x2]) { const p = this.toScreen(xx, z.y2); const q = this.toScreen(xx, z.y2 - 1.1); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      for (const yy of [z.y2 - 0.45, z.y2 - 0.9]) { const p = this.toScreen(z.x1, yy); const q = this.toScreen(z.x2, yy); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      const n = Math.max(1, Math.floor((z.x2 - z.x1) / 1.6));
      for (let i = 0; i < n; i++) this.sheep(z.x1 + 0.9 + i * 1.6, z.y2 - 0.45, time + i);
    }
    if (level.starY !== undefined) {
      const y = level.starY;
      const a = this.toScreen(level.build.x1, y); const b = this.toScreen(level.build.x2, y);
      ctx.setLineDash([s * 0.25, s * 0.2]); ctx.strokeStyle = C.star; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      this.star((level.build.x1 + level.build.x2) / 2, y - 0.5, 0.38, time);
    }
    if (level.lever) for (const px of level.lever.pivotXs) this.triangle(px, level.lever.y, 0.3, 'rgba(255, 226, 122, 0.2)', true);
  }

  private sheep(x: number, y: number, t: number): void {
    const ctx = this.ctx; const s = this.scale; const p = this.toScreen(x, y);
    const bob = Math.sin(t * 3) * 0.02 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + s * 0.42, s * 0.42, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(p.x - s * 0.25, p.y + s * 0.2, s * 0.08, s * 0.22); ctx.fillRect(p.x + s * 0.12, p.y + s * 0.2, s * 0.08, s * 0.22);
    ctx.fillStyle = C.sheep;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * s * 0.22, p.y + bob + Math.sin(a) * s * 0.14, s * 0.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(p.x, p.y + bob, s * 0.36, s * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2a3a'; ctx.beginPath(); ctx.ellipse(p.x + s * 0.38, p.y - s * 0.08 + bob, s * 0.16, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x + s * 0.43, p.y - s * 0.11 + bob, s * 0.035, 0, Math.PI * 2); ctx.fill();
  }

  private star(x: number, y: number, r: number, t: number): void {
    const ctx = this.ctx; const p = this.toScreen(x, y);
    const R = r * this.scale * (1 + Math.sin(t * 3) * 0.06);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(t) * 0.15);
    ctx.fillStyle = C.star; ctx.shadowColor = C.star; ctx.shadowBlur = 18;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? R * 0.45 : R; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-R * 0.2, -R * 0.2, R * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private triangle(x: number, y: number, size: number, color: string, faint = false): void {
    const ctx = this.ctx; const p = this.toScreen(x, y); const s = this.scale * size;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - s, p.y + s * 1.6); ctx.lineTo(p.x + s, p.y + s * 1.6); ctx.closePath(); ctx.fill();
    if (!faint) { ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(p.x, p.y + 3); ctx.lineTo(p.x - s * 0.5, p.y + s * 0.9); ctx.lineTo(p.x, p.y + s * 0.9); ctx.closePath(); ctx.fill(); }
  }

  private anchors(level: LevelDef, sim: Sim | null): void {
    const ctx = this.ctx; const s = this.scale;
    const pts = sim ? sim.anchors.map((n) => [n.x, n.y]) : level.anchors;
    for (const [x, y] of pts) {
      const p = this.toScreen(x, y);
      const g = ctx.createRadialGradient(p.x - s * 0.06, p.y - s * 0.06, 0, p.x, p.y, s * 0.24);
      g.addColorStop(0, '#e9edf7'); g.addColorStop(0.6, '#8b93ad'); g.addColorStop(1, '#3d4560');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.bolt; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#2a2f5a'; ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.07, 0, Math.PI * 2); ctx.fill();
    }
  }

  private hoverDot(h: { x: number; y: number }): void {
    const ctx = this.ctx; const p = this.toScreen(h.x, h.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, this.scale * 0.24, 0, Math.PI * 2); ctx.stroke();
  }

  private chalkCircle(x: number, y: number, t: number): void {
    const ctx = this.ctx; const p = this.toScreen(x, y);
    const r = this.scale * (1.1 + Math.sin(t * 5) * 0.06);
    ctx.strokeStyle = C.danger; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.shadowColor = C.danger; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0;
  }

  private vignette(): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(this.width / 2, this.height * 0.5, this.height * 0.35, this.width / 2, this.height * 0.5, this.height * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10, 5, 30, 0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.width, this.height);
  }

  // ---- parts ----

  /** A riveted girder from a to b. Stress 0..1 shifts it toward hot orange and adds a glow. */
  private girder(kind: SegmentKind, ax: number, ay: number, bx: number, by: number, stress: number, alpha = 1): void {
    const ctx = this.ctx; const s = this.scale;
    const def = SEGMENTS[kind];
    const a = this.toScreen(ax, ay); const b = this.toScreen(bx, by);
    const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 1) return;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const base = stress > 0.5 ? mix('#ffb347', C.danger, (stress - 0.5) * 2) : mix(def.color, '#ffb347', stress * 2);
    const th = Math.max(3, def.thickness * s * 1.7);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(a.x, a.y); ctx.rotate(ang);
    // drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); this.rr(ctx, 0, -th / 2 + 4, len, th, th / 2); ctx.fill();
    // glow
    if (stress > 0.4) { ctx.shadowColor = base; ctx.shadowBlur = 10 + stress * 26; }
    const g = ctx.createLinearGradient(0, -th / 2, 0, th / 2);
    g.addColorStop(0, shade(base, 0.45)); g.addColorStop(0.45, base); g.addColorStop(1, shade(base, -0.45));
    ctx.fillStyle = g;
    ctx.beginPath(); this.rr(ctx, 0, -th / 2, len, th, th / 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(20, 15, 40, 0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (kind === 'pillar') {
      // cap plates
      ctx.fillStyle = shade(base, -0.3);
      ctx.fillRect(0, -th * 0.75, th * 0.45, th * 1.5); ctx.fillRect(len - th * 0.45, -th * 0.75, th * 0.45, th * 1.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, th * 0.12);
      ctx.beginPath(); ctx.moveTo(th * 0.5, -th * 0.2); ctx.lineTo(len - th * 0.5, -th * 0.2); ctx.stroke();
    } else if (kind === 'brace') {
      // lattice
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      for (let x = th; x < len - th; x += th * 1.6) { ctx.beginPath(); ctx.moveTo(x, -th / 2); ctx.lineTo(x + th * 0.8, th / 2); ctx.stroke(); }
    } else {
      // highlight line + rivets
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(1, th * 0.14);
      ctx.beginPath(); ctx.moveTo(th * 0.6, -th * 0.22); ctx.lineTo(len - th * 0.6, -th * 0.22); ctx.stroke();
      ctx.fillStyle = 'rgba(30, 20, 50, 0.55)';
      const step = Math.max(s * 0.5, th * 1.2);
      for (let x = th * 0.8; x <= len - th * 0.8; x += step) { ctx.beginPath(); ctx.arc(x, 0, th * 0.16, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  private rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.arcTo(x + w, y, x + w, y + rr, rr); ctx.lineTo(x + w, y + h - rr); ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h); ctx.arcTo(x, y + h, x, y + h - rr, rr); ctx.lineTo(x, y + rr); ctx.arcTo(x, y, x + rr, y, rr);
  }

  private rope(ax: number, ay: number, bx: number, by: number, stress: number, slack: boolean, alpha = 1): void {
    const ctx = this.ctx; const s = this.scale;
    const a = this.toScreen(ax, ay); const b = this.toScreen(bx, by);
    const base = stress > 0.5 ? mix('#ffb347', C.danger, (stress - 0.5) * 2) : mix('#d76cff', '#ffb347', stress * 2);
    const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2 + (slack ? s * 0.45 : 0);
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round';
    if (stress > 0.4) { ctx.shadowColor = base; ctx.shadowBlur = 8 + stress * 20; }
    ctx.strokeStyle = shade(base, -0.4); ctx.lineWidth = Math.max(3, s * 0.12);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = base; ctx.lineWidth = Math.max(1.5, s * 0.06); ctx.setLineDash([s * 0.12, s * 0.08]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
    ctx.restore();
  }

  private segment(kind: SegmentKind, ax: number, ay: number, bx: number, by: number, stress: number, mid?: { x: number; y: number }, slack = false, alpha = 1): void {
    if (kind === 'rope') { this.rope(ax, ay, bx, by, stress, slack, alpha); return; }
    if (mid) { this.girder(kind, ax, ay, mid.x, mid.y, stress, alpha); this.girder(kind, mid.x, mid.y, bx, by, stress, alpha); }
    else this.girder(kind, ax, ay, bx, by, stress, alpha);
  }

  private joint(x: number, y: number): void {
    const ctx = this.ctx; const s = this.scale; const p = this.toScreen(x, y);
    const r = Math.max(3, s * 0.11);
    const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 0, p.x, p.y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, C.steel); g.addColorStop(1, C.steelDark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,15,40,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  }

  private block(kind: BlockKind, corners: { x: number; y: number }[], alpha = 1): void {
    const ctx = this.ctx; const s = this.scale;
    const cx = corners.reduce((t, c) => t + c.x, 0) / 4; const cy = corners.reduce((t, c) => t + c.y, 0) / 4;
    const ang = Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x);
    const w = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) * s;
    const h = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y) * s;
    const p = this.toScreen(cx, cy);
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x, p.y); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-w / 2 + 3, -h / 2 + 5, w, h);
    if (kind === 'block') {
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, C.woodLight); g.addColorStop(1, C.wood);
      ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = C.woodDark; ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.moveTo(w / 2, -h / 2); ctx.lineTo(-w / 2, h / 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(120, 70, 30, 0.35)'; ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + (h * i) / 3); ctx.lineTo(w / 2, -h / 2 + (h * i) / 3); ctx.stroke(); }
      ctx.fillStyle = '#4a2c12';
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.arc(dx * (w / 2 - s * 0.12), dy * (h / 2 - s * 0.12), Math.max(1.5, s * 0.03), 0, Math.PI * 2); ctx.fill(); }
    } else {
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, shade(C.stone, 0.25)); g.addColorStop(1, C.stoneDark);
      ctx.fillStyle = g; ctx.beginPath(); this.rr(ctx, -w / 2, -h / 2, w, h, s * 0.12); ctx.fill();
      ctx.strokeStyle = '#2f3448'; ctx.lineWidth = Math.max(2, s * 0.05); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-w / 2 + s * 0.15, -h / 2 + s * 0.12); ctx.lineTo(w / 2 - s * 0.15, -h / 2 + s * 0.12); ctx.stroke();
      ctx.strokeStyle = 'rgba(30, 30, 50, 0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-w * 0.2, -h / 2 + 3); ctx.lineTo(-w * 0.1, -h * 0.1); ctx.lineTo(-w * 0.18, h * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.25, h / 2 - 3); ctx.lineTo(w * 0.3, h * 0.05); ctx.stroke();
    }
    ctx.restore();
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
      this.boulder(lv.x1 + 0.3, lv.y + 0.85, 0.75, 1);
      if (build.pivotX !== null) this.triangle(build.pivotX, lv.y, 0.36, C.bolt);
    }
  }

  private plank(pts: { x: number; y: number }[]): void {
    const ctx = this.ctx; const s = this.scale;
    const a = this.toScreen(pts[0].x, pts[0].y); const b = this.toScreen(pts[pts.length - 1].x, pts[pts.length - 1].y);
    const len = Math.hypot(b.x - a.x, b.y - a.y); const ang = Math.atan2(b.y - a.y, b.x - a.x); const th = Math.max(4, s * 0.3);
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(2, -th / 2 + 5, len, th);
    const g = ctx.createLinearGradient(0, -th / 2, 0, th / 2); g.addColorStop(0, C.woodLight); g.addColorStop(1, C.wood);
    ctx.fillStyle = g; ctx.beginPath(); this.rr(ctx, 0, -th / 2, len, th, th * 0.3); ctx.fill();
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 70, 30, 0.4)'; ctx.lineWidth = 1;
    for (let x = s * 0.4; x < len; x += s * 0.9) { ctx.beginPath(); ctx.moveTo(x, -th * 0.3); ctx.lineTo(x + s * 0.5, th * 0.2); ctx.stroke(); }
    ctx.restore();
  }

  private boulder(x: number, y: number, r: number, seed: number): void {
    const ctx = this.ctx; const p = this.toScreen(x, y); const R = r * this.scale;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + R * 0.9, R * 0.9, R * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(p.x - R * 0.35, p.y - R * 0.35, R * 0.1, p.x, p.y, R * 1.1);
    g.addColorStop(0, shade(C.rock, 0.35)); g.addColorStop(0.7, C.rock); g.addColorStop(1, C.rockDark);
    ctx.fillStyle = g; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const rr = R * (0.82 + rand(seed * 10 + i) * 0.22); ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(20, 20, 40, 0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(20, 20, 40, 0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x - R * 0.2, p.y - R * 0.5); ctx.lineTo(p.x + R * 0.05, p.y - R * 0.1); ctx.lineTo(p.x - R * 0.1, p.y + R * 0.3); ctx.stroke();
  }

  private drawSim(sim: Sim, time: number): void {
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
      this.boulder(sim.lever.boulder.x, sim.lever.boulder.y, 0.75, 1);
      if (sim.lever.pivot) this.triangle(sim.lever.pivot.x, sim.lever.pivot.y, 0.36, C.bolt);
    }
    for (const r of sim.rocks) this.boulder(r.x, r.y, r.r, r.id);
    for (const g of sim.goats) {
      const v = sim.world.velocity(g.node);
      g.max ? this.maxAt(g.node.x, g.node.y - 0.35, 0, 1.4, time, Math.abs(v.vx) > 0.5) : this.goat(g.node, time, Math.abs(v.vx) > 0.5);
    }
    if (sim.cart) this.cart(sim.cart.nodes, sim.cart.wheels, sim.cart.crates, sim.cart.max, time);
    if (sim.drop) {
      const c = sim.drop.corners;
      const ang = Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x);
      this.maxAt((c[0].x + c[2].x) / 2, (c[0].y + c[2].y) / 2, ang, 1.5, time, false);
    }
  }

  private brokenStub(kind: SegmentKind, l: Link): void {
    const dx = l.b.x - l.a.x; const dy = l.b.y - l.a.y; const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len; const uy = dy / len; const stub = Math.min(0.45, len * 0.32);
    this.segment(kind, l.a.x, l.a.y, l.a.x + ux * stub, l.a.y + uy * stub, 1, undefined, false, 0.9);
    this.segment(kind, l.b.x - ux * stub, l.b.y - uy * stub, l.b.x, l.b.y, 1, undefined, false, 0.9);
  }

  private snapSpark(x: number, y: number, t: number): void {
    const ctx = this.ctx; const p = this.toScreen(x, y);
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2; ctx.shadowColor = '#ff8a3c'; ctx.shadowBlur = 10;
    for (let i = 0; i < 6; i++) { const a = t * 5 + (i * Math.PI * 2) / 6; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4); ctx.lineTo(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14); ctx.stroke(); }
    ctx.shadowBlur = 0;
  }

  private cart(nodes: Node[], wheels: Node[], crates: number, max: boolean, time: number): void {
    const ctx = this.ctx; const s = this.scale;
    const [wl, wr, tl, tr] = nodes;
    const cx = (tl.x + tr.x + wl.x + wr.x) / 4; const cy = (tl.y + tr.y + wl.y + wr.y) / 4 - 0.15;
    const ang = Math.atan2(tr.y - tl.y, tr.x - tl.x);
    const p = this.toScreen(cx, cy);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
    const w = s * 2.0; const h = s * 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-w / 2 + 3, -h / 2 + 6, w, h);
    // wooden tub, wider at the top
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, C.woodLight); g.addColorStop(1, C.woodDark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w * 0.42, h / 2); ctx.lineTo(-w * 0.42, h / 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4a2c12'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 70, 30, 0.45)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const x = -w / 2 + (w * i) / 4; ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x * 0.84, h / 2); ctx.stroke(); }
    // metal bands
    ctx.strokeStyle = C.steelDark; ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.beginPath(); ctx.moveTo(-w / 2, -h * 0.25); ctx.lineTo(w / 2, -h * 0.25); ctx.moveTo(-w * 0.46, h * 0.25); ctx.lineTo(w * 0.46, h * 0.25); ctx.stroke();
    // cargo
    if (max) this.maxLocal(0, -h * 0.85, s * 1.35, time, false);
    else for (let i = 0; i < crates; i++) {
      const cw = s * 0.5; const x = (i - (crates - 1) / 2) * cw * 1.05; const y = -h / 2 - cw / 2 + 2;
      const cg = ctx.createLinearGradient(0, y - cw / 2, 0, y + cw / 2); cg.addColorStop(0, C.woodLight); cg.addColorStop(1, C.wood);
      ctx.fillStyle = cg; ctx.fillRect(x - cw / 2, y - cw / 2, cw, cw);
      ctx.strokeStyle = C.woodDark; ctx.lineWidth = 2; ctx.strokeRect(x - cw / 2, y - cw / 2, cw, cw);
      ctx.beginPath(); ctx.moveTo(x - cw / 2, y - cw / 2); ctx.lineTo(x + cw / 2, y + cw / 2); ctx.moveTo(x + cw / 2, y - cw / 2); ctx.lineTo(x - cw / 2, y + cw / 2); ctx.stroke();
    }
    ctx.restore();
    for (const wh of wheels) {
      const q = this.toScreen(wh.x, wh.y); const R = wh.r * s;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(q.x + 3, q.y + 5, R, 0, Math.PI * 2); ctx.fill();
      const rg = ctx.createRadialGradient(q.x - R * 0.3, q.y - R * 0.3, R * 0.1, q.x, q.y, R);
      rg.addColorStop(0, '#5a6280'); rg.addColorStop(1, '#1c1f3a');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.steel; ctx.lineWidth = Math.max(2, R * 0.18); ctx.stroke();
      const rot = wh.x / wh.r;
      ctx.strokeStyle = '#cfd6ff'; ctx.lineWidth = Math.max(1.5, R * 0.1);
      for (let i = 0; i < 3; i++) { const an = rot + (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(q.x - Math.cos(an) * R * 0.8, q.y - Math.sin(an) * R * 0.8); ctx.lineTo(q.x + Math.cos(an) * R * 0.8, q.y + Math.sin(an) * R * 0.8); ctx.stroke(); }
      ctx.fillStyle = C.bolt; ctx.beginPath(); ctx.arc(q.x, q.y, R * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  }

  private goat(n: Node, t: number, moving: boolean): void {
    const ctx = this.ctx; const s = this.scale; const p = this.toScreen(n.x, n.y);
    const bob = moving ? Math.sin(t * 14) * s * 0.04 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + s * 0.62, s * 0.6, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    // legs
    ctx.strokeStyle = C.goatDark; ctx.lineWidth = Math.max(3, s * 0.09); ctx.lineCap = 'round';
    for (const dx of [-0.32, -0.12, 0.14, 0.34]) {
      const sw = moving ? Math.sin(t * 14 + dx * 9) * s * 0.14 : 0;
      ctx.beginPath(); ctx.moveTo(p.x + dx * s, p.y + s * 0.2 + bob); ctx.lineTo(p.x + dx * s + sw, p.y + s * 0.6); ctx.stroke();
    }
    // body
    const g = ctx.createRadialGradient(p.x - s * 0.15, p.y - s * 0.15 + bob, s * 0.1, p.x, p.y + bob, s * 0.6);
    g.addColorStop(0, '#fffaf0'); g.addColorStop(1, C.goatDark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y + bob, s * 0.58, s * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    // head + beard + horns
    ctx.fillStyle = C.goat; ctx.beginPath(); ctx.ellipse(p.x + s * 0.6, p.y - s * 0.28 + bob, s * 0.27, s * 0.21, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.goatDark; ctx.beginPath(); ctx.moveTo(p.x + s * 0.72, p.y - s * 0.1 + bob); ctx.lineTo(p.x + s * 0.8, p.y + s * 0.12 + bob); ctx.lineTo(p.x + s * 0.62, p.y - s * 0.05 + bob); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.beginPath(); ctx.moveTo(p.x + s * 0.55, p.y - s * 0.45 + bob); ctx.quadraticCurveTo(p.x + s * 0.4, p.y - s * 0.75 + bob, p.x + s * 0.3, p.y - s * 0.72 + bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x + s * 0.68, p.y - s * 0.46 + bob); ctx.quadraticCurveTo(p.x + s * 0.6, p.y - s * 0.8 + bob, p.x + s * 0.48, p.y - s * 0.8 + bob); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(p.x + s * 0.68, p.y - s * 0.32 + bob, s * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x + s * 0.69, p.y - s * 0.34 + bob, s * 0.015, 0, Math.PI * 2); ctx.fill();
  }

  /** Max the blue T-Rex about world (x, y). */
  private maxAt(x: number, y: number, ang: number, size: number, t: number, moving: boolean): void {
    const p = this.toScreen(x, y);
    const ctx = this.ctx;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
    this.maxLocal(0, 0, this.scale * size, t, moving);
    ctx.restore();
  }

  private maxLocal(ox: number, oy: number, s: number, t: number, moving: boolean): void {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(ox, oy);
    const step = moving ? Math.sin(t * 12) : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, s * 0.52, s * 0.55, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    // tail
    ctx.fillStyle = C.max; ctx.beginPath(); ctx.moveTo(-s * 0.25, s * 0.02); ctx.quadraticCurveTo(-s * 0.6, -s * 0.05, -s * 0.85, -s * 0.18); ctx.quadraticCurveTo(-s * 0.55, s * 0.12, -s * 0.25, s * 0.28); ctx.closePath(); ctx.fill();
    // legs
    ctx.fillStyle = C.maxDark;
    ctx.save(); ctx.translate(-s * 0.13, s * 0.2); ctx.rotate(step * 0.4); ctx.fillRect(-s * 0.08, 0, s * 0.16, s * 0.32); ctx.fillRect(-s * 0.1, s * 0.28, s * 0.24, s * 0.08); ctx.restore();
    ctx.save(); ctx.translate(s * 0.13, s * 0.2); ctx.rotate(-step * 0.4); ctx.fillRect(-s * 0.08, 0, s * 0.16, s * 0.32); ctx.fillRect(-s * 0.1, s * 0.28, s * 0.24, s * 0.08); ctx.restore();
    // body
    const g = ctx.createRadialGradient(-s * 0.1, -s * 0.1, s * 0.05, 0, 0, s * 0.45);
    g.addColorStop(0, shade(C.max, 0.25)); g.addColorStop(1, C.maxDark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.38, s * 0.31, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.maxBelly; ctx.beginPath(); ctx.ellipse(s * 0.06, s * 0.14, s * 0.22, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    // back spikes
    ctx.fillStyle = shade(C.max, -0.15);
    for (let i = 0; i < 4; i++) { const x = -s * 0.3 + i * s * 0.16; ctx.beginPath(); ctx.moveTo(x, -s * 0.2); ctx.lineTo(x + s * 0.07, -s * 0.36); ctx.lineTo(x + s * 0.14, -s * 0.2); ctx.fill(); }
    // head
    const hg = ctx.createRadialGradient(s * 0.34, -s * 0.36, s * 0.05, s * 0.4, -s * 0.3, s * 0.32);
    hg.addColorStop(0, shade(C.max, 0.3)); hg.addColorStop(1, C.max);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(s * 0.4, -s * 0.3, s * 0.3, s * 0.23, 0.1, 0, Math.PI * 2); ctx.fill();
    // jaw + teeth
    ctx.fillStyle = C.maxDark; ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.2); ctx.lineTo(s * 0.7, -s * 0.22); ctx.lineTo(s * 0.42, -s * 0.06); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(s * (0.4 + i * 0.09), -s * 0.2); ctx.lineTo(s * (0.44 + i * 0.09), -s * 0.12); ctx.lineTo(s * (0.48 + i * 0.09), -s * 0.2); ctx.fill(); }
    // eye (blinks)
    const blink = (Math.sin(t * 1.3) > 0.97) ? 0.15 : 1;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(s * 0.44, -s * 0.4, s * 0.07, s * 0.07 * blink, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(s * 0.46, -s * 0.4, s * 0.035, s * 0.035 * blink, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 0.47, -s * 0.42, s * 0.012, 0, Math.PI * 2); ctx.fill();
    // arms
    ctx.strokeStyle = C.maxDark; ctx.lineWidth = Math.max(2, s * 0.05); ctx.lineCap = 'round';
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
        ctx.strokeStyle = C.ghostBad; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - 8, p.y - 8); ctx.lineTo(p.x + 8, p.y + 8); ctx.moveTo(p.x + 8, p.y - 8); ctx.lineTo(p.x - 8, p.y + 8); ctx.stroke();
      }
    } else if (g.type === 'block') {
      const d = BLOCKS[g.kind];
      this.block(g.kind, [{ x: g.x, y: g.y - d.h }, { x: g.x + d.w, y: g.y - d.h }, { x: g.x + d.w, y: g.y }, { x: g.x, y: g.y }], g.ok ? 0.5 : 0.25);
    } else if (g.type === 'pivot' && level.lever) {
      this.triangle(g.x, level.lever.y, 0.36, g.ok ? 'rgba(255,226,122,0.6)' : C.ghostBad, true);
    }
  }

  // ---- particles ----

  private updateParticles(dt: number): void {
    const ctx = this.ctx; const s = this.scale;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      const k = 1 - p.life / p.max;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.kind === 'spark') { p.vy += 30 * dt; p.vx *= 0.98; }
      else if (p.kind === 'dust') { p.vy += 2 * dt; p.vx *= 0.97; }
      else if (p.kind === 'confetti') { p.vx += Math.sin(p.life * 6 + p.rot) * 2 * dt; }
      const q = this.toScreen(p.x, p.y);
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.5);
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.5, p.size * s); ctx.lineCap = 'round';
        ctx.shadowColor = p.color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - p.vx * 0.03 * s, q.y - p.vy * 0.03 * s); ctx.stroke();
      } else if (p.kind === 'dust') {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(q.x, q.y, p.size * s * (1 + p.life * 0.8), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'confetti') {
        ctx.translate(q.x, q.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.size * s / 2, -p.size * s / 4, p.size * s, p.size * s / 2);
      } else {
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        const r = p.size * s;
        ctx.beginPath(); ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x + r * 0.3, q.y - r * 0.3); ctx.lineTo(q.x + r, q.y); ctx.lineTo(q.x + r * 0.3, q.y + r * 0.3); ctx.lineTo(q.x, q.y + r); ctx.lineTo(q.x - r * 0.3, q.y + r * 0.3); ctx.lineTo(q.x - r, q.y); ctx.lineTo(q.x - r * 0.3, q.y - r * 0.3); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }
}
