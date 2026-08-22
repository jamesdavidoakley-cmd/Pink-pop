import { createSim, sceneResult, step, type InputState, type Sim } from '../src/game/sim';
import { buildScenes } from '../src/game/scenes';
import { angleDiff, clamp, pointInPoly } from '../src/game/math';
import { TUNING } from '../src/game/tuning';
import { lightDirAt } from '../src/game/scoring';
import type { Guest, MomentDef, SceneDef, SceneResult, Shot } from '../src/game/types';

const DT = 1 / 60;

export type Bot = (sim: Sim) => InputState;

export function playScene(scene: SceneDef, bot: Bot): { sim: Sim; result: SceneResult } {
  const sim = createSim(scene);
  while (!sim.over) step(sim, bot(sim), DT);
  return { sim, result: sceneResult(sim) };
}

export function playDay(makeBot: (scene: SceneDef) => Bot): { shots: Shot[]; results: SceneResult[] } {
  const shots: Shot[] = [];
  const results: SceneResult[] = [];
  for (const scene of buildScenes()) {
    const { sim, result } = playScene(scene, makeBot(scene));
    shots.push(...sim.shots);
    results.push(result);
  }
  return { shots, results };
}

const IDLE: InputState = { moveX: 0, moveY: 0, slow: false, crouched: false, raised: false, shutter: false, aim: null };

/** Distance that puts a body of this height at a good size in the frame. */
function standoff(height: number, wanted = 0.35): number {
  const focal = 1 / (2 * Math.tan(TUNING.camera.fovH / 2));
  return Math.max(3.2, (height * focal * TUNING.camera.frameAspect) / wanted);
}

function blocked(scene: SceneDef, guests: Guest[], x: number, y: number): boolean {
  const b = scene.bounds;
  if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return true;
  for (const z of scene.forbidden) if (pointInPoly({ x, y }, z.poly)) return true;
  for (const g of guests) if (Math.hypot(g.x - x, g.y - y) < 0.8) return true;
  for (const f of scene.furniture) {
    if (f.shape === 'chair' || f.shape === 'lamp') continue;
    if (Math.abs(f.x - x) < f.w / 2 + 0.45 && Math.abs(f.y - y) < f.d / 2 + 0.45) return true;
  }
  return false;
}

/** How good this stand-point looks before the shutter: face, light, clear line. */
function predict(scene: SceneDef, guests: Guest[], subject: Guest, cx: number, cy: number): number {
  const dx = subject.x - cx;
  const dy = subject.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  const heading = Math.atan2(dy, dx);
  const facing = Math.cos(angleDiff(subject.facing, Math.atan2(cy - subject.y, cx - subject.x)));
  const ld = lightDirAt(scene, subject.x, subject.y);
  const light = (1 - (Math.cos(heading) * ld.x + Math.sin(heading) * ld.y)) / 2;

  let occluders = 0;
  let clear = 9;
  for (const g of guests) {
    if (g.id === subject.id) continue;
    const t = ((g.x - cx) * dx + (g.y - cy) * dy) / (len * len);
    const perp = Math.hypot(g.x - (cx + dx * t), g.y - (cy + dy * t));
    if (t > 0.06 && t < 0.94 && perp < 0.55) occluders++;
    clear = Math.min(clear, Math.hypot(g.x - cx, g.y - cy));
  }
  return (
    0.42 * clamp((facing + 1) / 2 + 0.08) +
    0.22 * clamp(light) +
    0.26 * (occluders === 0 ? 1 : 0) +
    0.1 * clamp(clear / 1.6)
  );
}

/** Where to stand: seeing the face, into the light, with a clear line. */
export function positionFor(scene: SceneDef, guests: Guest[], subject: Guest, wide = false, group = false): { x: number; y: number } {
  const base = wide ? 9.5 : standoff(subject.height, group ? 0.42 : 0.35);
  let best: { x: number; y: number; v: number } | null = null;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    for (const scale of wide ? [1, 0.82, 1.15] : [1, 0.85, 1.2, 1.45]) {
      const x = subject.x + Math.cos(a) * base * scale;
      const y = subject.y + Math.sin(a) * base * scale;
      if (blocked(scene, guests, x, y)) continue;
      let v = predict(scene, guests, subject, x, y);
      if (wide) {
        let inCone = 0;
        const heading = Math.atan2(subject.y - y, subject.x - x);
        for (const g of guests) {
          if (Math.abs(angleDiff(Math.atan2(g.y - y, g.x - x), heading)) < TUNING.camera.fovH / 2) inCone++;
        }
        v += Math.min(1, inCone / TUNING.score.wideBodies) * 0.5;
      }
      if (!best || v > best.v) best = { x, y, v };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: subject.x, y: subject.y + base };
}

