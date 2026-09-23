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
  /** The very last bottle can never come off, it is the thing we are weighing. Any other bottle can (and the scale will tell you if that was fair). */
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
interface Hopper { kind: Token['kind']; x: number; y: number; vx: number; vy: number; rot: number; life: number }

const TAU = Math.PI * 2;

export class PotionsView {
  private tiltShown = 0;
  private tiltVel = 0;
  private tokens: Token[] = [];
  private hoppers: Hopper[] = [];
  private jiggle = 0;
  brewHue = 130;
  brewing = 0; // 0..1 potion fill
  /** Level 1 shows every frog; higher levels bundle fives into golden toads. */
  useStones = false;
  /** Where the wand is, so eyes can follow it. */
  wand = { x: 0, y: 0 };
  /** After a correct answer: the blob hops out and shows its number. */
  reveal: { n: number; t: number } | null = null;
  constructor(private fx: Fx) {}

  update(game: PotionGame, dt: number): void {
    const target = Math.max(-1, Math.min(1, game.tilt() / 6)) * 0.3;
    // springy beam: overshoots and settles like a real balance
    const k = 40; const damp = 6;
    this.tiltVel += ((target - this.tiltShown) * k - this.tiltVel * damp) * dt;
    this.tiltShown += this.tiltVel * dt;
    this.jiggle = Math.abs(game.tilt()) > 0 ? 1 : 0;
    for (let i = this.hoppers.length - 1; i >= 0; i--) {
      const h = this.hoppers[i]; h.life += dt; h.x += h.vx * dt; h.y += h.vy * dt; h.vy += 900 * dt; h.rot += 6 * dt;
      if (h.life > 1.6) this.hoppers.splice(i, 1);
    }
    if (this.reveal) this.reveal.t += dt;
  }

  /** The tapped token hops off the pan and away. */
  hop(t: Token): void {
    const dir = t.side === 'left' ? -1 : 1;
    this.hoppers.push({ kind: t.kind, x: t.x, y: t.y, vx: dir * (180 + Math.random() * 160), vy: -420 - Math.random() * 200, rot: 0, life: 0 });
    this.fx.sparkle(t.x, t.y, 8, t.kind === 'stone' ? '#ffd23f' : t.kind === 'bottle' ? '#c48bff' : '#7bd88f');
  }

