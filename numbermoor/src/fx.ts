// Particles shared by both classes: sparkles, wand trail, fireworks, potion eruption.
export interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'spark' | 'trail' | 'rocket' | 'burst' | 'bubble' | 'star'; hue?: number; g: number }

export class Fx {
  parts: P[] = [];
  private pendingRockets: { x: number; y: number; hue: number; t: number }[] = [];

  sparkle(x: number, y: number, n = 12, color = '#fff3b0'): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; const s = 20 + Math.random() * 90;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 0, max: 0.5 + Math.random() * 0.5, size: 2 + Math.random() * 3, color, kind: 'spark', g: 60 });
    }
  }
  trail(x: number, y: number, color: string): void {
    this.parts.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 20, life: 0, max: 0.6, size: 2 + Math.random() * 2.5, color, kind: 'trail', g: 0 });
  }
  bubble(x: number, y: number, color: string): void {
    this.parts.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 30, life: 0, max: 0.8 + Math.random() * 0.6, size: 3 + Math.random() * 5, color, kind: 'bubble', g: -10 });
  }
  star(x: number, y: number, color = '#ffe27a'): void {
    this.parts.push({ x, y, vx: 0, vy: -25, life: 0, max: 0.9, size: 6 + Math.random() * 6, color, kind: 'star', g: 0 });
  }
  /** A rocket that explodes at (x, y) after a short flight from below. */
  firework(x: number, y: number, hue: number, delay = 0): void {
    this.pendingRockets.push({ x, y, hue, t: -delay });
  }
  eruption(x: number, y: number, hue: number, n = 160): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4; const s = 120 + Math.random() * 380;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 1.2 + Math.random() * 1.2, size: 3 + Math.random() * 5, color: `hsl(${hue + (Math.random() - 0.5) * 40} 95% 65%)`, kind: 'burst', g: 260 });
    }
  }
  private explode(x: number, y: number, hue: number): void {
    const n = 60 + Math.floor(Math.random() * 40);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; const s = 60 + Math.random() * 200;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.9 + Math.random() * 0.8, size: 2 + Math.random() * 3, color: `hsl(${hue + (Math.random() - 0.5) * 30} 100% 68%)`, kind: 'burst', g: 90 });
    }
  }

  update(dt: number, H: number): void {
    for (let i = this.pendingRockets.length - 1; i >= 0; i--) {
      const r = this.pendingRockets[i]; r.t += dt;
      if (r.t < 0) continue;
      if (r.t === dt || r.t < dt * 1.5) this.parts.push({ x: r.x + (Math.random() - 0.5) * 40, y: H + 10, vx: 0, vy: -(H + 10 - r.y) / 0.7, life: 0, max: 0.7, size: 3, color: `hsl(${r.hue} 100% 75%)`, kind: 'rocket', g: 0, hue: r.hue });
      if (r.t >= 0.7) { this.explode(r.x, r.y, r.hue); this.pendingRockets.splice(i, 1); }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life += dt;
      if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      if (p.kind === 'burst') { p.vx *= 0.985; p.vy *= 0.985; }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.parts) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.fillStyle = p.color;
      if (p.kind === 'star') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 3);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5; const r = i % 2 ? p.size * 0.45 : p.size; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (p.kind === 'bubble') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + p.life), 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'rocket') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha *= 0.4; ctx.beginPath(); ctx.arc(p.x, p.y - p.vy * 0.03, p.size * 0.8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === 'burst' ? 0.5 + k * 0.6 : k), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

export function hex(h: string): number[] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function shade(h: string, amt: number): string { const p = hex(h).map((v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))))); return `rgb(${p.join(',')})`; }
export function rand(seed: number): number { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
