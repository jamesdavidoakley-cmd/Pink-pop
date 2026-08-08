import { describe, expect, it } from 'vitest';
import { JumpLogic, jumpVelocityFor } from '../../src/game/player/jumpLogic';

const cfg = {
  coyoteTime: 0.12, jumpBuffer: 0.15,
  jumpVelocity: 10, doubleJumpVelocity: 9, variableJumpCut: 0.45,
};
const DT = 1 / 60;

describe('JumpLogic (P1 gate: coyote + buffer verified)', () => {
  it('jumps immediately when grounded and pressed', () => {
    const j = new JumpLogic(cfg);
    j.update(DT, true, false);
    expect(j.update(DT, true, true)).toBe('jump');
  });

  it('coyote time: jump still works shortly after walking off a ledge', () => {
    const j = new JumpLogic(cfg);
    j.update(DT, true, false);            // grounded frame
    for (let i = 0; i < 5; i++) j.update(DT, false, false); // ~0.083s airborne
    expect(j.update(DT, false, true)).toBe('jump');         // within 0.12s window
  });

  it('coyote time expires: press too late becomes a double jump, then nothing', () => {
    const j = new JumpLogic(cfg);
    j.update(DT, true, false);
    for (let i = 0; i < 12; i++) j.update(DT, false, false); // 0.2s > coyote
    expect(j.update(DT, false, true)).toBe('double');        // air jump burns the double
    for (let i = 0; i < 12; i++) j.update(DT, false, false);
    expect(j.update(DT, false, true)).toBe(null);            // out of jumps
  });

  it('jump buffer: pressing shortly before landing triggers on landing', () => {
    const j = new JumpLogic(cfg);
    j.update(DT, true, false);
    for (let i = 0; i < 30; i++) j.update(DT, false, false); // long fall, no coyote
    j.setAirborneWithJumps(2);                               // no air jumps left
    expect(j.update(DT, false, true)).toBe(null);            // buffered, can't jump yet
    for (let i = 0; i < 4; i++) expect(j.update(DT, false, false)).toBe(null); // ~0.067s
    expect(j.update(DT, true, false)).toBe('jump');          // lands inside 0.15s buffer
  });

  it('jump buffer expires after its window', () => {
    const j = new JumpLogic(cfg);
    j.update(DT, true, false);
    for (let i = 0; i < 30; i++) j.update(DT, false, false);
    j.setAirborneWithJumps(2);
    j.update(DT, false, true);                               // press (buffered)
    for (let i = 0; i < 12; i++) j.update(DT, false, false); // 0.2s > 0.15s buffer
    expect(j.update(DT, true, false)).toBe(null);            // landing: buffer gone
  });

  it('double jump: exactly one air jump', () => {
    const j = new JumpLogic(cfg);
    j.update(DT, true, false);
    expect(j.update(DT, true, true)).toBe('jump');
    for (let i = 0; i < 10; i++) j.update(DT, false, false);
    expect(j.update(DT, false, true)).toBe('double');
    for (let i = 0; i < 10; i++) j.update(DT, false, false);
    expect(j.update(DT, false, true)).toBe(null);
  });

  it('variable height: releasing early cuts upward velocity once', () => {
    const j = new JumpLogic(cfg);
    j.update(DT, true, false);
    j.update(DT, true, true);
    expect(j.onJumpReleased(10)).toBeCloseTo(cfg.variableJumpCut);
    expect(j.onJumpReleased(8)).toBe(1); // second release: no double-cut
  });

  it('jumpVelocityFor reaches the configured apex under integration', () => {
    const g = 24, h = 2.3;
    const v0 = jumpVelocityFor(g, h);
    let y = 0, v = v0, peak = 0;
    for (let i = 0; i < 400; i++) {
      v -= g * DT; y += v * DT;
      peak = Math.max(peak, y);
      if (v < 0 && y <= 0) break;
    }
    expect(peak).toBeGreaterThan(h * 0.95);
    expect(peak).toBeLessThan(h * 1.1);
  });
});
