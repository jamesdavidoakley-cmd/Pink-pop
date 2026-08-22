import { TUNING } from './tuning';
import { clamp } from './math';
import type { SceneResult, ScoreParts, Shot } from './types';

export interface MissedBeat { scene: string; label: string }

export interface DayGrade {
  framesUsed: number;
  framesTotal: number;
  keepers: number;
  emptyFrames: number;
  posedFrames: number;
  beatsHit: number;
  beatsTotal: number;
  missed: MissedBeat[];
  topAverage: number;
  grade: number;
  band: string;
  verdict: string;
  weakest: keyof ScoreParts | null;
}

const BANDS: [number, string][] = [
  [82, 'You could shoot this wedding.'],
  [66, 'A real set, with holes in it.'],
  [48, 'Some good frames and thin coverage.'],
  [28, 'You were at a wedding.'],
  [0, 'You photographed the back of a lot of heads.'],
];

/** One day, one grade. Candids do not buy off a missed ring exchange. */
export function gradeDay(shots: Shot[], results: SceneResult[]): DayGrade {
  const S = TUNING.score;
  const withMoment = shots.filter((s) => s.momentId);
  const sorted = [...shots].map((s) => s.score).sort((a, b) => b - a);
  const n = S.gradeTopN;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i] ?? 0;
  const topAverage = sum / n;

  const missed: MissedBeat[] = [];
  let beatsHit = 0;
  let beatsTotal = 0;
  for (const r of results) {
    for (const b of r.beats) {
      beatsTotal++;
      if (b.hit) beatsHit++;
      else missed.push({ scene: r.title, label: b.label });
    }
  }

  const grade = clamp(topAverage - missed.length * S.missedBeatPenalty, 0, 100);

  // where the day was weakest, averaged over frames that had a moment in them
  let weakest: keyof ScoreParts | null = null;
  if (withMoment.length) {
    const keys: (keyof ScoreParts)[] = ['moment', 'framing', 'clarity', 'light', 'angle'];
    let worstDeficit = -1;
    for (const k of keys) {
      const avg = withMoment.reduce((a, s) => a + s.parts[k], 0) / withMoment.length;
      const deficit = TUNING.score.weights[k] * (1 - avg);
      if (deficit > worstDeficit) {
        worstDeficit = deficit;
        weakest = k;
      }
    }
  }

  const emptyFrames = shots.length - withMoment.length;
  const posedFrames = shots.filter((s) => s.posed).length;
  const framesUsed = results.reduce((a, r) => a + r.framesUsed, 0);
  const framesTotal = results.reduce((a, r) => a + r.framesTotal, 0);

  return {
    framesUsed,
    framesTotal,
    keepers: shots.filter((s) => s.score >= S.keeperScore).length,
    emptyFrames,
    posedFrames,
    beatsHit,
    beatsTotal,
    missed,
    topAverage,
    grade,
    band: BANDS.find(([min]) => grade >= min)![1],
    verdict: verdictFor({ missed: missed.length, emptyFrames, posedFrames, shots: shots.length, weakest }),
    weakest,
  };
}

function verdictFor(d: {
  missed: number;
  emptyFrames: number;
  posedFrames: number;
  shots: number;
  weakest: keyof ScoreParts | null;
}): string {
  if (d.missed >= 2) return 'Lesson five. You covered the pretty bits and missed the wedding.';
  if (d.missed === 1) return 'Lesson five. One beat short of a day. The couple will notice that one gap.';
  if (d.shots > 0 && d.emptyFrames / d.shots > 0.28) return 'Lesson one. You are spraying and hoping. Read the tell, then raise the camera.';
  if (d.shots > 0 && d.posedFrames / d.shots > 0.22) return 'Lesson four. They kept seeing you, and everything you shot went stiff.';
  switch (d.weakest) {
    case 'moment':
      return 'Lesson one. You keep arriving as the moment leaves. Move before it happens, not after.';
    case 'clarity':
      return 'Lesson two. You shot through other people all day. Position is the whole job.';
    case 'framing':
      return 'Lesson two. Right room, wrong distance. Walk in, or walk back, before you press.';
    case 'light':
      return 'Lesson two. You kept the light behind you. Get round it and let it do the work.';
    case 'angle':
      return 'Lesson two. Everything is from standing height. Crouch and the day gets its shape.';
    default:
      return 'Anticipated, positioned, invisible, and covered. That is the job.';
  }
}
