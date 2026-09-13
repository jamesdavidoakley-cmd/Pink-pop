// Menu → build → TEST → loads → result. Owns the build state, drives the renderer, sim and HUD.
import { Renderer, type Ghost, type Focus } from './render';
import { Hud } from './hud';
import { audio } from './audio';
import { Sim, explain, type Outcome } from './sim';
import { makeLevel, MODES, MODE_INFO, type LevelDef, type ModeId, type Tier, type LoadDef } from './levels';
import { SEGMENTS, BLOCKS, isSegment, isBlock, type ToolKind } from './parts';
import { emptyBuild, cloneBuild, buildCost, canPlaceSegment, placeSegment, canPlaceBlock, placeBlock, eraseAt, type Build } from './build';
import { loadSave, writeSave, levelKey, type SaveData } from './save';

type Phase = 'menu' | 'build' | 'testing' | 'result';

export class Game {
  private save: SaveData = loadSave();
  private phase: Phase = 'menu';
  private mode: ModeId = 'bridge';
  private tier: Tier = 1;
  private level: LevelDef = makeLevel('bridge', 1);
  private build: Build = emptyBuild();
  private undoStack: Build[] = [];
  private tool: ToolKind = 'beam';
  private sim: Sim | null = null;
  private ghost: Ghost | null = null;
  private hover: { x: number; y: number } | null = null;
  private focus: Focus | null = null;
  private drag: { ax: number; ay: number } | null = null;
  private time = 0;
  private last = performance.now();
  private timeScale = 1;
  private simAccum = 0;
  private loadIdx = 0;
  private loadsHeld = 0;
  private loadStates: ('todo' | 'now' | 'ok' | 'fail')[] = [];
  private outcome: Outcome | null = null;
  private wait = 0;
  private testStage: 'settle' | 'load' | 'holdPause' | 'fail' | 'done' = 'settle';

  constructor(private renderer: Renderer, private hud: Hud) {
    audio.setMuted(this.save.muted);
    hud.setMuted(this.save.muted);
    hud.onStart = () => { audio.unlock(); hud.hideSplash(); audio.tick(); this.toMenu(); };
    hud.onHome = () => this.toMenu();
    hud.onMute = () => { this.save.muted = !this.save.muted; audio.setMuted(this.save.muted); hud.setMuted(this.save.muted); writeSave(this.save); };
    hud.onLevel = (m, t) => this.startLevel(m, t);
    hud.onTool = (t) => { this.tool = t; hud.selectTool(t); audio.click(); };
    hud.onUndo = () => this.undo();
    hud.onClear = () => { if (this.phase !== 'build') return; this.pushUndo(); this.build = emptyBuild(); this.afterEdit(); audio.erase(); };
    hud.onTest = () => this.startTest();
    this.bindPointer();
    this.toMenu();
    requestAnimationFrame(this.loop);
  }

  // ---- navigation ----

