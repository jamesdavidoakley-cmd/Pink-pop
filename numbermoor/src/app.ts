// Home → class → rounds → result. Owns the save, the current class game, the canvas loop and the wand trail.
import { Hud, CLASS_INFO, type ClassId } from './hud';
import { audio } from './audio';
import { Fx } from './fx';
import { loadSave, writeSave, HOUSES, type SaveData, type HouseId } from './save';
import { PotionGame, PotionsView, makePotion, type Tier, type Side } from './potions';
import { BroomGame, BroomsView, makeBroomRound } from './brooms';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ROUNDS: Record<ClassId, number> = { potions: 5, brooms: 4 };

type Phase = 'menu' | 'play' | 'answer' | 'celebrate' | 'result';

export class App {
  private save: SaveData = loadSave();
  private phase: Phase = 'menu';
  private cls: ClassId = 'potions';
  private tier: Tier = 1;
  private roundIdx = 0;
  private mistakes = 0;
  private roundMistakes = 0;
  private rand = mulberry32(Date.now() & 0xffffffff);
  private fx = new Fx();
  private ctx: CanvasRenderingContext2D;
  private W = 0; private H = 0;
  private time = 0; private last = performance.now();
  private potion: PotionGame | null = null;
  private potionView = new PotionsView(this.fx);
  private tiltSince = 0;
  private broom: BroomGame | null = null;
  private broomView = new BroomsView(this.fx);
  private wand = { x: -100, y: -100 };
  private waitUntil = 0;
  private afterWait: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, private hud: Hud) {
    this.ctx = canvas.getContext('2d')!;
    audio.setMuted(this.save.muted); hud.setMuted(this.save.muted);
    hud.onStart = () => { audio.unlock(); hud.hideSplash(); audio.tick(); this.toHome(); };
    hud.onHome = () => this.toHome();
    hud.onMute = () => { this.save.muted = !this.save.muted; audio.setMuted(this.save.muted); hud.setMuted(this.save.muted); writeSave(this.save); };
    hud.onHouse = (h) => this.pickHouse(h);
    hud.onLevel = (c, t) => this.startLevel(c, t);
    hud.onUndo = () => { if (this.potion?.undo()) { audio.tap(); this.refreshPotion(); } };
    hud.onHalve = () => this.halve();
    hud.onChoice = (n) => this.answerPotion(n);
    hud.onRows = (d) => { if (this.broom) { this.broom.setRows(this.broom.rows + d); audio.click(); this.refreshBroom(); } };
    hud.onCols = (d) => { if (this.broom) { this.broom.setCols(this.broom.cols + d); audio.click(); this.refreshBroom(); } };
    hud.onSwap = () => { if (this.broom) { this.broom.swap(); audio.whoosh(); this.refreshBroom(); } };
    hud.onFly = () => this.fly();
    hud.onSay = () => this.speakPrompt();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); this.wand.x = e.clientX - r.left; this.wand.y = e.clientY - r.top; });
    canvas.addEventListener('pointerdown', (e) => { const r = canvas.getBoundingClientRect(); this.tap(e.clientX - r.left, e.clientY - r.top); });
    this.toHome();
    requestAnimationFrame(this.loop);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = this.canvas.clientWidth || window.innerWidth; this.H = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- navigation ----

  private toHome(): void {
    this.phase = 'menu';
    this.potion = null; this.broom = null;
    this.hud.showHome(this.save);
    this.hud.setPoints(this.save.points, this.save.house);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (!this.save.house) audio.speak('Welcome to Numbermoor. Choose your house.');
  }

  private pickHouse(h: HouseId): void {
    this.save.house = h; writeSave(this.save);
    audio.fanfare();
    audio.speak(`${HOUSES[h].name}! Welcome. Choose a class.`);
    this.hud.showHome(this.save);
    this.hud.setPoints(this.save.points, this.save.house);
  }

  private startLevel(cls: ClassId, tier: Tier): void {
    this.cls = cls; this.tier = tier; this.roundIdx = 0; this.mistakes = 0;
    this.hud.showPlay(cls);
    audio.tick();
    this.startRound();
  }

  private startRound(): void {
    this.phase = 'play';
    this.roundMistakes = 0;
    this.hud.hideChoices(); this.hud.hideToast();
    this.hud.setRoundDots(ROUNDS[this.cls], this.roundIdx);
    const info = CLASS_INFO[this.cls];
    if (this.cls === 'potions') {
      this.potion = new PotionGame(makePotion(this.tier, this.rand));
      this.potionView.brewing = 0;
      this.potionView.useStones = this.tier > 1;
      this.tiltSince = 0;
      this.hud.setTitle(`${info.title} · ${info.tiers[this.tier - 1]}`, 'How heavy is the mystery bottle?', this.potion.puzzle.words);
      this.refreshPotion();
    } else {
      this.broom = new BroomGame(makeBroomRound(this.tier, this.rand));
      this.hud.setTitle(`${info.title} · ${info.tiers[this.tier - 1]}`, `${this.broom.n} brooms`, this.broom.round.words);
      this.refreshBroom();
    }
    this.speakPrompt();
  }

  private speakPrompt(): void {
    if (this.cls === 'potions' && this.potion) audio.speak(`How heavy is the mystery bottle? ${this.potion.puzzle.words}`);
    if (this.cls === 'brooms' && this.broom) audio.speak(this.broom.round.words);
  }

  private later(seconds: number, fn: () => void): void { this.waitUntil = this.time + seconds; this.afterWait = fn; }

  // ---- potions ----

  private refreshPotion(): void {
    const g = this.potion!;
    this.hud.setUndo(g.history.length > 0);
    const twins = g.left.bottles + g.right.bottles >= 2 && g.left.bottles * g.right.bottles === 0;
    this.hud.setHalve(g.canHalve(), g.canHalve() && twins && g.left.drops + g.right.drops <= (g.left.bottles + g.right.bottles) * 0 + 40);
    const side = g.isolated();
    if (side && this.phase === 'play') {
      this.phase = 'answer';
      const x = g.puzzle.x;
      const opts = [x, x + 1 + Math.floor(this.rand() * 2), Math.max(1, x - 1 - Math.floor(this.rand() * 2))];
      if (opts[2] === x) opts[2] = x + 3;
      opts.sort(() => this.rand() - 0.5);
      audio.clink();
      this.hud.toast('The bottle is alone and the scale balances. Read the other pan!', 'good', 3500);
      audio.speak('The bottle is alone and the scale balances. How heavy is it?');
      this.hud.showChoices('How heavy is the bottle?', opts);
    }
  }

  private tap(x: number, y: number): void {
    if (this.phase !== 'play') return;
    if (this.cls !== 'potions' || !this.potion) return;
    const t = this.potionView.hit(x, y);
    if (!t) return;
    const g = this.potion;
    if (t.kind === 'bottle') {
      if (!g.canRemoveBottle(t.side)) {
        audio.nope();
        this.hud.toast("That's the mystery bottle. Keep it on — take the drops off instead.", 'hint');
        return;
      }
      g.removeBottle(t.side);
      audio.place();
      this.fx.sparkle(x, y, 10, '#c48bff');
      this.hud.toast('One bottle off. Now take one off the other pan too.', 'hint', 2200);
    } else {
      const n = t.kind === 'stone' ? 5 : 1;
      g.removeDrops(t.side, n);
      audio.tap();
      this.fx.sparkle(x, y, 6, t.kind === 'stone' ? '#5fc8ff' : '#7bd88f');
    }
    if (!g.balanced()) { audio.tip(); if (!this.tiltSince) this.tiltSince = this.time; } else this.tiltSince = 0;
    this.refreshPotion();
  }

  private halve(): void {
    const g = this.potion; if (!g || this.phase !== 'play') return;
    if (!g.halve()) { audio.nope(); return; }
    audio.sparkle();
    this.fx.sparkle(this.W * 0.5, this.H * 0.45, 30, '#ffe27a');
    this.hud.toast('Halved both pans. Twins share fairly!', 'good', 2200);
    audio.speak('Halved both pans.');
    this.refreshPotion();
  }

  private answerPotion(n: number): void {
    const g = this.potion; if (!g || this.phase !== 'answer') return;
    if (n !== g.puzzle.x) {
      this.roundMistakes++; this.mistakes++; audio.nope();
      const side = g.isolated()!; const other = side === 'left' ? g.right : g.left;
      const hint = `Not quite. Count the other pan: ${other.drops} drop${other.drops === 1 ? '' : 's'}. The bottle weighs the same.`;
      this.hud.toast(hint, 'hint', 4000); audio.speak(hint);
      return;
    }
    this.phase = 'celebrate';
    this.hud.hideChoices();
    this.potionView.brewHue = 100 + this.rand() * 220;
    const cheer = ['Brewed!', 'Perfect potion!', 'Bubbling brilliant!', 'Yes!', 'Spot on!'][this.roundIdx % 5];
    this.hud.toast(`${cheer} The bottle weighs ${n}.`, 'good', 3000);
    audio.brew();
    audio.speak(`${cheer} The bottle weighs ${n}.`);
    this.award(this.roundMistakes === 0 ? 15 : 10);
    this.later(0.8, () => {
      this.fx.eruption(this.W * 0.5, this.H * 0.86 - Math.min(120, this.W * 0.14) * 0.9, this.potionView.brewHue);
      for (let i = 0; i < 12; i++) this.fx.star(this.W * 0.5 + (this.rand() - 0.5) * 300, this.H * 0.5 + (this.rand() - 0.5) * 200, `hsl(${this.potionView.brewHue} 90% 70%)`);
      this.potionView.brewing = 1;
      this.later(1.6, () => this.nextRound());
    });
  }

  // ---- brooms ----

  private refreshBroom(): void {
    const g = this.broom!;
    this.hud.setRowsCols(g.rows, g.cols, g.rows * g.cols, g.n);
    this.hud.setFound(g.pairs, g.found, g.round.prime);
    this.broomView.layout(g, this.W, this.H);
  }

  private fly(): void {
    const g = this.broom; if (!g || this.phase !== 'play') return;
    const r = g.fly();
    if (!r.ok) {
      this.roundMistakes++; this.mistakes++; audio.nope();
      const msg = r.leftover > 0
        ? `${r.rows} × ${r.cols} = ${r.product}. ${r.leftover} broom${r.leftover === 1 ? '' : 's'} left over in the hangar!`
        : `${r.rows} × ${r.cols} = ${r.product}. That needs ${r.short} more broom${r.short === 1 ? '' : 's'} than we have.`;
      this.hud.toast(msg, 'hint', 4000); audio.speak(msg);
      return;
    }
    audio.whoosh();
    if (r.already) { this.hud.toast(`${r.rows} × ${r.cols} — you already found that one. Try another!`, 'hint'); this.refreshBroom(); return; }
    this.refreshBroom();
    for (const p of this.broomView.broomPositions().slice(0, g.n)) if (this.rand() < 0.3) this.fx.sparkle(p.x, p.y, 4, '#ffe27a');
    this.award(this.roundMistakes === 0 ? 8 : 5);
    const pair = g.pairs.find(([a, b]) => a === r.cols && b === r.rows && a !== b);
    if (g.complete()) {
      this.phase = 'celebrate';
      const line = g.round.prime
        ? `${g.n} only flies single file. ${g.n} is a PRIME number!`
        : `That's every formation for ${g.n}! ${g.pairs.length} ways.`;
      this.hud.toast(line, 'good', 4500); audio.speak(line);
      this.award(g.round.prime ? 20 : 12);
      const pos = this.broomView.broomPositions().slice(0, g.n);
      pos.forEach((p, i) => this.fx.firework(p.x, p.y, (i * 47) % 360, i * 0.08));
      for (let i = 0; i < Math.ceil(g.n / 4); i++) setTimeout(() => audio.firework(), 700 + i * 300);
      this.later(1.2 + g.n * 0.08 + 1.4, () => this.nextRound());
    } else {
      const say = `${r.rows} rows of ${r.cols}. ${r.rows} times ${r.cols} is ${g.n}.` + (pair && !g.found.has(`${r.cols}x${r.rows}`) ? ` Try turning it: ${r.cols} rows of ${r.rows}.` : '');
      this.hud.toast(`${r.rows} × ${r.cols} = ${g.n} ✓`, 'good', 2500); audio.speak(say);
    }
  }

  // ---- shared ----

  private award(points: number): void {
    this.save.points += points; writeSave(this.save);
    this.hud.setPoints(this.save.points, this.save.house); this.hud.bumpPoints();
  }

  private nextRound(): void {
    this.roundIdx++;
    if (this.roundIdx < ROUNDS[this.cls]) { this.startRound(); return; }
    this.finishLevel();
  }

  private finishLevel(): void {
    this.phase = 'result';
    const stars = this.mistakes <= 1 ? 3 : this.mistakes <= 3 ? 2 : 1;
    const key = `${this.cls}-${this.tier}`;
    const prev = this.save.stars[key] ?? 0;
    if (stars > prev) { this.save.stars[key] = stars; this.award(stars * 10); }
    writeSave(this.save);
    const house = this.save.house ? HOUSES[this.save.house].name : 'your house';
    const title = stars === 3 ? 'Outstanding!' : stars === 2 ? 'Exceeds expectations!' : 'Level complete';
    const sub = `${stars} star${stars === 1 ? '' : 's'} and ${stars * 10} points for ${house}. ${this.cls === 'potions' ? 'Same to both pans, every time.' : 'Rows times brooms per row, every time.'}`;
    audio.fanfare(); audio.speak(title + '. ' + sub);
    const nextTier = (this.tier + 1) as Tier;
    const next = this.tier < 3 ? { cls: this.cls, tier: nextTier } : { cls: (this.cls === 'potions' ? 'brooms' : 'potions') as ClassId, tier: 1 as Tier };
    this.hud.showResult(stars, title, sub, { home: () => this.toHome(), again: () => this.startLevel(this.cls, this.tier), next: () => this.startLevel(next.cls, next.tier) });
  }

  // ---- frame ----

  private loop = (): void => {
    const now = performance.now(); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.time += dt;
    if (this.afterWait && this.time >= this.waitUntil) { const f = this.afterWait; this.afterWait = null; f(); }
    const ctx = this.ctx;
    if (this.phase !== 'menu') {
      if (this.cls === 'potions' && this.potion) {
        this.potionView.update(this.potion, dt);
        this.potionView.draw(ctx, this.W, this.H, this.potion, this.time);
        if (this.phase === 'play' && this.tiltSince && this.time - this.tiltSince > 3.5) {
          this.tiltSince = this.time + 6;
          this.hud.toast('The scale is tipping! Whatever you take from one pan, take from the other.', 'hint', 3500);
          audio.speak('The scale is tipping. Whatever you take from one pan, take from the other.');
        }
      } else if (this.cls === 'brooms' && this.broom) {
        this.broomView.layout(this.broom, this.W, this.H);
        this.broomView.update(dt);
        this.broomView.draw(ctx, this.W, this.H, this.broom, this.time);
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, this.H); g.addColorStop(0, '#0d0a2a'); g.addColorStop(1, '#2a1a4a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 120; i++) { const x = ((i * 97) % 1000) / 1000 * this.W; const y = ((i * 57) % 1000) / 1000 * this.H; ctx.globalAlpha = 0.3 + 0.6 * Math.abs(Math.sin(this.time + i)); ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3) * 0.6, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (this.wand.x > 0 && Math.random() < 0.6) this.fx.trail(this.wand.x, this.wand.y, this.save.house ? HOUSES[this.save.house].color : '#ffe27a');
    this.fx.update(dt, this.H);
    this.fx.draw(ctx);
    requestAnimationFrame(this.loop);
  };

  /** Headless checks. */
  debug() {
    return {
      phase: this.phase, cls: this.cls, round: this.roundIdx, points: this.save.points, stars: { ...this.save.stars }, house: this.save.house,
      potion: this.potion ? { x: this.potion.puzzle.x, left: { ...this.potion.left }, right: { ...this.potion.right }, balanced: this.potion.balanced(), isolated: this.potion.isolated() } : null,
      broom: this.broom ? { n: this.broom.n, rows: this.broom.rows, cols: this.broom.cols, found: [...this.broom.found], pairs: this.broom.pairs, complete: this.broom.complete() } : null,
      // drive the model directly
      removeDrops: (side: Side, n: number) => { this.potion?.removeDrops(side, n); this.refreshPotion(); },
      removeBottle: (side: Side) => { this.potion?.removeBottle(side); this.refreshPotion(); },
      halve: () => this.halve(),
      answer: (n: number) => this.answerPotion(n),
      setRows: (r: number) => { this.broom?.setRows(r); this.refreshBroom(); },
      setCols: (c: number) => { this.broom?.setCols(c); this.refreshBroom(); },
      fly: () => this.fly(),
      tokenAt: (kind: string, side: string) => { const v = this.potionView as unknown as { tokens: { kind: string; side: string; x: number; y: number }[] }; return v.tokens.find((t) => t.kind === kind && t.side === side) ?? null; },
    };
  }
}
