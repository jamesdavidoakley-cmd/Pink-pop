import { TUNING } from './tuning';
import { buildScenes } from './scenes';
import { createSim, sceneResult, step, type InputState, type Sim } from './sim';
import { drawTopdown, toWorld, topdownTransform } from '../render/topdown';
import { drawViewfinderChrome, renderFrame } from '../render/viewfinder';
import { frameRect, type Rect } from '../render/projection';
import { PALETTE, withAlpha } from '../render/palette';
import type { SceneDef, SceneResult, Shot } from './types';

const W = TUNING.view.width;
const H = TUNING.view.height;
const TOPDOWN: Rect = { x: 0, y: 0, w: Math.round(W * TUNING.view.topdownFrac), h: H };
const VIEWPANEL: Rect = { x: TOPDOWN.w, y: 0, w: W - TOPDOWN.w, h: H };
const VIEWFRAME = frameRect(VIEWPANEL.x + 6, 8, VIEWPANEL.w - 12, VIEWPANEL.h - 16);
const TUTORIAL_HOLD = 6;

export type RunnerPhase = 'playing' | 'interstitial' | 'done';

export interface RunnerSnapshot {
  phase: RunnerPhase;
  sceneIndex: number;
  sceneCount: number;
  scene: SceneDef;
  paused: boolean;
  lastResult: SceneResult | null;
}

export class Runner {
  readonly scenes: SceneDef[];
  sceneIndex = 0;
  sim: Sim;
  phase: RunnerPhase = 'playing';
  paused = false;
  readonly shots: Shot[] = [];
  readonly results: SceneResult[] = [];
  onState: ((s: RunnerSnapshot) => void) | null = null;
  onFinish: ((shots: Shot[], results: SceneResult[]) => void) | null = null;

  private acc = 0;
  private last = 0;
  private raf = 0;
  private time = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private detach: (() => void)[] = [];
  private keys = new Set<string>();
  private crouched = false;
  private aim: { x: number; y: number } | null = null;
  private shutter = false;
  private raised = false;

  constructor() {
    this.scenes = buildScenes();
    this.sim = createSim(this.scenes[0]!);
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // handle for the headless screenshot script
    (window as unknown as { __runner?: Runner }).__runner = this;
    this.ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    this.bind();
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const d of this.detach) d();
    this.detach = [];
  }

  private emit() {
    this.onState?.({
      phase: this.phase,
      sceneIndex: this.sceneIndex,
      sceneCount: this.scenes.length,
      scene: this.sim.scene,
      paused: this.paused,
      lastResult: this.results[this.results.length - 1] ?? null,
    });
  }

  togglePause() {
    if (this.phase !== 'playing') return;
    this.paused = !this.paused;
    this.shutter = false;
    this.emit();
  }

  /** Called from the interstitial card. */
  advance() {
    if (this.phase !== 'interstitial') return;
    this.sceneIndex++;
    if (this.sceneIndex >= this.scenes.length) {
      this.phase = 'done';
      this.emit();
      this.onFinish?.(this.shots, this.results);
      return;
    }
    this.sim = createSim(this.scenes[this.sceneIndex]!, 7 + this.sceneIndex * 31);
    this.phase = 'playing';
    this.keys.clear();
    this.shutter = false;
    this.emit();
  }

  private bind() {
    const canvas = this.canvas!;
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        this.togglePause();
        return;
      }
      if ((k === ' ' || k === 'enter') && this.phase === 'interstitial') {
        e.preventDefault();
        this.advance();
        return;
      }
      if (k === 'c' && !this.keys.has('c')) this.crouched = !this.crouched;
      if (['w', 'a', 's', 'd', 'c', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const onBlur = () => {
      this.keys.clear();
      this.shutter = false;
      this.raised = false;
    };
    const logical = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    const onMove = (e: MouseEvent) => {
      const p = logical(e);
      if (p.x <= TOPDOWN.w) {
        const t = topdownTransform(this.sim.scene, TOPDOWN);
        this.aim = toWorld(t, p.x, p.y);
      }
    };
    const onDown = (e: MouseEvent) => {
      canvas.focus();
      if (e.button === 2) {
        e.preventDefault();
        this.raised = true;
      }
      if (e.button === 0) {
        if (this.phase === 'interstitial') this.advance();
        else this.shutter = true;
      }
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 2) this.raised = false;
      if (e.button === 0) this.shutter = false;
    };
    const onMenu = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('contextmenu', onMenu);
    this.detach.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('contextmenu', onMenu);
    });
  }

  private input(): InputState {
    const k = this.keys;
    const left = k.has('a') || k.has('arrowleft');
    const right = k.has('d') || k.has('arrowright');
    const up = k.has('w') || k.has('arrowup');
    const down = k.has('s') || k.has('arrowdown');
    return {
      moveX: (right ? 1 : 0) - (left ? 1 : 0),
      moveY: (down ? 1 : 0) - (up ? 1 : 0),
      slow: k.has('shift'),
      crouched: this.crouched,
      raised: this.raised,
      shutter: this.shutter,
      aim: this.aim,
    };
  }

  private tick(dt: number) {
    this.time += dt;
    if (this.phase !== 'playing' || this.paused) return;
    const fixed = 1 / 60;
    this.acc = Math.min(this.acc + dt, 0.25);
    const input = this.input();
    while (this.acc >= fixed) {
      step(this.sim, input, fixed);
      this.acc -= fixed;
    }
    if (this.sim.over) {
      this.shots.push(...this.sim.shots);
      this.results.push(sceneResult(this.sim));
      this.phase = 'interstitial';
      this.shutter = false;
      this.emit();
    }
  }

  private tutorialPrompt(): string | null {
    const list = this.sim.scene.tutorial;
    if (!list) return null;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]!;
      if (this.sim.t >= p.at && this.sim.t < p.at + TUTORIAL_HOLD) return p.text;
    }
    return null;
  }

  private render() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, W, H);

    drawTopdown(ctx, this.sim, { panel: TOPDOWN, time: this.time, prompt: this.tutorialPrompt() });

    const p = this.sim.player;
    renderFrame(ctx, {
      scene: this.sim.scene,
      cam: { x: p.x, y: p.y, heading: p.heading, crouched: p.crouched },
      guests: this.sim.guests,
      particles: this.sim.particles,
      frame: VIEWFRAME,
      time: this.time,
      exposure: p.raised ? 1 : 0.42,
    });
    drawViewfinderChrome(ctx, {
      frame: VIEWFRAME,
      framesLeft: this.sim.framesLeft,
      framesTotal: this.sim.scene.frames,
      raised: p.raised,
      flash: this.sim.flash,
    });

    ctx.fillStyle = withAlpha(PALETTE.ink, 0.12);
    ctx.fillRect(TOPDOWN.w - 1, 0, 1, H);

    if (this.sim.framesLeft === 0 && this.phase === 'playing') {
      ctx.textAlign = 'center';
      ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = PALETTE.accent;
      ctx.fillText('CARD FULL', VIEWFRAME.x + VIEWFRAME.w / 2, VIEWFRAME.y + 20);
    }
  }
}

export const LAYOUT = { W, H, TOPDOWN, VIEWPANEL, VIEWFRAME };
