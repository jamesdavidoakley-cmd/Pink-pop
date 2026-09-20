// Potion Scales: an equation is a balance. The mystery bottle weighs x. Whatever you take from one pan,
// you must take from the other, until the bottle stands alone and the other pan tells you its weight.
import { Fx, shade } from './fx';

export type Tier = 1 | 2 | 3;
export type Side = 'left' | 'right';
export interface Pan { bottles: number; drops: number }
export interface PotionPuzzle { x: number; left: Pan; right: Pan; tier: Tier; words: string }

export function randInt(rand: () => number, lo: number, hi: number): number { return lo + Math.floor(rand() * (hi - lo + 1)); }

export function makePotion(tier: Tier, rand: () => number): PotionPuzzle {
  let x: number; let left: Pan; let right: Pan;
  if (tier === 1) {
    x = randInt(rand, 1, 9); const a = randInt(rand, 1, Math.min(9, 12 - x));
    left = { bottles: 1, drops: a }; right = { bottles: 0, drops: x + a };
  } else if (tier === 2) {
    if (rand() < 0.5) {
      x = randInt(rand, 1, 9); const a = randInt(rand, 0, Math.min(9, 20 - 2 * x));
      left = { bottles: 2, drops: a }; right = { bottles: 0, drops: 2 * x + a };
    } else {
      x = randInt(rand, 4, 14); const a = randInt(rand, 2, Math.min(9, 20 - x));
      left = { bottles: 1, drops: a }; right = { bottles: 0, drops: x + a };
    }
  } else {
    x = randInt(rand, 1, 9); const b = randInt(rand, 0, 6); const a = x + b;
    left = { bottles: 1, drops: a }; right = { bottles: 2, drops: b };
  }
  if (rand() < 0.5) [left, right] = [right, left];
  const words = tier === 3 ? 'Bottles on both pans! Take a bottle off each pan first, then the drops.' : left.bottles + right.bottles === 2 ? 'Twin bottles weigh the same. Clear the drops, then halve both pans.' : 'The scale balances. Take the same off both pans until the bottle is alone.';
  return { x, left, right, tier, words };
}

export function weight(p: Pan, x: number): number { return p.bottles * x + p.drops; }

export class PotionGame {
  left: Pan; right: Pan;
  history: { left: Pan; right: Pan }[] = [];
  mistakes = 0;
  constructor(public puzzle: PotionPuzzle) { this.left = { ...puzzle.left }; this.right = { ...puzzle.right }; }
  pan(side: Side): Pan { return side === 'left' ? this.left : this.right; }
  other(side: Side): Side { return side === 'left' ? 'right' : 'left'; }
  private push(): void { this.history.push({ left: { ...this.left }, right: { ...this.right } }); if (this.history.length > 40) this.history.shift(); }
  undo(): boolean { const h = this.history.pop(); if (!h) return false; this.left = h.left; this.right = h.right; return true; }
  /** Positive tilt = right pan heavier. */
  tilt(): number { return weight(this.right, this.puzzle.x) - weight(this.left, this.puzzle.x); }
  balanced(): boolean { return this.tilt() === 0; }
  removeDrops(side: Side, n: number): boolean {
    const p = this.pan(side); if (p.drops < n) return false;
    this.push(); p.drops -= n; return true;
  }
  /** The very last bottle can never come off — it is the thing we are weighing. Any other bottle can (and the scale will tell you if that was fair). */
  canRemoveBottle(side: Side): boolean { return this.pan(side).bottles > 0 && this.left.bottles + this.right.bottles > 1; }
  removeBottle(side: Side): boolean { if (!this.canRemoveBottle(side)) return false; this.push(); this.pan(side).bottles--; return true; }
  canHalve(): boolean { return this.balanced() && this.left.bottles % 2 === 0 && this.left.drops % 2 === 0 && this.right.bottles % 2 === 0 && this.right.drops % 2 === 0 && (this.left.bottles + this.right.bottles) > 0 && (this.left.bottles + this.right.bottles + this.left.drops + this.right.drops) > 1; }
  halve(): boolean { if (!this.canHalve()) return false; this.push(); this.left.bottles /= 2; this.left.drops /= 2; this.right.bottles /= 2; this.right.drops /= 2; return true; }
  /** Which pan holds the lone bottle once the puzzle is solved, or null. */
  isolated(): Side | null {
    if (!this.balanced()) return null;
    if (this.left.bottles === 1 && this.left.drops === 0 && this.right.bottles === 0) return 'left';
    if (this.right.bottles === 1 && this.right.drops === 0 && this.left.bottles === 0) return 'right';
    return null;
  }
}

// ---- rendering ----

interface Token { kind: 'bottle' | 'drop' | 'stone'; side: Side; x: number; y: number; r: number }

