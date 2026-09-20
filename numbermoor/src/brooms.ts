// Broom Formations: N brooms fly in rows and columns. Every rectangle that uses all N brooms is a factor pair.
// A number that only flies single file is prime. Brooms left over are a remainder.
import { Fx, rand } from './fx';
import type { Tier } from './potions';

export function factorPairs(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 1; r <= n; r++) if (n % r === 0) out.push([r, n / r]);
  return out;
}
export function isPrime(n: number): boolean { return n > 1 && factorPairs(n).length === 2; }

export interface BroomRound { n: number; words: string; prime: boolean }

export function makeBroomRound(tier: Tier, rand: () => number): BroomRound {
  const pools: Record<Tier, number[]> = {
    1: [4, 6, 8, 9, 10, 12, 5, 7],
    2: [12, 14, 15, 16, 18, 20, 21, 24, 11, 13],
    3: [16, 18, 20, 24, 25, 27, 28, 30, 32, 36, 17, 19, 23, 29, 31],
  };
  const pool = pools[tier];
  const n = pool[Math.floor(rand() * pool.length)];
  const prime = isPrime(n);
  return { n, prime, words: `${n} brooms. Find every formation that uses all ${n}. Set the rows and the brooms per row, then fly.` };
}

export type FlyResult = { ok: true; rows: number; cols: number; already: boolean } | { ok: false; rows: number; cols: number; product: number; short: number; leftover: number };

export class BroomGame {
  rows = 1;
  cols = 1;
  found = new Set<string>();
  mistakes = 0;
  constructor(public round: BroomRound) { this.cols = round.n; }
  get n(): number { return this.round.n; }
  get pairs(): [number, number][] { return factorPairs(this.n); }
  complete(): boolean { return this.found.size >= this.pairs.length; }
  setRows(r: number): void { this.rows = Math.max(1, Math.min(this.n, r)); }
  setCols(c: number): void { this.cols = Math.max(1, Math.min(this.n, c)); }
  swap(): void { [this.rows, this.cols] = [this.cols, this.rows]; }
  fly(): FlyResult {
    const product = this.rows * this.cols;
    if (product === this.n) {
      const key = `${this.rows}x${this.cols}`;
      const already = this.found.has(key);
      this.found.add(key);
      return { ok: true, rows: this.rows, cols: this.cols, already };
    }
    this.mistakes++;
    return { ok: false, rows: this.rows, cols: this.cols, product, short: Math.max(0, product - this.n), leftover: Math.max(0, this.n - product) };
  }
}

// ---- rendering ----

interface Broom { x: number; y: number; tx: number; ty: number; sx: number; sy: number; t: number; hue: number; bob: number; rider: number }
const TAU = Math.PI * 2;
const RIDERS = ['cat', 'owl', 'toad', 'dragon', 'bunny'] as const;

export class BroomsView {
  private brooms: Broom[] = [];
  private lastN = 0;
  private hangarY = 0;
  private formation = { x: 0, y: 0, w: 0, h: 0 };
  private stars = Array.from({ length: 160 }, (_, i) => ({ x: rand(i + 1), y: rand(i + 77) * 0.7, s: 0.6 + rand(i + 300) * 1.8, tw: rand(i + 500) * 6 }));
  private shooting: { x: number; y: number; t: number }[] = [];
  /** Riders cheer (bounce) for a while after a formation is found. */
  cheerUntil = 0;
  leftoverUntil = 0;
  leftover = 0;
  wand = { x: 0, y: 0 };
  constructor(private fx: Fx) {}

