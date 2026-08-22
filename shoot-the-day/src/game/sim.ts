import { TUNING } from './tuning';
import { angleDiff, clamp, makeRng, pointInPoly } from './math';
import { activeMoments, scoreShot } from './scoring';
import type { FrameGuest, Guest, Moment, MomentPhase, Pose, SceneDef, SceneResult, Shot } from './types';

export interface InputState {
  moveX: number;
  moveY: number;
  slow: boolean;
  crouched: boolean;
  raised: boolean;
  shutter: boolean;
  /** World point the mouse is over, in the top-down plan. */
  aim: { x: number; y: number } | null;
}

export const NO_INPUT: InputState = { moveX: 0, moveY: 0, slow: false, crouched: false, raised: false, shutter: false, aim: null };

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  tone: string;
  spin: number;
}

export interface PlayerState {
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  crouched: boolean;
  raised: boolean;
  stillTimer: number;
  speedRatio: number;
}

export interface Sim {
  scene: SceneDef;
  t: number;
  framesLeft: number;
  guests: Guest[];
  byId: Map<string, Guest>;
  moments: Moment[];
  particles: Particle[];
  shots: Shot[];
  player: PlayerState;
  /** Counts down after a shutter press; drives the viewfinder blackout. */
  flash: number;
  shutterCooldown: number;
  forbiddenNow: string | null;
  rebukes: string[];
  over: boolean;
  nextShotId: number;
  rng: () => number;
}

const PHASE_EDGES = (() => {
  const m = TUNING.moment;
  const tell = m.tell;
  const build = tell + m.build;
  const peak = build + m.peak;
  const end = peak + m.decay;
  return { tell, build, peak, end };
})();

export function phaseAt(local: number): MomentPhase {
  if (local < 0) return 'dormant';
  if (local < PHASE_EDGES.tell) return 'tell';
  if (local < PHASE_EDGES.build) return 'build';
  if (local < PHASE_EDGES.peak) return 'peak';
  if (local < PHASE_EDGES.end) return 'decay';
  return 'gone';
}

/** Which pose a moment is asking of its subjects, and how hard. */
export function poseAt(m: Moment, local: number): { pose: Pose; amount: number } | null {
  const e = PHASE_EDGES;
  if (local < 0 || local >= e.end) return null;
  if (local < e.tell) return { pose: m.tellPose, amount: clamp(local / TUNING.moment.tell) };
  if (local < e.build) {
    const u = (local - e.tell) / TUNING.moment.build;
    if (u < 0.35) return { pose: m.tellPose, amount: 1 - u / 0.35 };
    return { pose: m.peakPose, amount: clamp((u - 0.35) / 0.65) };
  }
  if (local < e.peak) return { pose: m.peakPose, amount: 1 };
  return { pose: m.peakPose, amount: clamp(1 - (local - e.peak) / TUNING.moment.decay) };
}

export function createSim(scene: SceneDef, seed = 7): Sim {
  const guests = scene.guests.map((g) => ({ ...g }));
  const moments: Moment[] = scene.moments.map((m) => ({
    ...m,
    phase: 'dormant' as MomentPhase,
    elapsed: 0,
    bestScore: 0,
    value: m.mustGet ? TUNING.moment.valueMustGet : TUNING.moment.valueMinor,
  }));
  return {
    scene,
    t: 0,
    framesLeft: scene.frames,
    guests,
    byId: new Map(guests.map((g) => [g.id, g])),
    moments,
    particles: [],
    shots: [],
    player: {
      x: scene.start.x,
      y: scene.start.y,
      heading: scene.start.heading,
      vx: 0,
      vy: 0,
      crouched: false,
      raised: false,
      stillTimer: 0,
      speedRatio: 0,
    },
    flash: 0,
    shutterCooldown: 0,
    forbiddenNow: null,
    rebukes: [],
    over: false,
    nextShotId: 1,
    rng: makeRng(seed),
  };
}