export class PotionsView {
  private tiltShown = 0;
  private tokens: Token[] = [];
  private torchT = 0;
  brewHue = 130;
  brewing = 0; // 0..1 potion fill
  /** Level 1 shows every drop; higher levels bundle fives into stones. */
  useStones = false;
  constructor(private fx: Fx) {}

  update(game: PotionGame, dt: number): void {
    const target = Math.max(-1, Math.min(1, game.tilt() / 6)) * 0.28;
    this.tiltShown += (target - this.tiltShown) * (1 - Math.pow(0.01, dt));
    this.torchT += dt;
  }

  /** Returns the token under the point, if any. */
  hit(x: number, y: number): Token | null {
    let best: Token | null = null; let bd = 1e9;
    for (const t of this.tokens) { const d = Math.hypot(t.x - x, t.y - y); if (d < t.r * 1.3 && d < bd) { bd = d; best = t; } }
    return best;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, game: PotionGame, time: number): void {
    this.tokens = [];
    // dungeon wall
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a1230'); g.addColorStop(0.6, '#2a1d3f'); g.addColorStop(1, '#120c1e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // bricks
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    const bh = 34; const bw = 78;
    for (let y = 0; y < H; y += bh) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      const off = ((y / bh) % 2) * bw / 2;
      for (let x = off; x < W; x += bw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); }
    }
    // torches
    for (const tx of [W * 0.12, W * 0.88]) this.torch(ctx, tx, H * 0.3, time);
    // shelf with bottles
    this.shelf(ctx, W * 0.5, H * 0.16, W * 0.5);
    // table + cauldron
    const tableY = H * 0.86;
    ctx.fillStyle = '#4a2e1c'; ctx.fillRect(0, tableY, W, H - tableY);
    ctx.fillStyle = '#5c3b24'; ctx.fillRect(0, tableY, W, 10);
    this.cauldron(ctx, W * 0.5, tableY - 4, Math.min(120, W * 0.14), time);
    // the balance
    this.scale(ctx, W * 0.5, tableY - 18, Math.min(W * 0.36, 380), game);
  }

  private torch(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const flick = 0.85 + Math.sin(t * 9 + x) * 0.08 + Math.sin(t * 23 + x * 2) * 0.07;
    const glow = ctx.createRadialGradient(x, y - 20, 0, x, y - 20, 220 * flick);
    glow.addColorStop(0, 'rgba(255, 170, 60, 0.35)'); glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 260, y - 280, 520, 520);
    ctx.fillStyle = '#3b2a1e'; ctx.fillRect(x - 6, y, 12, 60);
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - 10, y - 4, 20, 10);
    for (let i = 0; i < 3; i++) {
      const fy = y - 10 - i * 12; const fr = 16 - i * 4;
      ctx.fillStyle = ['#ff8a2a', '#ffc24a', '#fff2a0'][i];
      ctx.beginPath(); ctx.ellipse(x + Math.sin(t * 12 + i) * 3, fy - Math.sin(t * 8 + i) * 3, fr * 0.7, fr * flick, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  private shelf(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number): void {
    ctx.fillStyle = '#5c3b24'; ctx.fillRect(cx - w / 2, y, w, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx - w / 2, y + 8, w, 6);
    const cols = ['#7bd88f', '#5fc8ff', '#ff7a3c', '#c48bff', '#ffe27a', '#ff5c7a'];
    for (let i = 0; i < 9; i++) {
      const bx = cx - w / 2 + 24 + i * (w - 48) / 8; const bh = 22 + (i * 7) % 16; const bwid = 12 + (i * 5) % 8;
      ctx.fillStyle = cols[i % cols.length]; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.roundRect(bx - bwid / 2, y - bh, bwid, bh, 4); ctx.fill();
      ctx.fillStyle = '#3b2a1e'; ctx.fillRect(bx - 3, y - bh - 6, 6, 8);
      ctx.globalAlpha = 1;
    }
  }

  private cauldron(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.6, r * 0.1, x, y - r * 0.4, r * 1.1);
    body.addColorStop(0, '#4b4f66'); body.addColorStop(1, '#161826');
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y - r * 0.45, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20222f'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.9, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    const liquid = `hsl(${this.brewHue} 80% ${45 + this.brewing * 25}%)`;
    ctx.fillStyle = liquid; ctx.beginPath(); ctx.ellipse(x, y - r * 0.9, r * 0.8, r * 0.17, 0, 0, Math.PI * 2); ctx.fill();
    if (Math.random() < 0.12 + this.brewing * 0.5) this.fx.bubble(x + (Math.random() - 0.5) * r * 1.3, y - r * 0.9, liquid);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.92, r * 0.25, r * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    void t;
  }

  private scale(ctx: CanvasRenderingContext2D, cx: number, baseY: number, halfBeam: number, game: PotionGame): void {
    const postH = Math.min(260, halfBeam * 0.75);
    const pivotY = baseY - postH;
    // base + post
    ctx.fillStyle = '#7a5a2a'; ctx.beginPath(); ctx.roundRect(cx - 60, baseY - 14, 120, 14, 6); ctx.fill();
    const post = ctx.createLinearGradient(cx - 10, 0, cx + 10, 0); post.addColorStop(0, '#5a4118'); post.addColorStop(0.5, '#d9a441'); post.addColorStop(1, '#5a4118');
    ctx.fillStyle = post; ctx.fillRect(cx - 9, pivotY, 18, postH - 14);
    // beam
    const ang = this.tiltShown;
    ctx.save(); ctx.translate(cx, pivotY); ctx.rotate(ang);
    const beam = ctx.createLinearGradient(0, -8, 0, 8); beam.addColorStop(0, '#f0c866'); beam.addColorStop(0.5, '#c8922e'); beam.addColorStop(1, '#6b4a14');
    ctx.fillStyle = beam; ctx.beginPath(); ctx.roundRect(-halfBeam, -7, halfBeam * 2, 14, 7); ctx.fill();
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4a14'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // pans hang straight down from the beam ends
    const chain = Math.min(150, postH * 0.55);
    for (const side of ['left', 'right'] as Side[]) {
      const sx = side === 'left' ? -1 : 1;
      const ex = cx + Math.cos(ang) * halfBeam * sx; const ey = pivotY + Math.sin(ang) * halfBeam * sx;
      const px = ex; const py = ey + chain;
      const panW = Math.min(170, halfBeam * 0.55);
      ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 2;
      for (const dx of [-panW * 0.45, 0, panW * 0.45]) { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(px + dx, py); ctx.stroke(); }
      const pan = ctx.createLinearGradient(0, py - 6, 0, py + 16); pan.addColorStop(0, '#f0c866'); pan.addColorStop(1, '#7a5a2a');
      ctx.fillStyle = pan; ctx.beginPath(); ctx.ellipse(px, py + 6, panW / 2, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(px, py + 9, panW / 2 - 8, 8, 0, 0, Math.PI * 2); ctx.fill();
      this.items(ctx, side, px, py, panW, game.pan(side), game);
    }
  }

  private items(ctx: CanvasRenderingContext2D, side: Side, px: number, py: number, panW: number, pan: Pan, game: PotionGame): void {
    const stones = this.useStones ? Math.floor(pan.drops / 5) : 0; const drops = pan.drops - stones * 5;
    const list: Token['kind'][] = [...Array(pan.bottles).fill('bottle'), ...Array(stones).fill('stone'), ...Array(drops).fill('drop')];
    const perRow = this.useStones ? 6 : 8; const gap = Math.min(30, panW / (perRow + 0.5));
    list.forEach((kind, i) => {
      const row = Math.floor(i / perRow); const col = i % perRow; const inRow = Math.min(perRow, list.length - row * perRow);
      const x = px + (col - (inRow - 1) / 2) * gap; const y = py - 8 - row * 26;
      const r = kind === 'bottle' ? 16 : kind === 'stone' ? 11 : 8;
      this.tokens.push({ kind, side, x, y: y - r, r });
      if (kind === 'bottle') this.bottle(ctx, x, y, game.canRemoveBottle(side));
      else if (kind === 'stone') this.stone(ctx, x, y);
      else this.drop(ctx, x, y);
    });
  }

  private bottle(ctx: CanvasRenderingContext2D, x: number, y: number, removable: boolean): void {
    ctx.save();
    ctx.shadowColor = '#c48bff'; ctx.shadowBlur = removable ? 22 : 12;
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0); g.addColorStop(0, '#6a3fb8'); g.addColorStop(0.5, '#b58cff'); g.addColorStop(1, '#5a34a0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - 5, y - 34); ctx.lineTo(x + 5, y - 34); ctx.lineTo(x + 5, y - 22); ctx.quadraticCurveTo(x + 18, y - 14, x + 16, y - 2); ctx.lineTo(x - 16, y - 2); ctx.quadraticCurveTo(x - 18, y - 14, x - 5, y - 22); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e9d7ff'; ctx.fillRect(x - 6, y - 38, 12, 5);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y - 12);
    ctx.restore();
  }

  private drop(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save(); ctx.shadowColor = '#7bd88f'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#7bd88f';
    ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.quadraticCurveTo(x + 9, y - 6, x, y); ctx.quadraticCurveTo(x - 9, y - 6, x, y - 18); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - 2, y - 9, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private stone(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save(); ctx.shadowColor = '#5fc8ff'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#5fc8ff';
    ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 5; ctx.lineTo(x + Math.cos(a) * 11, y - 11 + Math.sin(a) * 11); } ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#0c2a44'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('5', x, y - 10);
    ctx.restore();
  }
}
void shade;