  layout(game: BroomGame, W: number, H: number): void {
    const n = game.n;
    if (this.lastN !== n) {
      this.brooms = Array.from({ length: n }, (_, i) => ({ x: W * 0.5, y: H + 40, tx: 0, ty: 0, sx: W * 0.5, sy: H + 40, t: 1, hue: (i * 47) % 360, bob: rand(i + 9) * 6, rider: i % RIDERS.length }));
      this.lastN = n;
    }
    const top = Math.min(250, H * 0.31); const bottom = H - 235;
    this.hangarY = H - 160;
    const rows = game.rows; const cols = game.cols;
    const availW = W - 80; const availH = bottom - top;
    const cell = Math.max(16, Math.min(72, availW / cols, availH / rows));
    const fw = cell * cols; const fh = cell * rows;
    const fx0 = W / 2 - fw / 2; const fy0 = top + (availH - fh) / 2;
    this.formation = { x: fx0, y: fy0, w: fw, h: fh };
    const inFormation = Math.min(n, rows * cols);
    for (let i = 0; i < n; i++) {
      const b = this.brooms[i];
      let tx: number; let ty: number;
      if (i < inFormation) { const r = Math.floor(i / cols); const c = i % cols; tx = fx0 + c * cell + cell / 2; ty = fy0 + r * cell + cell / 2; }
      else { const k = i - inFormation; const perRow = Math.max(8, Math.floor((W - 60) / 40)); tx = 40 + (k % perRow) * 40 + 12; ty = this.hangarY + Math.floor(k / perRow) * 30; }
      if (Math.abs(tx - b.tx) > 0.5 || Math.abs(ty - b.ty) > 0.5) { b.sx = b.x; b.sy = b.y; b.tx = tx; b.ty = ty; b.t = 0; }
    }
  }

  update(dt: number, time: number): void {
    for (const b of this.brooms) {
      if (b.t < 1) {
        b.t = Math.min(1, b.t + dt * 1.6);
        const e = 1 - Math.pow(1 - b.t, 3);
        // swoop: an arc bulging sideways, so every flight looks like a real swerve
        const dx = b.tx - b.sx; const dy = b.ty - b.sy; const len = Math.hypot(dx, dy) || 1;
        const bulge = Math.min(120, len * 0.35) * Math.sin(b.t * Math.PI) * (b.rider % 2 ? 1 : -1);
        b.x = b.sx + dx * e + (-dy / len) * bulge; b.y = b.sy + dy * e + (dx / len) * bulge;
        if (Math.random() < 0.7) this.fx.trail(b.x - 8, b.y + 4, `hsl(${(b.hue + b.t * 200) % 360} 95% 65%)`);
      } else { b.x = b.tx; b.y = b.ty; }
    }
    if (Math.random() < dt * 0.25) this.shooting.push({ x: Math.random() * 0.8, y: Math.random() * 0.3, t: 0 });
    for (let i = this.shooting.length - 1; i >= 0; i--) { this.shooting[i].t += dt; if (this.shooting[i].t > 1.2) this.shooting.splice(i, 1); }
    void time;
  }