  private toMenu(): void {
    this.phase = 'menu';
    this.sim = null;
    this.focus = null;
    this.hud.showMenu(this.save);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  private startLevel(mode: ModeId, tier: Tier, keepBuild = false): void {
    this.mode = mode;
    this.tier = tier;
    this.level = makeLevel(mode, tier);
    if (!keepBuild) { this.build = emptyBuild(); this.undoStack = []; }
    this.sim = null;
    this.focus = null;
    this.outcome = null;
    this.phase = 'build';
    this.tool = this.level.tools[0];
    this.hud.showBuild();
    this.hud.hideResult();
    this.hud.setBlueprint(`${MODE_INFO[mode].title} · Level ${tier}`, this.level.prompt);
    this.hud.setTools(this.level.tools, this.tool);
    this.afterEdit();
    audio.tick();
    audio.speak(this.level.words);
  }

  private afterEdit(): void {
    this.hud.setBudget(buildCost(this.build), this.level.budget, this.level.par);
    this.hud.setUndo(this.undoStack.length > 0);
  }

  private pushUndo(): void {
    this.undoStack.push(cloneBuild(this.build));
    if (this.undoStack.length > 60) this.undoStack.shift();
  }

  private undo(): void {
    if (this.phase !== 'build') return;
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.build = prev;
    this.afterEdit();
    audio.erase();
  }

  // ---- pointer input on the canvas ----

  private bindPointer(): void {
    const c = this.renderer.canvas;
    const world = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
    };
    const snap = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });
    c.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'build') return;
      c.setPointerCapture(e.pointerId);
      const w = world(e);
      const g = snap(w);
      if (isSegment(this.tool)) {
        if (Math.hypot(w.x - g.x, w.y - g.y) > 0.6) return;
        this.drag = { ax: g.x, ay: g.y };
        this.ghost = { type: 'segment', kind: this.tool, ax: g.x, ay: g.y, bx: g.x, by: g.y, ok: false };
      } else if (isBlock(this.tool)) {
        const d = BLOCKS[this.tool];
        const x = Math.round(w.x - d.w / 2); const y = Math.round(w.y + d.h / 2);
        const res = canPlaceBlock(this.level, this.build, this.tool, x, y);
        if (res.ok) { this.pushUndo(); placeBlock(this.build, this.tool, x, y); this.afterEdit(); audio.place(); }
        else { audio.nope(); this.hud.toast(res.why, 'hint'); }
      } else if (this.tool === 'pivot' && this.level.lever) {
        const lv = this.level.lever;
        const px = lv.pivotXs.reduce((best, x) => (Math.abs(x - w.x) < Math.abs(best - w.x) ? x : best), lv.pivotXs[0]);
        if (Math.abs(px - w.x) < 1.2 && Math.abs(w.y - lv.y) < 2.5) { this.pushUndo(); this.build.pivotX = px; this.afterEdit(); audio.place(); }
      } else if (this.tool === 'eraser') {
        const snapshot = cloneBuild(this.build);
        if (eraseAt(this.build, w.x, w.y)) { this.undoStack.push(snapshot); this.afterEdit(); audio.erase(); }
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (this.phase !== 'build') { this.hover = null; return; }
      const w = world(e);
      const g = snap(w);
      this.hover = Math.hypot(w.x - g.x, w.y - g.y) < 0.6 ? g : null;
      if (this.drag && isSegment(this.tool)) {
        const def = SEGMENTS[this.tool];
        let bx = g.x; let by = g.y;
        if (def.vertical) bx = this.drag.ax;
        const ok = canPlaceSegment(this.level, this.build, this.tool, this.drag.ax, this.drag.ay, bx, by).ok;
        this.ghost = { type: 'segment', kind: this.tool, ax: this.drag.ax, ay: this.drag.ay, bx, by, ok };
      } else if (isBlock(this.tool)) {
        const d = BLOCKS[this.tool];
        const x = Math.round(w.x - d.w / 2); const y = Math.round(w.y + d.h / 2);
        this.ghost = { type: 'block', kind: this.tool, x, y, ok: canPlaceBlock(this.level, this.build, this.tool, x, y).ok };
      } else if (this.tool === 'pivot' && this.level.lever) {
        const lv = this.level.lever;
        const px = lv.pivotXs.reduce((best, x) => (Math.abs(x - w.x) < Math.abs(best - w.x) ? x : best), lv.pivotXs[0]);
        this.ghost = { type: 'pivot', x: px, ok: Math.abs(px - w.x) < 1.2 };
      } else this.ghost = null;
    });
    const finish = (e: PointerEvent) => {
      if (!this.drag || !isSegment(this.tool)) { this.drag = null; if (!isBlock(this.tool) && this.tool !== 'pivot') this.ghost = null; return; }
      const w = world(e);
      const g = snap(w);
      const def = SEGMENTS[this.tool];
      const bx = def.vertical ? this.drag.ax : g.x;
      const res = canPlaceSegment(this.level, this.build, this.tool, this.drag.ax, this.drag.ay, bx, g.y);
      if (res.ok) { this.pushUndo(); placeSegment(this.build, this.tool, this.drag.ax, this.drag.ay, bx, g.y); this.afterEdit(); audio.place(); }
      else if (Math.hypot(bx - this.drag.ax, g.y - this.drag.ay) >= 0.5) { audio.nope(); this.hud.toast(res.why, 'hint'); }
      this.drag = null;
      this.ghost = null;
    };
    c.addEventListener('pointerup', finish);
    c.addEventListener('pointercancel', () => { this.drag = null; this.ghost = null; });
    c.addEventListener('pointerleave', () => { this.hover = null; if (!this.drag) this.ghost = null; });
  }

  // ---- the test ----

  private startTest(): void {
    if (this.phase !== 'build') return;
    const sim = new Sim(this.level, cloneBuild(this.build));
    const pre = sim.precheck();
    if (pre) {
      audio.nope();
      const why = explain(pre, this.level);
      this.hud.toast(why, 'hint', 3500);
      audio.speak(why);
      return;
    }
    this.sim = sim;
    this.phase = 'testing';
    this.testStage = 'settle';
    this.wait = 0.9;
    this.loadIdx = 0;
    this.loadsHeld = 0;
    this.outcome = null;
    this.timeScale = 1;
    this.focus = null;
    this.loadStates = this.level.loads.map(() => 'todo');
    this.hud.showTesting();
    this.hud.setTestBar(this.level.loads.map((l, i) => ({ label: l.label, state: this.loadStates[i] })));
    this.hud.hideToast();
    audio.testStart();
    audio.speak('Testing!');
  }

  private beginLoad(): void {
    const load = this.level.loads[this.loadIdx];
    this.sim!.startLoad(load);
    this.loadStates[this.loadIdx] = 'now';
    this.hud.setTestBar(this.level.loads.map((l, i) => ({ label: l.label, state: this.loadStates[i] })));
    this.testStage = 'load';
    if (load.type === 'quake') this.renderer.dust(12, this.level.ground[0][1], 30, 20);
    this.announce(load);
  }

  private announce(load: LoadDef): void {
    switch (load.type) {
      case 'cart': audio.speak(load.max ? 'Here comes Max!' : `${load.label}. Off it goes.`); break;
      case 'goat': audio.bleat(); audio.speak(load.max ? 'Max is charging!' : `${load.label}!`); break;
      case 'quake': audio.rumble(); audio.speak(`${load.label}!`); break;
      case 'rocks': audio.speak(`${load.label} falling!`); break;
      case 'drop': audio.speak(load.max ? 'Max jumps!' : load.label); break;
    }
  }

  private onOutcome(outcome: Outcome): void {
    const sim = this.sim!;
    if (outcome.ok) {
      this.loadsHeld++;
      this.loadStates[this.loadIdx] = 'ok';
      this.hud.setTestBar(this.level.loads.map((l, i) => ({ label: l.label, state: this.loadStates[i] })));
      audio.held();
      this.renderer.confetti(this.loadIdx === this.level.loads.length - 1 ? 140 : 60);
      this.renderer.twinkle(12, 6, 14);
      this.hud.toast(`${this.level.loads[this.loadIdx].label}: it held!`, 'good', 1500);
      this.testStage = 'holdPause';
      this.wait = 1.1;
      return;
    }
    this.outcome = outcome;
    this.loadStates[this.loadIdx] = 'fail';
    this.hud.setTestBar(this.level.loads.map((l, i) => ({ label: l.label, state: this.loadStates[i] })));
    if (outcome.reason === 'snapped') audio.snap(); else audio.crash();
    if (outcome.at) {
      if (outcome.reason === 'snapped') this.renderer.sparks(outcome.at.x, outcome.at.y, 40);
      this.renderer.dust(outcome.at.x, outcome.at.y + 0.3, 12, 1.5);
    }
    this.renderer.shake(outcome.reason === 'snapped' ? 10 : 16);
    this.timeScale = 0.25;
    if (outcome.at) this.focus = { x: outcome.at.x, y: outcome.at.y, k: 1.7, circle: true };
    const why = explain(outcome, this.level);
    this.hud.toast(why, 'bad', 6000);
    audio.speak(why);
    this.testStage = 'fail';
    this.wait = 3.2;
    void sim;
  }

  private finishTest(): void {
    this.phase = 'result';
    this.timeScale = 1;
    const spent = buildCost(this.build);
    const underPar = this.level.budget === 0 || spent <= this.level.par;
    const stars = this.loadsHeld >= this.level.loads.length ? (underPar ? 3 : 2) : this.loadsHeld > 0 ? 1 : 0;
    const key = levelKey(this.mode, this.tier);
    if (stars > (this.save.stars[key] ?? 0)) { this.save.stars[key] = stars; writeSave(this.save); }
    const title = stars === 3 ? 'Engineer!' : stars === 2 ? 'It held!' : stars === 1 ? 'Nearly!' : 'Crash!';
    let sub: string;
    if (stars === 3) sub = this.level.budget ? `Held everything, and under par with ${this.level.par - spent} coin${this.level.par - spent === 1 ? '' : 's'} to spare.` : 'Perfect pivot.';
    else if (stars === 2) sub = `Held everything. Do it with ${this.level.par} coins or fewer for the engineer's star.`;
    else sub = this.outcome ? explain(this.outcome, this.level) : '';
    if (stars >= 2) audio.cheer(); else audio.thud();
    audio.speak(title + '. ' + sub);
    const nextTier = (this.tier + 1) as Tier;
    const nextMode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    const next = this.tier < 3 ? { mode: this.mode, tier: nextTier } : { mode: nextMode, tier: 1 as Tier };
    this.hud.showResult(stars, title, sub, {
      fix: () => this.startLevel(this.mode, this.tier, true),
      menu: () => this.toMenu(),
      next: stars >= 2 ? () => this.startLevel(next.mode, next.tier) : undefined,
    });
  }

  private stepTest(dt: number): void {
    const sim = this.sim!;
    const scaled = dt * this.timeScale;
    this.simAccum += scaled;
    let status: ReturnType<Sim['update']> = { state: 'running' };
    let steps = 0;
    while (this.simAccum >= 1 / 60 && steps < 4) {
      status = sim.update(1 / 60);
      this.simAccum -= 1 / 60;
      steps++;
      if (this.testStage === 'load' && status.state === 'done') break;
    }
    if (this.testStage === 'settle') {
      this.wait -= dt;
      if (sim.firstBreak) { this.onOutcome({ ok: false, reason: 'snapped', link: sim.firstBreak.link, at: { x: (sim.firstBreak.link.a.x + sim.firstBreak.link.b.x) / 2, y: (sim.firstBreak.link.a.y + sim.firstBreak.link.b.y) / 2 } }); return; }
      if (this.wait > 0.85 && this.level.mode !== 'lift') for (const p of this.level.anchors) this.renderer.dust(p[0], p[1], 2, 0.5);
      if (this.wait <= 0) this.beginLoad();
    } else if (this.testStage === 'load') {
      if (status.state === 'done') this.onOutcome(status.outcome);
    } else if (this.testStage === 'holdPause') {
      this.wait -= dt;
      if (this.wait <= 0) {
        sim.clearLoad();
        this.loadIdx++;
        if (this.loadIdx < this.level.loads.length) this.beginLoad();
        else { this.testStage = 'done'; this.finishTest(); }
      }
    } else if (this.testStage === 'fail') {
      this.wait -= dt;
      if (this.wait < 2.2) this.timeScale = 1;
      if (this.wait <= 0) { this.testStage = 'done'; this.finishTest(); }
    }
  }

  // ---- frame ----

  private loop = (): void => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (this.phase === 'testing') this.stepTest(dt);
    if (this.phase !== 'menu') {
      this.renderer.draw({
        level: this.level, build: this.build, sim: this.sim, ghost: this.phase === 'build' ? this.ghost : null,
        hover: this.phase === 'build' ? this.hover : null, tool: this.tool, focus: this.focus, time: this.time,
        loadLabel: null,
      }, dt);
    }
    requestAnimationFrame(this.loop);
  };

  /** Headless checks: place parts and read state without the pointer. */
  debug() {
    return {
      phase: this.phase, mode: this.mode, tier: this.tier, cost: buildCost(this.build), parts: this.build.parts.length, blocks: this.build.blocks.length,
      loadsHeld: this.loadsHeld, outcome: this.outcome?.reason ?? null, stars: { ...this.save.stars },
      place: (kind: ToolKind, ax: number, ay: number, bx: number, by: number) => {
        if (isSegment(kind)) { const r = canPlaceSegment(this.level, this.build, kind, ax, ay, bx, by); if (r.ok) placeSegment(this.build, kind, ax, ay, bx, by); this.afterEdit(); return r; }
        if (isBlock(kind)) { const r = canPlaceBlock(this.level, this.build, kind, ax, ay); if (r.ok) placeBlock(this.build, kind, ax, ay); this.afterEdit(); return r; }
        if (kind === 'pivot') { this.build.pivotX = ax; return { ok: true }; }
        return { ok: false, why: 'no' };
      },
      screen: (x: number, y: number) => this.renderer.toScreen(x, y),
    };
  }
}