  hit(x: number, y: number): Token | null {
    let best: Token | null = null; let bd = 1e9;
    for (const t of this.tokens) { const d = Math.hypot(t.x - x, t.y - y); if (d < t.r * 1.5 && d < bd) { bd = d; best = t; } }
    return best;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, game: PotionGame, time: number): void {
    this.tokens = [];
    // bright dungeon: violet walls with pink and teal glows
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3b1f6e'); g.addColorStop(0.55, '#5a2d8f'); g.addColorStop(1, '#2a1650');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const [fx, fy, col] of [[0.15, 0.35, 'rgba(255, 110, 190, 0.22)'], [0.85, 0.3, 'rgba(90, 230, 220, 0.2)'], [0.5, 0.9, 'rgba(255, 200, 80, 0.18)']] as [number, number, string][]) {
      const r = ctx.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, W * 0.35); r.addColorStop(0, col); r.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
    }
    // soft bricks
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 2;
    const bh = 40; const bw = 90;
    for (let y = 0; y < H; y += bh) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      const off = ((y / bh) % 2) * bw / 2;
      for (let x = off; x < W; x += bw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); }
    }
    for (const tx of [W * 0.1, W * 0.9]) this.torch(ctx, tx, H * 0.32, time);
    this.shelf(ctx, W * 0.5, H * 0.27, Math.min(W * 0.5, 640), time);
    // floor
    const tableY = H * 0.86;
    const fl = ctx.createLinearGradient(0, tableY, 0, H); fl.addColorStop(0, '#2fb7a4'); fl.addColorStop(1, '#1b7a6d');
    ctx.fillStyle = fl; ctx.fillRect(0, tableY, W, H - tableY);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, tableY, W, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 70) { ctx.beginPath(); ctx.moveTo(x, tableY); ctx.lineTo(x, H); ctx.stroke(); }
    this.cauldron(ctx, W * 0.5, tableY - 4, Math.min(120, W * 0.14), time);
    this.scale(ctx, W * 0.5, tableY - 18, Math.min(W * 0.36, 380), game, time);
    for (const h of this.hoppers) this.token(ctx, h.kind, h.x, h.y, h.rot, time, false);
    if (this.reveal) this.blobReveal(ctx, W * 0.5, tableY - 150, time);
  }

  private torch(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const flick = 0.85 + Math.sin(t * 9 + x) * 0.08 + Math.sin(t * 23 + x * 2) * 0.07;
    const glow = ctx.createRadialGradient(x, y - 20, 0, x, y - 20, 240 * flick);
    glow.addColorStop(0, 'rgba(255, 190, 90, 0.45)'); glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 260, y - 280, 520, 520);
    ctx.fillStyle = '#6b3d1e'; ctx.beginPath(); ctx.roundRect(x - 7, y, 14, 64, 6); ctx.fill();
    ctx.fillStyle = '#a8642e'; ctx.beginPath(); ctx.roundRect(x - 13, y - 6, 26, 12, 5); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const fy = y - 12 - i * 13; const fr = 18 - i * 5;
      ctx.fillStyle = ['#ff7a2a', '#ffc24a', '#fff6b0'][i];
      ctx.beginPath(); ctx.ellipse(x + Math.sin(t * 12 + i) * 3, fy - Math.sin(t * 8 + i) * 3, fr * 0.7, fr * flick, 0, 0, TAU); ctx.fill();
    }
  }

  private shelf(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, t: number): void {
    ctx.fillStyle = '#8a5a2e'; ctx.beginPath(); ctx.roundRect(cx - w / 2, y, w, 12, 6); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx - w / 2 + 4, y + 12, w - 8, 6);
    const cols = ['#7bd88f', '#5fc8ff', '#ff7a3c', '#c48bff', '#ffe27a', '#ff5c7a', '#ffa1e0'];
    for (let i = 0; i < 8; i++) {
      const bx = cx - w / 2 + 34 + i * (w - 68) / 7; const bh = 30 + (i * 7) % 18; const bwid = 20 + (i * 5) % 10;
      const bob = Math.sin(t * 2 + i) * 1.5;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.roundRect(bx - bwid / 2, y - bh + bob, bwid, bh, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.roundRect(bx - bwid / 2 + 4, y - bh + 6 + bob, 5, bh - 12, 3); ctx.fill();
      ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.roundRect(bx - 5, y - bh - 8 + bob, 10, 10, 3); ctx.fill();
      // eyes on every other bottle
      if (i % 2 === 0) { this.eyes(ctx, bx, y - bh * 0.55 + bob, 3.5, 0.7); }
    }
  }

  private eyes(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, gap: number): void {
    const dx = this.wand.x - x; const dy = this.wand.y - y; const d = Math.hypot(dx, dy) || 1;
    const lx = (dx / d) * r * 0.4; const ly = (dy / d) * r * 0.4;
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + sx * r * gap * 1.6, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1030'; ctx.beginPath(); ctx.arc(x + sx * r * gap * 1.6 + lx, y + ly, r * 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + sx * r * gap * 1.6 + lx - r * 0.15, y + ly - r * 0.2, r * 0.15, 0, TAU); ctx.fill();
    }
  }

  private cauldron(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.15, r * 0.25, 0, 0, TAU); ctx.fill();
    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.6, r * 0.1, x, y - r * 0.4, r * 1.1);
    body.addColorStop(0, '#6a6f95'); body.addColorStop(1, '#23253a');
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y - r * 0.45, r, r * 0.55, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2d45'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.9, r * 0.92, r * 0.24, 0, 0, TAU); ctx.fill();
    const liquid = `hsl(${this.brewHue} 85% ${48 + this.brewing * 22}%)`;
    ctx.fillStyle = liquid; ctx.beginPath(); ctx.ellipse(x, y - r * 0.9, r * 0.82, r * 0.18, 0, 0, TAU); ctx.fill();
    if (Math.random() < 0.15 + this.brewing * 0.5) this.fx.bubble(x + (Math.random() - 0.5) * r * 1.3, y - r * 0.9, liquid);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.92, r * 0.25, r * 0.05, 0, 0, TAU); ctx.fill();
    // the cauldron's face
    this.eyes(ctx, x, y - r * 0.5, r * 0.09, 0.9);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y - r * 0.38, r * 0.16, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    void t;
  }

  private scale(ctx: CanvasRenderingContext2D, cx: number, baseY: number, halfBeam: number, game: PotionGame, time: number): void {
    const postH = Math.min(260, halfBeam * 0.75);
    const pivotY = baseY - postH;
    // base + post, chunky gold
    ctx.fillStyle = '#b8791e'; ctx.beginPath(); ctx.roundRect(cx - 70, baseY - 16, 140, 16, 8); ctx.fill();
    ctx.fillStyle = '#ffd35c'; ctx.beginPath(); ctx.roundRect(cx - 70, baseY - 16, 140, 6, 3); ctx.fill();
    const post = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0); post.addColorStop(0, '#8a5a12'); post.addColorStop(0.5, '#ffd35c'); post.addColorStop(1, '#8a5a12');
    ctx.fillStyle = post; ctx.beginPath(); ctx.roundRect(cx - 11, pivotY, 22, postH - 14, 8); ctx.fill();
    // the scale's face on the post: eyes widen when tipped
    const wide = 1 + Math.min(1, Math.abs(this.tiltShown) * 4) * 0.5;
    this.eyes(ctx, cx, pivotY + 34, 4.5 * wide, 0.9);
    ctx.strokeStyle = '#3a2408'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (game.balanced()) ctx.arc(cx, pivotY + 44, 6, 0.1 * Math.PI, 0.9 * Math.PI); else ctx.arc(cx, pivotY + 52, 6, 1.1 * Math.PI, 1.9 * Math.PI);
    ctx.stroke();
    // beam
    const ang = this.tiltShown;
    ctx.save(); ctx.translate(cx, pivotY); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.roundRect(-halfBeam, -4, halfBeam * 2, 20, 10); ctx.fill();
    const beam = ctx.createLinearGradient(0, -9, 0, 9); beam.addColorStop(0, '#fff0a0'); beam.addColorStop(0.5, '#ffc83c'); beam.addColorStop(1, '#a86f14');
    ctx.fillStyle = beam; ctx.beginPath(); ctx.roundRect(-halfBeam, -9, halfBeam * 2, 18, 9); ctx.fill();
    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a86f14'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
    ctx.restore();
    const chain = Math.min(150, postH * 0.55);
    for (const side of ['left', 'right'] as Side[]) {
      const sx = side === 'left' ? -1 : 1;
      const ex = cx + Math.cos(ang) * halfBeam * sx; const ey = pivotY + Math.sin(ang) * halfBeam * sx;
      const px = ex; const py = ey + chain;
      const panW = Math.min(180, halfBeam * 0.58);
      ctx.strokeStyle = '#ffd35c'; ctx.lineWidth = 3;
      for (const dx of [-panW * 0.45, 0, panW * 0.45]) { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(px + dx, py); ctx.stroke(); }
      const panCol = side === 'left' ? '#c48bff' : '#5fc8ff';
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(px + 4, py + 12, panW / 2, 15, 0, 0, TAU); ctx.fill();
      const pan = ctx.createLinearGradient(0, py - 6, 0, py + 18); pan.addColorStop(0, '#fff'); pan.addColorStop(0.3, panCol); pan.addColorStop(1, '#3a2470');
      ctx.fillStyle = pan; ctx.beginPath(); ctx.ellipse(px, py + 6, panW / 2, 15, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(px, py + 3, panW / 2 - 10, 7, 0, 0, TAU); ctx.fill();
      this.items(ctx, side, px, py, panW, game.pan(side), game, time);
    }
  }

  private items(ctx: CanvasRenderingContext2D, side: Side, px: number, py: number, panW: number, pan: Pan, game: PotionGame, time: number): void {
    const stones = this.useStones ? Math.floor(pan.drops / 5) : 0; const drops = pan.drops - stones * 5;
    const list: Token['kind'][] = [...Array(pan.bottles).fill('bottle'), ...Array(stones).fill('stone'), ...Array(drops).fill('drop')];
    const perRow = this.useStones ? 5 : 6; const gap = Math.min(34, panW / (perRow + 0.4));
    const heavy = (side === 'right' ? 1 : -1) * game.tilt() > 0;
    list.forEach((kind, i) => {
      const row = Math.floor(i / perRow); const col = i % perRow; const inRow = Math.min(perRow, list.length - row * perRow);
      const x = px + (col - (inRow - 1) / 2) * gap; const y = py - 6 - row * 30 + (this.jiggle && heavy ? Math.sin(time * 30 + i) * 1.5 : 0);
      const r = kind === 'bottle' ? 20 : kind === 'stone' ? 15 : 12;
      this.tokens.push({ kind, side, x, y: y - r, r });
      this.token(ctx, kind, x, y, 0, time + i, kind === 'bottle' && !game.canRemoveBottle(side));
    });
  }

  /** Frog (1), golden toad (5) or the blob in a jar (the mystery bottle). */
  private token(ctx: CanvasRenderingContext2D, kind: Token['kind'], x: number, y: number, rot: number, t: number, locked: boolean): void {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (kind === 'bottle') {
      ctx.shadowColor = '#e0b8ff'; ctx.shadowBlur = locked ? 22 : 12;
      ctx.fillStyle = 'rgba(200, 225, 255, 0.55)'; ctx.beginPath(); ctx.roundRect(-18, -40, 36, 40, 10); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#8a5a2e'; ctx.beginPath(); ctx.roundRect(-14, -48, 28, 10, 4); ctx.fill();
      // the blob inside, wobbling
      const wob = Math.sin(t * 6) * 2;
      ctx.fillStyle = '#b86cff'; ctx.beginPath(); ctx.ellipse(0, -14, 13 + wob, 12 - wob, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d9a8ff'; ctx.beginPath(); ctx.ellipse(-4, -19, 4, 3, 0, 0, TAU); ctx.fill();
      this.eyes(ctx, 0, -16, 3, 0.8);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(-18, -40, 36, 40);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, -34);
    } else if (kind === 'stone') {
      ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffc83c'; ctx.beginPath(); ctx.ellipse(0, -13, 16, 12, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.ellipse(0, -9, 10, 6, 0, 0, TAU); ctx.fill();
      this.eyes(ctx, 0, -20, 3.2, 0.9);
      ctx.fillStyle = '#7a4a00'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('5', 0, -8);
      ctx.fillStyle = '#ffd23f'; for (const sx of [-12, 12]) { ctx.beginPath(); ctx.ellipse(sx, -4, 5, 3, 0, 0, TAU); ctx.fill(); }
    } else {
      const hop = Math.abs(Math.sin(t * 2.5)) * 2;
      ctx.shadowColor = '#7bd88f'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#5ccf6f'; ctx.beginPath(); ctx.ellipse(0, -11 - hop, 12, 9, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#a8f0b0'; ctx.beginPath(); ctx.ellipse(0, -7 - hop, 7, 4, 0, 0, TAU); ctx.fill();
      this.eyes(ctx, 0, -18 - hop, 3, 0.8);
      ctx.strokeStyle = '#2a7a3a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -10 - hop, 4, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#5ccf6f'; for (const sx of [-9, 9]) { ctx.beginPath(); ctx.ellipse(sx, -3, 4, 2.5, 0, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  private blobReveal(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
    const r = this.reveal!;
    const up = Math.min(1, r.t * 1.6); const bounce = Math.abs(Math.sin(r.t * 5)) * 18 * (1 - Math.min(1, r.t / 2.5));
    const by = y - up * 80 - bounce;
    const size = 26 + Math.sin(time * 6) * 2;
    ctx.save();
    ctx.shadowColor = '#e0b8ff'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#b86cff'; ctx.beginPath(); ctx.ellipse(x, by, size * 1.2, size, 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#d9a8ff'; ctx.beginPath(); ctx.ellipse(x - 8, by - 10, 8, 5, 0, 0, TAU); ctx.fill();
    this.eyes(ctx, x, by - 6, 6, 0.8);
    ctx.strokeStyle = '#3a1a5a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, by + 4, 10, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    // number badge
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x, by - 62, 26, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#3a1a5a'; ctx.font = 'bold 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(r.n), x, by - 61);
    ctx.restore();
  }
}
void shade;