const movesFired = new WeakMap<Moment, { tell: boolean; after: boolean }>();

function fireMoves(sim: Sim, m: Moment, which: 'tell' | 'after') {
  const list = which === 'tell' ? m.moves : m.after;
  if (!list) return;
  for (const mv of list) {
    const g = sim.byId.get(mv.id);
    if (!g) continue;
    g.walkTo = { x: mv.to.x, y: mv.to.y };
    g.walkSpeed = mv.speed ?? 1.1;
    if (mv.face !== undefined) g.facingTo = mv.face;
  }
}

function updateMoments(sim: Sim, dt: number) {
  const desired = new Map<string, { pose: Pose; amount: number }>();
  for (const m of sim.moments) {
    const local = sim.t - m.at;
    const phase = phaseAt(local);
    let flags = movesFired.get(m);
    if (!flags) {
      flags = { tell: false, after: false };
      movesFired.set(m, flags);
    }
    if (phase !== 'dormant' && !flags.tell) {
      flags.tell = true;
      fireMoves(sim, m, 'tell');
    }
    if (phase === 'gone' && !flags.after) {
      flags.after = true;
      fireMoves(sim, m, 'after');
    }
    m.phase = phase;
    m.elapsed = Math.max(0, local);

    const p = poseAt(m, local);
    if (!p) continue;
    for (const id of m.subjects) {
      const prev = desired.get(id);
      if (!prev || p.amount > prev.amount) desired.set(id, p);
    }
  }

  for (const g of sim.guests) {
    const want = desired.get(g.id);
    const restPose: Pose = g.seated ? 'seated' : 'idle';
    const restAmount = g.seated ? 1 : 0;
    let targetPose = want ? want.pose : restPose;
    let targetAmount = want ? want.amount : restAmount;
    if (g.posed) {
      targetPose = 'posed';
      targetAmount = 1;
    }
    if (g.pose !== targetPose && g.poseAmount <= 0.06) g.pose = targetPose;
    const to = g.pose === targetPose ? targetAmount : 0;
    g.poseAmount += clamp((to - g.poseAmount) * dt * 7, -dt * 3, dt * 3);
    g.poseAmount = clamp(g.poseAmount);
  }
}

function updateGuests(sim: Sim, dt: number) {
  for (const g of sim.guests) {
    if (g.walkTo) {
      const dx = g.walkTo.x - g.x;
      const dy = g.walkTo.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.06) {
        g.walkTo = null;
      } else {
        const step = Math.min(d, g.walkSpeed * dt);
        g.x += (dx / d) * step;
        g.y += (dy / d) * step;
        if (g.facingTo === null) g.facingTo = Math.atan2(dy, dx);
      }
    }
    const wantFacing = g.posed
      ? Math.atan2(sim.player.y - g.y, sim.player.x - g.x)
      : g.facingTo !== null
        ? g.facingTo
        : g.baseFacing;
    g.facing += angleDiff(wantFacing, g.facing) * Math.min(1, dt * 4.5);
  }
}

function updateAwareness(sim: Sim, input: InputState, dt: number) {
  const A = TUNING.awareness;
  const p = sim.player;
  const mul = (p.crouched ? A.crouchMul : input.slow ? A.slowMul : 1) * (p.raised ? A.raisedMul : 1);
  const forbidden = sim.forbiddenNow !== null;

  for (const g of sim.guests) {
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    // a guest who has turned to the lens is still *attending* to the wedding:
    // judge the eyeline by where they would naturally be looking, so backing
    // off out of that eyeline lets them forget you again
    const attention = g.posed ? (g.facingTo ?? g.baseFacing) : g.facing;
    const inCone = Math.abs(angleDiff(toPlayer, attention)) < A.facingCone / 2;

    let rise = 0;
    if (inCone) {
      if (d < A.nearRadius) rise += A.nearRise * (1 - d / A.nearRadius);
      if (d < A.eyelineRadius && p.stillTimer > A.stillSeconds) rise += A.stillRise * (1 - d / A.eyelineRadius);
      if (d < A.motionRadius && p.speedRatio > 0.55) rise += A.motionRise * (1 - d / A.motionRadius) * p.speedRatio;
    }
    rise *= mul;
    if (forbidden) rise += A.forbiddenRise;

    g.awareness = clamp(g.awareness + (rise > 0 ? rise : -A.decay) * dt);
    if (g.posed) {
      if (g.awareness < A.posedAt - 0.12) g.posed = false;
    } else if (g.awareness > A.posedAt) {
      g.posed = true;
    }
  }
}

