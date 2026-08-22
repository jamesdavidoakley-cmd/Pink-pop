import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/game/tuning';
import { buildScenes } from '../src/game/scenes';
import { capture, createSim, phaseAt, poseAt, step, NO_INPUT } from '../src/game/sim';
import { scoreShot, type ActiveMoment } from '../src/game/scoring';
import { Projector, frameRect } from '../src/render/projection';
import { gradeDay } from '../src/game/grade';
import type { FrameGuest, Moment, SceneResult, Shot } from '../src/game/types';

const scenes = buildScenes();
const ceremony = scenes[0]!;

describe('moment lifecycle', () => {
  it('runs dormant → tell → build → peak → decay → gone', () => {
    expect(phaseAt(-0.1)).toBe('dormant');
    expect(phaseAt(0.5)).toBe('tell');
    expect(phaseAt(2.0)).toBe('build');
    expect(phaseAt(3.6)).toBe('peak');
    expect(phaseAt(4.5)).toBe('decay');
    expect(phaseAt(6.0)).toBe('gone');
  });

  it('shows the tell first and the peak pose at the peak', () => {
    const m = { tellPose: 'shoulderTurn', peakPose: 'laugh' } as Moment;
    expect(poseAt(m, 1.0)?.pose).toBe('shoulderTurn');
    expect(poseAt(m, 3.7)).toEqual({ pose: 'laugh', amount: 1 });
    expect(poseAt(m, 9)).toBeNull();
  });

  it('every scene has must-get beats and enough minor moments to compete with them', () => {
    for (const s of scenes) {
      expect(s.moments.filter((m) => m.mustGet).length).toBeGreaterThanOrEqual(3);
      expect(s.moments.length).toBeGreaterThanOrEqual(8);
      expect(s.moments.length).toBeLessThanOrEqual(14);
      for (const m of s.moments) {
        for (const id of m.subjects) expect(s.guests.some((g) => g.id === id)).toBe(true);
      }
    }
  });
});

describe('the card', () => {
  it('an empty frame scores zero and still costs a frame', () => {
    const sim = createSim(ceremony);
    const before = sim.framesLeft;
    const shot = capture(sim)!;
    expect(shot.score).toBe(0);
    expect(shot.momentId).toBeNull();
    expect(sim.framesLeft).toBe(before - 1);
    expect(shot.critique).toMatch(/no moment/i);
  });

  it('holding the shutter bursts at the tuned rate and runs out', () => {
    const sim = createSim(ceremony);
    const held = { ...NO_INPUT, raised: true, shutter: true };
    for (let i = 0; i < 60 * 10; i++) step(sim, held, 1 / 60);
    expect(sim.framesLeft).toBe(0);
    expect(sim.shots.length).toBe(ceremony.frames);
    // ~5 frames a second: the whole card in about five seconds
    expect(sim.shots[sim.shots.length - 1]!.t).toBeLessThan(ceremony.frames / TUNING.player.burstFps + 1);
  });
});

describe('awareness', () => {
  const nearGuest = () => {
    const sim = createSim(ceremony);
    const g = sim.byId.get('L00')!;
    // stand right in front of a seated guest, in their eyeline
    sim.player.x = g.x;
    sim.player.y = g.y - 1.2;
    return { sim, g };
  };

  it('rises fast when you stand up close in their eyeline', () => {
    const { sim, g } = nearGuest();
    for (let i = 0; i < 60 * 4; i++) step(sim, NO_INPUT, 1 / 60);
    expect(g.awareness).toBeGreaterThan(TUNING.awareness.posedAt);
    expect(g.posed).toBe(true);
  });

  it('is suppressed by crouching', () => {
    const { sim, g } = nearGuest();
    for (let i = 0; i < 60 * 4; i++) step(sim, { ...NO_INPUT, crouched: true }, 1 / 60);
    expect(g.posed).toBe(false);
  });

  it('decays when you back off', () => {
    const { sim, g } = nearGuest();
    for (let i = 0; i < 60 * 4; i++) step(sim, NO_INPUT, 1 / 60);
    // out of their eyeline and away
    sim.player.y = g.y + 5;
    for (let i = 0; i < 60 * 5; i++) step(sim, NO_INPUT, 1 / 60);
    expect(g.awareness).toBeLessThan(0.3);
    expect(g.posed).toBe(false);
  });

  it('spikes for the whole room when you stand in the aisle', () => {
    const sim = createSim(ceremony);
    sim.player.x = 9;
    sim.player.y = 8;
    for (let i = 0; i < 60 * 2; i++) step(sim, { ...NO_INPUT, crouched: true }, 1 / 60);
    expect(sim.forbiddenNow).toBeTruthy();
    expect(sim.guests.filter((g) => g.posed).length).toBeGreaterThan(sim.guests.length / 2);
    expect(sim.rebukes[0]).toMatch(/aisle/i);
  });
});

