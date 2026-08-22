import { TUNING } from './tuning';
import { angleDiff, clamp } from './math';
import { Projector, frameRect, type Billboard, type CamState } from '../render/projection';
import type { FrameGuest, Moment, MomentPhase, SceneDef, ScoreParts } from './types';

/** A frame of the canonical aspect. Only its shape matters to the scorer. */
const SCORE_FRAME = frameRect(0, 0, 400, 400 / TUNING.camera.frameAspect);

export interface ScoredEntity {
  g: FrameGuest;
  b: Billboard;
  /** 1 = looking into the lens, -1 = the back of a head. */
  facingness: number;
  hFrac: number;
}

export interface ShotResult {
  parts: ScoreParts;
  score: number;
  momentId: string | null;
  momentLabel: string | null;
  phase: MomentPhase | null;
  subjectId: string | null;
  posed: boolean;
  critique: string;
}

export function facingnessOf(g: FrameGuest, cam: { x: number; y: number }): number {
  const toCam = Math.atan2(cam.y - g.y, cam.x - g.x);
  return Math.cos(angleDiff(g.facing, toCam));
}

/** Everything the lens can actually see, nearest last. */
export function visibleEntities(proj: Projector, guests: FrameGuest[], cam: CamState): ScoredEntity[] {
  const out: ScoredEntity[] = [];
  for (const g of guests) {
    const b = proj.billboard(g, g.height, g.width);
    if (!b || !proj.onScreen(b)) continue;
    if (b.feetY < proj.frame.y || b.headY > proj.frame.y + proj.frame.h) continue;
    out.push({ g, b, facingness: facingnessOf(g, cam), hFrac: (b.feetY - b.headY) / proj.frame.h });
  }
  out.sort((a, b) => b.b.fwd - a.b.fwd);
  return out;
}

function overlapFraction(subject: Billboard, other: Billboard): number {
  const sx0 = subject.sx - subject.halfW * 0.85;
  const sx1 = subject.sx + subject.halfW * 0.85;
  const ox0 = other.sx - other.halfW * 0.85;
  const ox1 = other.sx + other.halfW * 0.85;
  const w = Math.min(sx1, ox1) - Math.max(sx0, ox0);
  if (w <= 0) return 0;
  const h = Math.min(subject.feetY, other.feetY) - Math.max(subject.headY, other.headY);
  if (h <= 0) return 0;
  const area = (sx1 - sx0) * (subject.feetY - subject.headY);
  return area > 0 ? clamp((w * h) / area) : 0;
}

/** Direction the light travels at a point in the room. */
export function lightDirAt(scene: SceneDef, x: number, y: number): { x: number; y: number } {
  if (scene.lightDir) return scene.lightDir;
  if (scene.lightPoint) {
    const dx = x - scene.lightPoint.x;
    const dy = y - scene.lightPoint.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }
  return { x: 0, y: 1 };
}

export interface ActiveMoment {
  id: string;
  label: string;
  phase: MomentPhase;
  subjects: string[];
  value: number;
  wide: boolean;
}

export function activeMoments(moments: Moment[]): ActiveMoment[] {
  return moments
    .filter((m) => m.phase !== 'dormant' && m.phase !== 'gone')
    .map((m) => ({ id: m.id, label: m.label, phase: m.phase, subjects: m.subjects, value: m.value, wide: !!m.wide }));
}

const S = TUNING.score;

function sizeScore(hFrac: number): number {
  const [lo, hi] = S.sizeIdeal;
  if (hFrac >= lo && hFrac <= hi) return 1;
  const d = hFrac < lo ? lo - hFrac : hFrac - hi;
  return clamp(1 - d / S.sizeFalloff);
}

function placementScore(proj: Projector, b: Billboard): number {
  const nx = (b.sx - proj.cx) / (proj.frame.w / 2);
  const a = Math.abs(nx);
  let p = a <= S.placementSweet ? 1 : clamp(1 - (a - S.placementSweet) / (1.15 - S.placementSweet));
  const left = proj.frame.x;
  const right = proj.frame.x + proj.frame.w;
  if (b.sx - b.halfW < left || b.sx + b.halfW > right) p *= 0.45;
  if (b.headY < proj.frame.y) p *= 0.5;
  return clamp(p);
}