function updatePlayer(sim: Sim, input: InputState, dt: number) {
  const P = TUNING.player;
  const p = sim.player;
  p.crouched = input.crouched;
  p.raised = input.raised;

  let speed = p.crouched ? P.speedCrouch : input.slow ? P.speedSlow : P.speedWalk;
  if (p.raised) speed *= P.raisedMul;

  let mx = input.moveX;
  let my = input.moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const tvx = mx * speed;
  const tvy = my * speed;
  const k = Math.min(1, P.accel * dt);
  p.vx += (tvx - p.vx) * k;
  p.vy += (tvy - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const b = sim.scene.bounds;
  p.x = clamp(p.x, b.x0, b.x1);
  p.y = clamp(p.y, b.y0, b.y1);

  // don't walk through people
  for (const g of sim.guests) {
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d = Math.hypot(dx, dy);
    const min = P.radius + g.width * 0.55;
    if (d > 0.0001 && d < min) {
      p.x = g.x + (dx / d) * min;
      p.y = g.y + (dy / d) * min;
    }
  }

  // furniture is furniture: you go round the seating, you don't wade through it
  for (const f of sim.scene.furniture) {
    if (f.shape === 'lamp' || f.shape === 'arch') continue;
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    if (f.shape === 'roundTable') {
      const r = f.w / 2 + P.radius;
      const d = Math.hypot(dx, dy);
      if (d < r && d > 0.0001) {
        p.x = f.x + (dx / d) * r;
        p.y = f.y + (dy / d) * r;
      }
      continue;
    }
    const hw = f.w / 2 + P.radius;
    const hd = f.d / 2 + P.radius;
    if (Math.abs(dx) < hw && Math.abs(dy) < hd) {
      if (hw - Math.abs(dx) < hd - Math.abs(dy)) p.x = f.x + (dx < 0 ? -hw : hw);
      else p.y = f.y + (dy < 0 ? -hd : hd);
    }
  }

  const sp = Math.hypot(p.vx, p.vy);
  p.speedRatio = clamp(sp / P.speedWalk);
  p.stillTimer = sp < 0.25 ? p.stillTimer + dt : 0;

  if (input.aim) {
    const want = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
    p.heading += angleDiff(want, p.heading) * Math.min(1, dt * 22);
  }

  sim.forbiddenNow = null;
  for (const z of sim.scene.forbidden) {
    if (pointInPoly(p, z.poly)) {
      sim.forbiddenNow = z.rebuke;
      if (!sim.rebukes.includes(z.rebuke)) sim.rebukes.push(z.rebuke);
      break;
    }
  }
}

const CONFETTI_TONES = ['#f4efe4', '#e7c8b4', '#c4614e', '#d8c48f', '#efe7da'];

function updateParticles(sim: Sim, dt: number) {
  const c = sim.scene.confetti;
  if (c && sim.t >= c.from && sim.t <= c.to && sim.particles.length < 300) {
    const bride = sim.byId.get('bride');
    const groom = sim.byId.get('groom');
    const cx = bride && groom ? (bride.x + groom.x) / 2 : c.at.x;
    const cy = bride && groom ? (bride.y + groom.y) / 2 : c.at.y;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const r = sim.rng();
      const a = sim.rng() * Math.PI * 2;
      const rad = c.spread * Math.sqrt(sim.rng());
      sim.particles.push({
        x: cx + Math.cos(a) * rad,
        y: cy + Math.sin(a) * rad * 1.3,
        z: 2.9 + r * 1.4,
        vx: (sim.rng() - 0.5) * 0.5,
        vy: (sim.rng() - 0.5) * 0.5,
        vz: -0.2 - sim.rng() * 0.5,
        r: 0.035 + sim.rng() * 0.03,
        tone: CONFETTI_TONES[Math.floor(sim.rng() * CONFETTI_TONES.length)]!,
        spin: sim.rng() * Math.PI,
      });
    }
  }
  for (let i = sim.particles.length - 1; i >= 0; i--) {
    const p = sim.particles[i]!;
    p.vz -= TUNING.render.confettiGravity * dt * 0.35;
    p.spin += dt * 3;
    p.x += (p.vx + Math.sin(p.spin) * 0.35) * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.z <= 0.02) sim.particles.splice(i, 1);
  }
}