/** Two people in one moment are one subject: frame the pair, from the front. */
function groupSubject(sim: Sim, ids: string[]): Guest {
  const gs = ids.map((id) => sim.byId.get(id)!).filter(Boolean);
  const first = gs[0]!;
  if (gs.length === 1) return first;
  const cx = gs.reduce((a, g) => a + g.x, 0) / gs.length;
  const cy = gs.reduce((a, g) => a + g.y, 0) / gs.length;
  let fx = 0;
  let fy = 0;
  for (const g of gs) {
    fx += Math.cos(g.facing);
    fy += Math.sin(g.facing);
  }
  let facing = Math.atan2(fy, fx);
  if (Math.hypot(fx, fy) / gs.length < 0.35) {
    // facing each other: the photograph is from the open side of their axis
    const ax = Math.atan2(gs[1]!.y - first.y, gs[1]!.x - first.x);
    const a = ax + Math.PI / 2;
    const away = Math.hypot(cx + Math.cos(a) * 2 - 9, cy + Math.sin(a) * 2 - 8);
    const back = Math.hypot(cx - Math.cos(a) * 2 - 9, cy - Math.sin(a) * 2 - 8);
    facing = away < back ? a : a + Math.PI;
  }
  const spread = Math.max(...gs.map((g) => Math.hypot(g.x - cx, g.y - cy)));
  return { ...first, x: cx, y: cy, facing, height: Math.max(...gs.map((g) => g.height)) + spread * 0.6 };
}

/**
 * A coarse walkable grid and a breadth-first field towards the target.
 * A photographer knows the room; this is the bot's version of that.
 */
class Nav {
  private readonly cell = 0.45;
  private readonly w: number;
  private readonly h: number;
  private free: Uint8Array;
  private field: Float32Array | null = null;
  private goalKey = '';
  private builtAt = -99;

  constructor(private readonly scene: SceneDef, private readonly avoidForbidden = true) {
    const b = scene.bounds;
    this.w = Math.ceil((b.x1 - b.x0) / this.cell) + 1;
    this.h = Math.ceil((b.y1 - b.y0) / this.cell) + 1;
    this.free = new Uint8Array(this.w * this.h);
  }

  private cx(x: number) {
    return Math.round((x - this.scene.bounds.x0) / this.cell);
  }
  private cy(y: number) {
    return Math.round((y - this.scene.bounds.y0) / this.cell);
  }
  private wx(i: number) {
    return this.scene.bounds.x0 + i * this.cell;
  }
  private wy(j: number) {
    return this.scene.bounds.y0 + j * this.cell;
  }

  private mark(guests: Guest[]) {
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.wx(i);
        const y = this.wy(j);
        let ok = true;
        if (this.avoidForbidden) for (const z of this.scene.forbidden) if (pointInPoly({ x, y }, z.poly)) ok = false;
        if (ok) {
          for (const g of guests) {
            if (Math.abs(g.x - x) < 0.62 && Math.abs(g.y - y) < 0.62) {
              ok = false;
              break;
            }
          }
        }
        if (ok) {
          for (const f of this.scene.furniture) {
            if (f.shape === 'lamp' || f.shape === 'arch') continue;
            if (Math.abs(f.x - x) < f.w / 2 + 0.25 && Math.abs(f.y - y) < f.d / 2 + 0.25) {
              ok = false;
              break;
            }
          }
        }
        this.free[j * this.w + i] = ok ? 1 : 0;
      }
    }
  }

  private build(guests: Guest[], gx: number, gy: number) {
    this.mark(guests);
    const field = new Float32Array(this.w * this.h).fill(Infinity);
    const gi = Math.max(0, Math.min(this.w - 1, this.cx(gx)));
    const gj = Math.max(0, Math.min(this.h - 1, this.cy(gy)));
    const queue: number[] = [gj * this.w + gi];
    field[gj * this.w + gi] = 0;
    for (let head = 0; head < queue.length; head++) {
      const idx = queue[head]!;
      const i = idx % this.w;
      const j = (idx - i) / this.w;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
          const n = nj * this.w + ni;
          if (!this.free[n]) continue;
          const cost = field[idx]! + (di && dj ? 1.414 : 1);
          if (cost < field[n]!) {
            field[n] = cost;
            queue.push(n);
          }
        }
      }
    }
    this.field = field;
  }

  /** The direction to walk from here, following the field downhill. */
  step(sim: Sim, gx: number, gy: number): { moveX: number; moveY: number } {
    const key = `${this.cx(gx)},${this.cy(gy)}`;
    if (key !== this.goalKey || sim.t - this.builtAt > 1) {
      this.goalKey = key;
      this.builtAt = sim.t;
      this.build(sim.guests, gx, gy);
    }
    const field = this.field!;
    const p = sim.player;
    const pi = this.cx(p.x);
    const pj = this.cy(p.y);
    let best: { i: number; j: number; v: number } | null = null;
    for (let r = 1; r <= 3 && !best; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const i = pi + di;
          const j = pj + dj;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const v = field[j * this.w + i]!;
          if (!isFinite(v)) continue;
          const bias = v + Math.hypot(di, dj) * 0.35;
          if (!best || bias < best.v) best = { i, j, v: bias };
        }
      }
    }
    if (!best) {
      const dx = gx - p.x;
      const dy = gy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      return { moveX: dx / d, moveY: dy / d };
    }
    let dx = this.wx(best.i) - p.x;
    let dy = this.wy(best.j) - p.y;
    if (Math.hypot(dx, dy) < 0.12) {
      dx = gx - p.x;
      dy = gy - p.y;
    }
    const d = Math.hypot(dx, dy) || 1;
    return { moveX: dx / d, moveY: dy / d };
  }
}

