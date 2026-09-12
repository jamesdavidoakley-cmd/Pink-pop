import { describe, expect, it } from 'vitest';
import { Sim, type Outcome } from '../src/sim';
import { makeLevel, type LevelDef } from '../src/levels';
import { emptyBuild, placeSegment, placeBlock, type Build } from '../src/build';
import type { SegmentKind } from '../src/parts';

function seg(b: Build, kind: SegmentKind, ax: number, ay: number, bx: number, by: number): void { placeSegment(b, kind, ax, ay, bx, by); }

/** Run every load of a level; return the first failing outcome or the final held. */
function runTest(level: LevelDef, build: Build, maxSeconds = 40): { outcome: Outcome; loadsHeld: number } {
  const sim = new Sim(level, build);
  const pre = sim.precheck();
  if (pre) return { outcome: pre, loadsHeld: 0 };
  for (let i = 0; i < 40; i++) sim.update(1 / 60); // settle
  let held = 0;
  for (const load of level.loads) {
    sim.startLoad(load);
    let status = sim.update(1 / 60);
    let t = 0;
    while (status.state === 'running' && t < maxSeconds) { status = sim.update(1 / 60); t += 1 / 60; }
    if (status.state !== 'done') return { outcome: { ok: false, reason: 'stuck' }, loadsHeld: held };
    if (!status.outcome.ok) return { outcome: status.outcome, loadsHeld: held };
    held++;
    sim.clearLoad();
  }
  return { outcome: { ok: true, reason: 'held' }, loadsHeld: held };
}

describe('Cross the Gap', () => {
  it('a king-post truss carries both carts', () => {
    const lv = makeLevel('bridge', 1);
    const b = emptyBuild();
    seg(b, 'beam', 9, 8, 12, 8); seg(b, 'beam', 12, 8, 15, 8);
    seg(b, 'brace', 9, 10, 12, 8); seg(b, 'brace', 15, 10, 12, 8);
    const r = runTest(lv, b);
    expect(r.loadsHeld).toBe(2);
  });
  it('two hinged deck beams hold the light cart and snap under the heavy one', () => {
    const lv = makeLevel('bridge', 1);
    const b = emptyBuild();
    seg(b, 'beam', 9, 8, 12, 8); seg(b, 'beam', 12, 8, 15, 8);
    const r = runTest(lv, b);
    expect(r.loadsHeld).toBe(1);
    expect(r.outcome.reason).toBe('snapped');
  });
  it('a lone long beam sags and snaps under the heavy cart, but holds with a pillar under its middle', () => {
    const lv = makeLevel('bridge', 1);
    const lone = emptyBuild();
    seg(lone, 'long', 9, 8, 15, 8);
    const r1 = runTest(lv, lone);
    expect(r1.loadsHeld).toBe(1);
    expect(r1.outcome.reason).toBe('snapped');
    expect(r1.outcome.link?.role).toBe('bend');
    const propped = emptyBuild();
    seg(propped, 'long', 9, 8, 15, 8);
    seg(propped, 'pillar', 12, 8, 12, 13);
    const r2 = runTest(lv, propped);
    expect(r2.loadsHeld).toBe(2);
  });
  it('no deck at all: the cart falls', () => {
    const lv = makeLevel('bridge', 1);
    const r = runTest(lv, emptyBuild());
    expect(r.outcome.reason).toBe('fell');
  });
});

describe("Don't Wobble", () => {
  it('a square gate wobbles over; a braced gate holds', () => {
    const lv = makeLevel('wobble', 1);
    const square = emptyBuild();
    seg(square, 'pillar', 10, 11, 10, 8); seg(square, 'pillar', 13, 11, 13, 8); seg(square, 'beam', 10, 8, 13, 8);
    const r1 = runTest(lv, square);
    expect(r1.outcome.reason).toBe('wobbled');
    const braced = emptyBuild();
    seg(braced, 'pillar', 10, 11, 10, 8); seg(braced, 'pillar', 13, 11, 13, 8); seg(braced, 'beam', 10, 8, 13, 8);
    seg(braced, 'brace', 10, 11, 13, 8);
    const r2 = runTest(lv, braced);
    expect(r2.loadsHeld).toBe(2);
  });
});

describe('Stand Up', () => {
  it('a thin column topples, a wide-based tower survives the quake', () => {
    const lv = makeLevel('stand', 1);
    const thin = emptyBuild();
    for (let i = 0; i < 4; i++) placeBlock(thin, 'block', 12, 11 - i);
    const r1 = runTest(lv, thin);
    expect(r1.outcome.reason).toBe('toppled');
    expect(r1.loadsHeld).toBe(0);
    const mixed = emptyBuild();
    placeBlock(mixed, 'wide', 11, 11); placeBlock(mixed, 'wide', 11, 10); placeBlock(mixed, 'block', 12, 9); placeBlock(mixed, 'block', 12, 8);
    const rm = runTest(lv, mixed);
    expect(rm.loadsHeld).toBe(1); // survives the small shake, not the big one
    const wide = emptyBuild();
    for (let i = 0; i < 4; i++) placeBlock(wide, 'wide', 11, 11 - i);
    const r2 = runTest(lv, wide);
    expect(r2.loadsHeld).toBe(2);
  });
  it('too short is caught before the quake', () => {
    const lv = makeLevel('stand', 1);
    const b = emptyBuild();
    placeBlock(b, 'wide', 11, 11);
    expect(runTest(lv, b).outcome.reason).toBe('tooShort');
  });
});

describe('Lift It', () => {
  it('pivot near the boulder lifts it; pivot near Max does not', () => {
    const lv = makeLevel('lift', 1);
    const near = emptyBuild(); near.pivotX = 8;
    const far = emptyBuild(); far.pivotX = 13;
    expect(runTest(lv, near).outcome.ok).toBe(true);
    expect(runTest(lv, far).outcome.reason).toBe('notLifted');
    const lv3 = makeLevel('lift', 3);
    const p8 = emptyBuild(); p8.pivotX = 8;
    const p9 = emptyBuild(); p9.pivotX = 9;
    expect(runTest(lv3, p8).outcome.ok).toBe(true);
    expect(runTest(lv3, p9).outcome.ok).toBe(false);
    expect(runTest(lv, emptyBuild()).outcome.reason).toBe('noPivot');
  });
});

describe('Hold It Up', () => {
  it('a roof with a propped middle holds; a hinged roof drops into the pen', () => {
    const lv = makeLevel('roof', 1);
    const good = emptyBuild();
    seg(good, 'pillar', 10, 10, 10, 7); seg(good, 'pillar', 14, 10, 14, 7);
    seg(good, 'beam', 10, 7, 12, 7); seg(good, 'beam', 12, 7, 14, 7);
    seg(good, 'brace', 10, 10, 12, 7); seg(good, 'brace', 14, 10, 12, 7);
    const r1 = runTest(lv, good);
    expect(r1.loadsHeld).toBe(2);
    const bad = emptyBuild();
    seg(bad, 'pillar', 10, 10, 10, 7); seg(bad, 'pillar', 14, 10, 14, 7);
    seg(bad, 'beam', 10, 7, 12, 7); seg(bad, 'beam', 12, 7, 14, 7);
    const r2 = runTest(lv, bad);
    expect(r2.outcome.reason).toBe('roofFell');
  });
});
