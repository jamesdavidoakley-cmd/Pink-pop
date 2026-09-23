import { describe, expect, it } from 'vitest';
import { World, addBox } from '../src/physics';

function settle(w: World, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) w.step(1 / 60);
}

describe('verlet world', () => {
  it('a beam between two anchors holds a light load and snaps under a heavy one', () => {
    const run = (mass: number) => {
      const w = new World();
      const a = w.addNode(0, 0, 0, 0.18, true);
      const b = w.addNode(4, 0, 0, 0.18, true);
      const mid = w.addNode(2, 0, 1);
      const l1 = w.addLink(a, mid, { breakForce: 400, compliance: 1e-4, partId: 1 });
      const l2 = w.addLink(mid, b, { breakForce: 400, compliance: 1e-4, partId: 1 });
      const load = w.addNode(2, -0.6, mass);
      w.addLink(load, mid, { role: 'body' });
      settle(w, 3);
      return { broken: l1.broken || l2.broken, stress: Math.max(l1.stress, l2.stress), sag: mid.y };
    };
    const light = run(1);
    const heavy = run(60);
    expect(light.broken).toBe(false);
    expect(light.sag).toBeGreaterThan(0); // gravity pulls the middle down (y grows downward)
    expect(heavy.broken).toBe(true);
    expect(heavy.stress).toBeGreaterThan(light.stress);
  });

  it('a rope goes slack when pushed together and only resists pulling', () => {
    const w = new World();
    const top = w.addNode(0, 0, 0, 0.18, true);
    const hang = w.addNode(0, 3, 2);
    const rope = w.addLink(top, hang, { ropeLike: true, breakForce: 500, compliance: 1e-4 });
    settle(w, 2);
    expect(hang.y).toBeCloseTo(3, 0); // hangs at rope length
    // Push it up: the rope offers no resistance so the node rises freely past the rest length.
    w.kick(hang, 0, -20);
    w.step(1 / 60);
    expect(rope.force).toBe(0);
  });

  it('a box rests on the ground and stops', () => {
    const w = new World();
    w.addGround(-10, 5, 10, 5);
    const corners = addBox(w, 0, 2.9, 2, 1, 4, 1);
    settle(w, 3);
    const bottom = Math.max(...corners.map((c) => c.y));
    expect(bottom).toBeLessThanOrEqual(5.15);
    expect(bottom).toBeGreaterThan(4.7);
    const v = w.velocity(corners[0]);
    expect(Math.abs(v.vy)).toBeLessThan(0.5);
  });

  it('a tall thin stack topples in an earthquake while a wide base survives', () => {
    const topple = (width: number) => {
      const w = new World();
      w.addGround(-20, 10, 20, 10);
      for (let i = 0; i < 4; i++) addBox(w, 0, 9.4 - i * 1.1, width, 1, 3, i + 1);
      settle(w, 1);
      w.shakeAmp = 0.3; w.shakeFreq = 1.2;
      settle(w, 5);
      const topY = Math.min(...w.nodes.filter((n) => !n.fixed).map((n) => n.y));
      return topY;
    };
    const thin = topple(0.6); const wide = topple(3);
    console.log('top of stack after quake, thin:', thin.toFixed(2), 'wide:', wide.toFixed(2));
    expect(thin).toBeGreaterThan(wide + 1); // the thin one fell over
    expect(wide).toBeLessThan(7.2); // the wide one is still standing four high
  });
});