export function snapshotGuest(g: Guest): FrameGuest {
  return {
    id: g.id,
    kind: g.kind,
    palette: g.palette,
    x: g.x,
    y: g.y,
    facing: g.facing,
    height: g.height,
    width: g.width,
    seated: g.seated,
    pose: g.pose,
    poseAmount: g.poseAmount,
    posed: g.posed,
    swayPhase: g.swayPhase,
  };
}

/** Fire the shutter. Costs a frame whether or not there was anything there. */
export function capture(sim: Sim): Shot | null {
  if (sim.framesLeft <= 0) return null;
  const p = sim.player;
  const cam = { x: p.x, y: p.y, heading: p.heading, crouched: p.crouched };
  const guests = sim.guests.map(snapshotGuest);
  const res = scoreShot(sim.scene, cam, guests, activeMoments(sim.moments), sim.forbiddenNow);
  const shot: Shot = {
    id: sim.nextShotId++,
    sceneId: sim.scene.id,
    t: sim.t,
    cam,
    guests,
    particles: sim.particles.map((q) => ({ x: q.x, y: q.y, z: q.z, r: q.r, tone: q.tone })),
    momentId: res.momentId,
    momentLabel: res.momentLabel,
    phase: res.phase,
    subjectId: res.subjectId,
    parts: res.parts,
    score: res.score,
    critique: res.critique,
    posed: res.posed,
    inForbidden: sim.forbiddenNow,
  };
  sim.shots.push(shot);
  sim.framesLeft--;
  sim.flash = 0.09;
  if (res.momentId) {
    const m = sim.moments.find((x) => x.id === res.momentId);
    if (m) m.bestScore = Math.max(m.bestScore, res.score);
  }
  return shot;
}

/** One fixed tick. */
export function step(sim: Sim, input: InputState, dt: number) {
  if (sim.over) return;
  updatePlayer(sim, input, dt);
  updateMoments(sim, dt);
  updateGuests(sim, dt);
  updateAwareness(sim, input, dt);
  updateParticles(sim, dt);

  sim.shutterCooldown = Math.max(0, sim.shutterCooldown - dt);
  sim.flash = Math.max(0, sim.flash - dt);
  if (input.shutter && input.raised && sim.shutterCooldown <= 0 && sim.framesLeft > 0) {
    capture(sim);
    sim.shutterCooldown = 1 / TUNING.player.burstFps;
  }

  sim.t += dt;
  if (sim.t >= sim.scene.duration) {
    sim.t = sim.scene.duration;
    sim.over = true;
  }
}

export function sceneResult(sim: Sim): SceneResult {
  const beats = sim.moments
    .filter((m) => m.mustGet)
    .map((m) => ({ id: m.id, label: m.label, hit: m.bestScore >= TUNING.score.beatHitScore, best: m.bestScore }));
  return {
    sceneId: sim.scene.id,
    title: sim.scene.title,
    framesUsed: sim.shots.length,
    framesTotal: sim.scene.frames,
    keepers: sim.shots.filter((s) => s.score >= TUNING.score.keeperScore).length,
    beats,
  };
}