/**
 * Score one press of the shutter, 0-100. Every term maps to one of the five
 * lessons: is it a moment, is it framed, is it clean, is it lit, is it seen
 * from the right height, does it have depth.
 */
export function scoreShot(
  scene: SceneDef,
  cam: CamState,
  guests: FrameGuest[],
  moments: ActiveMoment[],
  inForbidden: string | null,
): ShotResult {
  const proj = new Projector(cam, SCORE_FRAME);
  const vis = visibleEntities(proj, guests, cam);
  const byId = new Map(vis.map((v) => [v.g.id, v]));

  const empty: ShotResult = {
    parts: { moment: 0, framing: 0, clarity: 0, light: 0, angle: 0, layers: 0 },
    score: 0,
    momentId: null,
    momentLabel: null,
    phase: null,
    subjectId: null,
    posed: false,
    critique: 'Clean frame, no moment in it. A frame off the card for nothing.',
  };

  // Which moment is really in this frame, and which body carries it?
  let best: { m: ActiveMoment; e: ScoredEntity; rank: number } | null = null;
  for (const m of moments) {
    for (const id of m.subjects) {
      const e = byId.get(id);
      if (!e) continue;
      const mult = TUNING.moment.mult[m.phase];
      const rank = m.value * mult * (0.35 + 0.65 * clamp((e.facingness + 0.35) / 1.35)) * (0.4 + 0.6 * sizeScore(e.hFrac));
      if (!best || rank > best.rank) best = { m, e, rank };
    }
  }
  if (!best || TUNING.moment.mult[best.m.phase] <= 0) {
    return { ...empty, critique: inForbidden ?? empty.critique };
  }

  const { m, e } = best;
  const subject = e.b;

  // 1. is there a real moment in frame, and are we on the right side of it
  const facing01 = clamp((e.facingness + 0.35) / 1.35);
  const facingTerm = 0.28 + 0.72 * facing01;
  let momentValue = m.value * facingTerm;
  let wideFail = false;
  if (m.wide) {
    const bodies = clamp(vis.length / S.wideBodies);
    const small = e.hFrac <= S.wideSubjectMax ? 1 : clamp(1 - (e.hFrac - S.wideSubjectMax) * 2.4);
    momentValue *= 0.35 + 0.65 * bodies * small;
    wideFail = bodies * small < 0.55;
  }
  momentValue = clamp(momentValue);

  // 2. framing
  const size = sizeScore(e.hFrac);
  const place = placementScore(proj, subject);
  const framing = clamp(0.62 * size + 0.38 * place);

  // 3. clarity: anything nearer than the subject, across the subject
  let occl = 0;
  for (const other of vis) {
    if (other.g.id === e.g.id) continue;
    if (other.b.fwd >= subject.fwd * 0.98) continue;
    occl += overlapFraction(subject, other.b);
  }
  const clarity = clamp(1 - occl * S.occlusionBite);

  // 4. light: shooting into it shapes people, shooting with it flattens them
  const ld = lightDirAt(scene, e.g.x, e.g.y);
  const dot = Math.cos(cam.heading) * ld.x + Math.sin(cam.heading) * ld.y;
  const light = clamp(S.lightFloor + (1 - S.lightFloor) * ((1 - dot) / 2));

  // 5. angle: how far below their eyeline you got
  const camEye = cam.crouched ? TUNING.camera.eyeCrouched : TUNING.camera.eyeStanding;
  const subjEye = e.g.height * 0.92;
  const angle = clamp(S.angleBase + (subjEye - camEye) * S.angleGain);

  // 6. layers: a foreground body that frames rather than blocks
  let layers = 0;
  for (const other of vis) {
    if (other.g.id === e.g.id) continue;
    const ratio = other.b.fwd / subject.fwd;
    if (ratio < S.layerBand[0] || ratio > S.layerBand[1]) continue;
    layers = Math.max(layers, 1 - overlapFraction(subject, other.b) * 1.6);
  }
  layers = clamp(layers);

  const parts: ScoreParts = { moment: momentValue, framing, clarity, light, angle, layers };
  const w = S.weights;
  const sum =
    w.moment * parts.moment +
    w.framing * parts.framing +
    w.clarity * parts.clarity +
    w.light * parts.light +
    w.angle * parts.angle +
    w.layers * parts.layers;

  const posed = m.subjects.some((id) => byId.get(id)?.g.posed);
  const phaseMul = TUNING.moment.mult[m.phase];
  const score = clamp(100 * phaseMul * (posed ? S.posedPenalty : 1) * sum, 0, 100);

  return {
    parts,
    score,
    momentId: m.id,
    momentLabel: m.label,
    phase: m.phase,
    subjectId: e.g.id,
    posed,
    critique: critiqueFor({ parts, score, phase: m.phase, posed, e, wideFail, inForbidden, scene, wide: m.wide }),
  };
}

