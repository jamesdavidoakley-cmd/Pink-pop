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

interface Broom { x: number; y: number; tx: number; ty: number; hue: number; bob: number }

export class BroomsView {
  private brooms: Broom[] = [];
  private lastN = 0;
  private hangarY = 0;
  private formation: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };
  private stars = Array.from({ length: 140 }, (_, i) => ({ x: rand(i + 1), y: rand(i + 77) * 0.7, s: 0.6 + rand(i + 300) * 1.6, tw: rand(i + 500) * 6 }));
  constructor(private fx: Fx) {}

  /** Positions every broom: the first rows×cols (up to n) in formation, the rest parked in the hangar. */
  layout(game: BroomGame, W: number, H: number): void {
    const n = game.n;
    if (this.lastN !== n) {
      this.brooms = Array.from({ length: n }, (_, i) => ({ x: W * 0.5, y: H + 40, tx: 0, ty: 0, hue: 30 + (i * 47) % 300, bob: rand(i + 9) * 6 }));
      this.lastN = n;
    }
    const top = Math.min(240, H * 0.3); const bottom = H - 225;
    this.hangarY = H - 150;
    const rows = game.rows; const cols = game.cols;
    const availW = W - 60; const availH = bottom - top;
    const cell = Math.max(14, Math.min(64, availW / cols, availH / rows));
    const fw = cell * cols; const fh = cell * rows;
    const fx0 = W / 2 - fw / 2; const fy0 = top + (availH - fh) / 2;
    this.formation = { x: fx0, y: fy0, w: fw, h: fh };
    const inFormation = Math.min(n, rows * cols);
    for (let i = 0; i < n; i++) {
      const b = this.brooms[i];
      if (i < inFormation) {
        const r = Math.floor(i / cols); const c = i % cols;
        b.tx = fx0 + c * cell + cell / 2; b.ty = fy0 + r * cell + cell / 2;
      } else {
        const k = i - inFormation; const perRow = Math.max(8, Math.floor((W - 40) / 34));
        b.tx = 30 + (k % perRow) * 34 + 10; b.ty = this.hangarY + Math.floor(k / perRow) * 26;
      }
    }
  }

  update(dt: number): void {
    const k = 1 - Math.pow(0.004, dt);
    for (const b of this.brooms) {
      const dx = b.tx - b.x; const dy = b.ty - b.y;
      if (Math.hypot(dx, dy) > 30 && Math.random() < 0.5) this.fx.trail(b.x, b.y, `hsl(${b.hue} 90% 70%)`);
      b.x += dx * k; b.y += dy * k;
    }
  }

  cellSize(game: BroomGame): number { return game.cols ? this.formation.w / game.cols : 40; }
  broomPositions(): { x: number; y: number }[] { return this.brooms.map((b) => ({ x: b.tx, y: b.ty })); }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, game: BroomGame, time: number): void {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#060a2a'); g.addColorStop(0.55, '#141a52'); g.addColorStop(1, '#2a1d5a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (const s of this.stars) { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.8 + s.tw)); ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.s, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    // moon
    const mx = W * 0.84; const my = H * 0.16;
    const glow = ctx.createRadialGradient(mx, my, 10, mx, my, 160); glow.addColorStop(0, 'rgba(255,240,200,0.35)'); glow.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = glow; ctx.fillRect(mx - 170, my - 170, 340, 340);
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(mx, my, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#060a2a'; ctx.beginPath(); ctx.arc(mx + 14, my - 8, 30, 0, Math.PI * 2); ctx.fill();
    // castle silhouette
    ctx.fillStyle = '#0a0d2e';
    ctx.beginPath(); ctx.moveTo(0, H);
    const base = H - 120;
    const towers = [[0.05, 110, 40], [0.16, 60, 26], [0.3, 90, 32], [0.5, 150, 44], [0.68, 80, 30], [0.86, 120, 36], [0.97, 70, 28]];
    let px = 0;
    for (const [fx, th, tw] of towers) {
      const x = fx * W; ctx.lineTo(px, base); ctx.lineTo(x - tw / 2, base); ctx.lineTo(x - tw / 2, base - th);
      for (let i = 0; i < 4; i++) { const cx = x - tw / 2 + (i * tw) / 4; ctx.lineTo(cx, base - th - (i % 2 ? 0 : 8)); ctx.lineTo(cx + tw / 4, base - th - (i % 2 ? 0 : 8)); }
      ctx.lineTo(x + tw / 2, base - th); ctx.lineTo(x + tw / 2, base); px = x + tw / 2;
    }
    ctx.lineTo(W, base); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // lit windows
    ctx.fillStyle = '#ffd27a';
    for (let i = 0; i < 24; i++) { const x = rand(i + 40) * W; const y = base - 20 - rand(i + 60) * 70; if (Math.sin(time * 0.6 + i) > -0.6) ctx.fillRect(x, y, 4, 7); }
    // formation grid ghost
    const f = this.formation; const cell = f.w / game.cols;
    ctx.strokeStyle = 'rgba(180, 200, 255, 0.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
    ctx.strokeRect(f.x, f.y, f.w, f.h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(180, 200, 255, 0.25)';
    for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) { ctx.beginPath(); ctx.arc(f.x + c * cell + cell / 2, f.y + r * cell + cell / 2, 2, 0, Math.PI * 2); ctx.fill(); }
    // labels: rows on the left, columns on top
    ctx.fillStyle = '#cfd6ff'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${game.cols} in a row`, f.x + f.w / 2, f.y - 18);
    ctx.save(); ctx.translate(f.x - 22, f.y + f.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`${game.rows} rows`, 0, 0); ctx.restore();
    // hangar shelf
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, this.hangarY - 22, W, 80);
    ctx.fillStyle = '#9aa6e0'; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('hangar', 12, this.hangarY - 10);
    // brooms
    const size = Math.max(10, Math.min(30, cell * 0.42));
    this.brooms.forEach((b, i) => this.broom(ctx, b.x, b.y + Math.sin(time * 2 + b.bob) * 2, i < Math.min(game.n, game.rows * game.cols) ? size : 12, b.hue, time));
  }

  private broom(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, hue: number, t: number): void {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35);
    // bristles
    ctx.fillStyle = `hsl(${hue} 80% 60%)`; ctx.shadowColor = `hsl(${hue} 90% 60%)`; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(-s * 1.2, -s * 0.35); ctx.lineTo(-s * 0.55, -s * 0.12); ctx.lineTo(-s * 0.55, s * 0.12); ctx.lineTo(-s * 1.2, s * 0.35); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // handle
    ctx.strokeStyle = '#a5713a'; ctx.lineWidth = Math.max(2, s * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.55, 0); ctx.lineTo(s * 1.1, 0); ctx.stroke();
    // rider: a little pointed hat
    ctx.fillStyle = `hsl(${hue} 60% 30%)`;
    ctx.beginPath(); ctx.moveTo(s * 0.05, -s * 0.15); ctx.lineTo(s * 0.55, -s * 0.15); ctx.lineTo(s * 0.32, -s * 0.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe0b8'; ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.05, s * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    void t;
  }
}