  broomPositions(): { x: number; y: number }[] { return this.brooms.map((b) => ({ x: b.tx, y: b.ty })); }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, game: BroomGame, time: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120c4a'); g.addColorStop(0.5, '#3a1f8a'); g.addColorStop(0.85, '#7a3fb0'); g.addColorStop(1, '#ff8ac0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (const s of this.stars) { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.8 + s.tw)); ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.s, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const sh of this.shooting) {
      const k = sh.t / 1.2; const x = sh.x * W + k * 260; const y = sh.y * H + k * 120;
      ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 60, y - 28); ctx.stroke();
    }
    this.moon(ctx, W * 0.85, H * 0.17, time);
    this.castle(ctx, W, H, time);
    // formation ghost
    const f = this.formation; const cell = f.w / game.cols;
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.roundRect(f.x - 10, f.y - 10, f.w + 20, f.h + 20, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) { ctx.beginPath(); ctx.arc(f.x + c * cell + cell / 2, f.y + r * cell + cell / 2, 2.5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
    ctx.fillText(`${game.cols} in a row`, f.x + f.w / 2, f.y - 26);
    ctx.save(); ctx.translate(f.x - 26, f.y + f.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`${game.rows} rows`, 0, 0); ctx.restore();
    ctx.shadowBlur = 0;
    // hangar
    ctx.fillStyle = 'rgba(20, 10, 50, 0.55)'; ctx.beginPath(); ctx.roundRect(16, this.hangarY - 30, W - 32, 96, 18); ctx.fill();
    ctx.fillStyle = '#ffd35c'; ctx.beginPath(); ctx.roundRect(28, this.hangarY - 44, 110, 26, 8); ctx.fill();
    ctx.fillStyle = '#3a1a5a'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🏠 HANGAR', 83, this.hangarY - 31);
    if (this.leftoverUntil > time && this.leftover > 0) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(W / 2 - 110, this.hangarY - 76, 220, 36, 14); ctx.fill();
      ctx.fillStyle = '#3a1a5a'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillText(`${this.leftover} left over!`, W / 2, this.hangarY - 58);
    }
    const size = Math.max(11, Math.min(32, cell * 0.44));
    const cheer = this.cheerUntil > time;
    this.brooms.forEach((b, i) => {
      const inF = i < Math.min(game.n, game.rows * game.cols);
      const jump = cheer && inF ? Math.abs(Math.sin(time * 8 + i)) * 12 : 0;
      this.broom(ctx, b.x, b.y + Math.sin(time * 2 + b.bob) * 2 - jump, inF ? size : 13, b.hue, b.rider, time, b.t < 1);
    });
  }

  private moon(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const glow = ctx.createRadialGradient(x, y, 10, x, y, 180); glow.addColorStop(0, 'rgba(255,240,200,0.4)'); glow.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 190, y - 190, 380, 380);
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(x, y, 46, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f1dc9a'; for (const [dx, dy, r] of [[-14, -8, 7], [12, 14, 5], [16, -16, 4]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU); ctx.fill(); }
    // sleepy face
    ctx.strokeStyle = '#7a5a20'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const blink = Math.sin(t * 0.7) > 0.9;
    for (const sx of [-14, 14]) { ctx.beginPath(); if (blink) { ctx.moveTo(x + sx - 5, y - 4); ctx.lineTo(x + sx + 5, y - 4); } else ctx.arc(x + sx, y - 2, 5, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y + 8, 9, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,170,0.5)'; for (const sx of [-24, 24]) { ctx.beginPath(); ctx.ellipse(x + sx, y + 6, 7, 4, 0, 0, TAU); ctx.fill(); }
  }

  private castle(ctx: CanvasRenderingContext2D, W: number, H: number, time: number): void {
    const base = H - 130;
    ctx.fillStyle = '#1a0f4a';
    ctx.beginPath(); ctx.moveTo(0, H);
    const towers = [[0.05, 120, 44], [0.17, 70, 30], [0.31, 100, 36], [0.5, 170, 50], [0.69, 90, 34], [0.86, 130, 40], [0.97, 80, 30]];
    let px = 0;
    for (const [fx, th, tw] of towers) {
      const x = fx * W; ctx.lineTo(px, base); ctx.lineTo(x - tw / 2, base); ctx.lineTo(x - tw / 2, base - th);
      for (let i = 0; i < 4; i++) { const cx = x - tw / 2 + (i * tw) / 4; ctx.lineTo(cx, base - th - (i % 2 ? 0 : 9)); ctx.lineTo(cx + tw / 4, base - th - (i % 2 ? 0 : 9)); }
      ctx.lineTo(x + tw / 2, base - th); ctx.lineTo(x + tw / 2, base); px = x + tw / 2;
    }
    ctx.lineTo(W, base); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // flags and windows
    for (const [fx, th] of towers) {
      const x = fx * W; const top = base - th - 9;
      ctx.strokeStyle = '#c9b8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top - 26); ctx.stroke();
      ctx.fillStyle = ['#ff5c7a', '#ffd35c', '#5fc8ff', '#7bd88f'][Math.floor(fx * 10) % 4];
      const wave = Math.sin(time * 5 + fx * 20) * 3;
      ctx.beginPath(); ctx.moveTo(x, top - 26); ctx.lineTo(x + 18, top - 21 + wave); ctx.lineTo(x, top - 15); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#ffd27a';
    for (let i = 0; i < 30; i++) { const x = rand(i + 40) * W; const y = base - 20 - rand(i + 60) * 80; if (Math.sin(time * 0.6 + i) > -0.6) { ctx.beginPath(); ctx.roundRect(x, y, 5, 8, 2); ctx.fill(); } }
  }

  private broom(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, hue: number, rider: number, t: number, flying: boolean): void {
    ctx.save(); ctx.translate(x, y); ctx.rotate(flying ? -0.5 : -0.25);
    ctx.fillStyle = `hsl(${hue} 85% 62%)`; ctx.shadowColor = `hsl(${hue} 90% 60%)`; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(-s * 1.3, -s * 0.4); ctx.lineTo(-s * 0.55, -s * 0.14); ctx.lineTo(-s * 0.55, s * 0.14); ctx.lineTo(-s * 1.3, s * 0.4); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#c98a4b'; ctx.lineWidth = Math.max(3, s * 0.2); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.55, 0); ctx.lineTo(s * 1.1, 0); ctx.stroke();
    // rider: big round head, small body
    const kind = RIDERS[rider];
    const hx = s * 0.3; const hy = -s * 0.55; const hr = s * 0.42;
    const body = `hsl(${hue} 70% 45%)`;
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(hx, -s * 0.18, s * 0.3, s * 0.22, 0, 0, TAU); ctx.fill();
    const face = kind === 'cat' ? '#ffb347' : kind === 'owl' ? '#c98a4b' : kind === 'toad' ? '#5ccf6f' : kind === 'dragon' ? '#5fc8ff' : '#ffe0f0';
    ctx.fillStyle = face; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill();
    if (kind === 'cat') { ctx.beginPath(); ctx.moveTo(hx - hr * 0.8, hy - hr * 0.4); ctx.lineTo(hx - hr * 0.5, hy - hr * 1.3); ctx.lineTo(hx - hr * 0.1, hy - hr * 0.8); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx + hr * 0.8, hy - hr * 0.4); ctx.lineTo(hx + hr * 0.5, hy - hr * 1.3); ctx.lineTo(hx + hr * 0.1, hy - hr * 0.8); ctx.fill(); }
    if (kind === 'bunny') { ctx.beginPath(); ctx.ellipse(hx - hr * 0.4, hy - hr * 1.2, hr * 0.22, hr * 0.7, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(hx + hr * 0.4, hy - hr * 1.2, hr * 0.22, hr * 0.7, 0, 0, TAU); ctx.fill(); }
    if (kind === 'dragon') { ctx.fillStyle = '#2a7ac0'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(hx - hr * 0.6 + i * hr * 0.5, hy - hr * 0.75); ctx.lineTo(hx - hr * 0.35 + i * hr * 0.5, hy - hr * 1.3); ctx.lineTo(hx - hr * 0.1 + i * hr * 0.5, hy - hr * 0.75); ctx.fill(); } }
    if (kind === 'owl') { ctx.fillStyle = '#ffe9c0'; ctx.beginPath(); ctx.ellipse(hx, hy + hr * 0.2, hr * 0.6, hr * 0.5, 0, 0, TAU); ctx.fill(); }
    // eyes follow the wand
    const dx = this.wand.x - x; const dy = this.wand.y - y; const d = Math.hypot(dx, dy) || 1;
    const er = hr * 0.22; const lx = (dx / d) * er * 0.4; const ly = (dy / d) * er * 0.4;
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx + sx * hr * 0.35, hy - hr * 0.05, er, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1030'; ctx.beginPath(); ctx.arc(hx + sx * hr * 0.35 + lx, hy - hr * 0.05 + ly, er * 0.55, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = '#1a1030'; ctx.lineWidth = Math.max(1, s * 0.05); ctx.beginPath(); ctx.arc(hx, hy + hr * 0.35, hr * 0.25, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    // pointed hat
    ctx.fillStyle = `hsl(${(hue + 40) % 360} 70% 40%)`;
    ctx.beginPath(); ctx.moveTo(hx - hr * 1.05, hy - hr * 0.55); ctx.lineTo(hx + hr * 1.05, hy - hr * 0.55); ctx.lineTo(hx + hr * 0.25, hy - hr * 1.9 + Math.sin(t * 4) * 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(hx + hr * 0.25, hy - hr * 1.9 + Math.sin(t * 4) * 1, hr * 0.14, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