interface CritiqueInput {
  parts: ScoreParts;
  score: number;
  phase: MomentPhase;
  posed: boolean;
  e: ScoredEntity;
  wideFail: boolean;
  wide: boolean;
  inForbidden: string | null;
  scene: SceneDef;
}

/** One plain-English line, from whichever thing went most wrong. */
function critiqueFor(c: CritiqueInput): string {
  if (c.inForbidden) return c.inForbidden;
  if (c.posed) return 'You were seen. They are looking at the lens and the moment died in front of you.';
  if (c.phase === 'tell') return 'Half a second early. You shot the tell, not the thing it was telling you about.';
  if (c.phase === 'decay') return 'Half a second late. The laugh had already gone.';

  const w = TUNING.score.weights;
  const deficits: [keyof ScoreParts, number][] = [
    ['moment', w.moment * (1 - c.parts.moment)],
    ['framing', w.framing * (1 - c.parts.framing)],
    ['clarity', w.clarity * (1 - c.parts.clarity)],
    ['light', w.light * (1 - c.parts.light)],
    ['angle', w.angle * (1 - c.parts.angle)],
    ['layers', w.layers * (1 - c.parts.layers)],
  ];
  deficits.sort((a, b) => b[1] - a[1]);
  const worst = deficits[0]![0];

  if (c.score >= 82 && deficits[0]![1] < 0.06) return 'Anticipated, moved, waited. That is the frame.';

  // a frame that works, with one thing left on the table
  if (c.score >= 70) {
    switch (worst) {
      case 'moment':
        return c.e.facingness < 0.3
          ? 'A keeper, but you are a little behind them. A step round and you would have the face.'
          : 'A keeper. You have the edge of the moment rather than the middle of it.';
      case 'framing':
        return c.e.hFrac < TUNING.score.sizeIdeal[0] ? 'A keeper, shot loose. Two steps closer next time.' : 'A keeper, framed tight. Give them a little room.';
      case 'clarity':
        return 'A keeper, with somebody clipping the edge of your subject.';
      case 'light':
        return 'A keeper. Get round to the other side and the light would do half the work.';
      case 'angle':
        return 'A keeper, shot a fraction high. Lower still.';
      default:
        return 'A keeper. Nothing in the foreground, so it sits a little flat.';
    }
  }

  switch (worst) {
    case 'moment':
      if (c.wide && c.wideFail) return 'The beat was the room. You filled the frame with one person and lost it.';
      if (c.e.facingness < 0.15) return 'Right moment, wrong side. The back of a head is not a guest.';
      return 'Something happened, but not really to anyone in this frame.';
    case 'framing':
      if (c.e.hFrac < TUNING.score.sizeIdeal[0]) return 'Too far back. They are a smudge in a lot of empty room.';
      if (c.e.hFrac > TUNING.score.sizeIdeal[1]) return 'Cut into them. Half a head is not a portrait.';
      return 'Jammed against the edge of the frame with the room falling out of it.';
    case 'clarity':
      return 'Someone else’s head is across your subject. One metre sideways and the line is clean.';
    case 'light':
      return 'You shot with the light behind you. Flat, grey, and no shape on anyone.';
    case 'angle':
      if (c.e.g.kind === 'child') return 'Stood up. You shot a five year old from adult eye level.';
      if (c.e.g.seated) return 'They are sitting and you are standing. Get down to them.';
      return 'Shot from standing height. Crouch and the frame finds its shape.';
    default:
      return 'Clean enough, but flat. Nothing in the foreground to give it depth.';
  }
}