describe('scoring', () => {
  const subject: FrameGuest = {
    id: 'L00',
    kind: 'guest',
    palette: 'guest',
    x: 8,
    y: 6,
    facing: -Math.PI / 2,
    height: 1.28,
    width: 0.52,
    seated: true,
    pose: 'wipeEye',
    poseAmount: 1,
    posed: false,
    swayPhase: 0,
  };
  const moment: ActiveMoment = { id: 'm', label: 'a tear', phase: 'peak', subjects: ['L00'], value: 1, wide: false };
  const shootFrom = (x: number, y: number, crouched: boolean, guests = [subject]) => {
    const heading = Math.atan2(subject.y - y, subject.x - x);
    return scoreShot(ceremony, { x, y, heading, crouched }, guests, [moment], null);
  };

  it('rewards the low, close, front-on frame over the standing, distant, behind one', () => {
    const good = shootFrom(8, 2.8, true);
    const bad = shootFrom(8, 9.5, false);
    expect(good.score).toBeGreaterThan(60);
    expect(bad.score).toBeLessThan(good.score - 25);
    expect(bad.critique).toMatch(/back of a head|far back/i);
  });

  it('penalises a body in the way', () => {
    const blocker: FrameGuest = { ...subject, id: 'blocker', x: 8, y: 4.4, facing: Math.PI / 2 };
    const clear = shootFrom(8, 2.8, true);
    const blocked = shootFrom(8, 2.8, true, [subject, blocker]);
    expect(blocked.parts.clarity).toBeLessThan(clear.parts.clarity);
    expect(blocked.score).toBeLessThan(clear.score);
  });

  it('scales with the phase of the moment', () => {
    const at = (phase: ActiveMoment['phase']) =>
      scoreShot(ceremony, { x: 8, y: 2.8, heading: Math.PI / 2, crouched: true }, [subject], [{ ...moment, phase }], null).score;
    expect(at('peak')).toBeGreaterThan(at('build'));
    expect(at('build')).toBeGreaterThan(at('decay'));
    expect(at('decay')).toBeGreaterThan(at('tell'));
  });

  it('kills the score when the subject has noticed you', () => {
    const seen = shootFrom(8, 2.8, true, [{ ...subject, posed: true }]);
    const unseen = shootFrom(8, 2.8, true);
    expect(seen.score).toBeCloseTo(unseen.score * TUNING.score.posedPenalty, 5);
    expect(seen.critique).toMatch(/seen/i);
  });

  it('rewards shooting into the light', () => {
    // ceremony light travels west, so face east to shoot into it
    const into = scoreShot(ceremony, { x: 5, y: 6, heading: 0, crouched: true }, [{ ...subject, x: 8, y: 6, facing: Math.PI }], [moment], null);
    const with_ = scoreShot(ceremony, { x: 11, y: 6, heading: Math.PI, crouched: true }, [{ ...subject, x: 8, y: 6, facing: 0 }], [moment], null);
    expect(into.parts.light).toBeGreaterThan(with_.parts.light + 0.5);
  });
});

describe('projection', () => {
  const frame = frameRect(0, 0, 400, 600);
  const proj = new Projector({ x: 0, y: 0, heading: 0, crouched: false }, frame);

  it('puts what you are pointed at in the middle of the frame', () => {
    const b = proj.billboard({ x: 5, y: 0 }, 1.72, 0.52)!;
    expect(b.sx).toBeCloseTo(frame.x + frame.w / 2, 6);
    expect(b.headY).toBeLessThan(proj.horizonY);
    expect(b.feetY).toBeGreaterThan(proj.horizonY);
  });

  it('doubles a subject in size when you halve the distance', () => {
    const far = proj.billboard({ x: 8, y: 0 }, 1.72, 0.52)!;
    const near = proj.billboard({ x: 4, y: 0 }, 1.72, 0.52)!;
    expect(near.feetY - near.headY).toBeCloseTo((far.feetY - far.headY) * 2, 4);
  });

  it('drops what is behind you', () => {
    expect(proj.billboard({ x: -3, y: 0 }, 1.72, 0.52)).toBeNull();
  });
});

describe('the grade', () => {
  const shot = (score: number): Shot =>
    ({ id: 1, sceneId: 'ceremony', t: 0, cam: { x: 0, y: 0, heading: 0, crouched: true }, guests: [], particles: [], momentId: 'm', momentLabel: 'm', phase: 'peak', subjectId: 'x', parts: { moment: 1, framing: 1, clarity: 1, light: 1, angle: 1, layers: 1 }, score, critique: '', posed: false, inForbidden: null }) as Shot;
  const result = (hit: boolean): SceneResult => ({
    sceneId: 'ceremony',
    title: 'Ceremony',
    framesUsed: 12,
    framesTotal: 24,
    keepers: 12,
    beats: [{ id: 'c-rings', label: 'The ring exchange', hit, best: hit ? 80 : 0 }],
  });

  it('costs you fifteen points for a missed must-get, however good the candids were', () => {
    const shots = Array.from({ length: 12 }, () => shot(90));
    const covered = gradeDay(shots, [result(true)]);
    const missed = gradeDay(shots, [result(false)]);
    expect(covered.grade - missed.grade).toBe(TUNING.score.missedBeatPenalty);
    expect(missed.verdict).toMatch(/lesson five/i);
  });

  it('grades on your best frames, not your luckiest one', () => {
    const one = gradeDay([shot(100)], [result(true)]);
    expect(one.grade).toBeLessThan(20);
  });
});