/**
 * Marches to the front, stands at full height, and sprays: short bursts all
 * day, pointed at whoever is most obviously important.
 */
export function sprayer(scene: SceneDef): Bot {
  const target = { x: scene.id === 'speeches' ? 9 : 9.05, y: scene.id === 'confetti' ? 6.5 : 5.0 };
  const nav = new Nav(scene, false);
  return (sim) => {
    const p = sim.player;
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    const move = d > 0.25 ? nav.step(sim, target.x, target.y) : { moveX: 0, moveY: 0 };
    const aim = sim.byId.get('bestman') ?? sim.byId.get('bride') ?? sim.guests[0]!;
    return {
      ...IDLE,
      ...move,
      raised: true,
      shutter: sim.t % 9 < 0.55,
      aim: { x: aim.x, y: aim.y },
    };
  };
}

/**
 * Crouches, moves early, waits for the peak, takes a few frames.
 * It only ever chases the must-get beats: this is a floor on competent play,
 * not a ceiling.
 */
export function reportage(scene: SceneDef): Bot {
  const plan = scene.moments.filter((m) => m.mustGet);
  const window = TUNING.moment.tell + TUNING.moment.build + TUNING.moment.peak;
  // start walking towards a beat as soon as the previous one is done
  const opens = plan.map((m, i) => (i === 0 ? 0 : (plan[i - 1]!.at + window)));
  const nav = new Nav(scene);
  return (sim) => {
    const now = sim.t;
    let current: MomentDef | null = null;
    for (let i = 0; i < plan.length; i++) {
      const m = plan[i]!;
      if (now < opens[i]! || now > m.at + window) continue;
      current = m;
      break;
    }
    if (!current) return { ...IDLE, crouched: true };

    const subject = groupSubject(sim, current.subjects);
    const others = sim.guests.filter((g) => !current!.subjects.includes(g.id));
    const spot = positionFor(scene, others, subject, !!current.wide, current.subjects.length > 1);

    // hang back until the tell, then close in: standing over someone for
    // twenty seconds is how you get noticed
    const early = now < current.at - 7;
    const bx = spot.x - subject.x;
    const by = spot.y - subject.y;
    const bl = Math.hypot(bx, by) || 1;
    const target = early ? { x: spot.x + (bx / bl) * 2.4, y: spot.y + (by / bl) * 2.4 } : spot;

    const p = sim.player;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy);
    const local = now - current.at;
    const peakStart = TUNING.moment.tell + TUNING.moment.build;
    const inPeak = local >= peakStart - 0.1 && local <= peakStart + TUNING.moment.peak;
    const lateBuild = local >= peakStart - 0.5 && local < peakStart - 0.1;
    const settled = d < 1.6;
    const move = d > 0.35 ? nav.step(sim, target.x, target.y) : { moveX: 0, moveY: 0 };

    return {
      ...IDLE,
      ...move,
      crouched: true,
      slow: true,
      raised: local > -2.5,
      // take the moment from wherever you got to, and a couple on the way in
      shutter: inPeak || (settled && lateBuild),
      aim: { x: subject.x, y: subject.y },
    };
  };
}
