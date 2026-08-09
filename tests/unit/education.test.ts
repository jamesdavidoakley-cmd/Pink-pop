import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/engine/loader';
import { EducationEngine } from '../../src/game/education/engine';
import { Session } from '../../src/game/session';
import { freshSave, defaultSettings } from '../../src/engine/save';
import { evalExpr } from '../../src/game/education/expr';

function makeEngine() {
  const content = loadContent();
  const session = new Session(0, freshSave(), defaultSettings(), content);
  // don't touch localStorage in tests
  session.save = () => { /* noop */ };
  return { engine: new EducationEngine(content, session), session, content };
}

describe('expression evaluator', () => {
  it('handles arithmetic, precedence, and functions', () => {
    expect(evalExpr('a*4', { a: 7 })).toBe(28);
    expect(evalExpr('a*4+4', { a: 7 })).toBe(32);
    expect(evalExpr('floor(n/10)%10', { n: 347 })).toBe(4);
    expect(evalExpr('floor(n/100)*100', { n: 347 })).toBe(300);
    expect(evalExpr('round(n/100)*100', { n: 351 })).toBe(400);
    expect(evalExpr('a*(b+2)-1', { a: 3, b: 4 })).toBe(17);
    expect(evalExpr('-a+10', { a: 3 })).toBe(7);
  });
  it('rejects unknown names instead of guessing', () => {
    expect(() => evalExpr('teleport(1)', {})).toThrow();
    expect(() => evalExpr('zz+1', {})).toThrow();
  });
});

describe('question instancing', () => {
  it('produces 3 choices with exactly one correct, params in range', () => {
    const { engine } = makeEngine();
    for (let i = 0; i < 40; i++) {
      const q = engine.makeQuestion('place-value');
      expect(q).not.toBeNull();
      expect(q!.choices.length).toBe(3);
      expect(new Set(q!.choices).size).toBe(3);
      expect(q!.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q!.correctIndex).toBeLessThan(3);
      expect(q!.hint.length).toBeGreaterThan(2);
      expect(q!.explain.length).toBeGreaterThan(2);
      expect(q!.text).not.toContain('{');
    }
  });
  it('fixed-choice questions keep the right answer', () => {
    const { engine, content } = makeEngine();
    const pack = content.questions['maths-roman-numerals'];
    const def = pack.questions.find((q) => q.id === 'rn-t1-002')!;
    for (let i = 0; i < 12; i++) {
      const q = engine.instantiate(def, 'roman-numerals', 1);
      expect(q.choices[q.correctIndex]).toBe('5');
    }
  });
});

describe('adaptive tiers (§5.1.4: promote on 3 straight, demote softly)', () => {
  it('promotes after three correct in a row', () => {
    const { engine, session } = makeEngine();
    expect(session.topic('place-value').tier).toBe(1);
    for (let i = 0; i < 3; i++) engine.recordAnswer('place-value', true, 1, true);
    expect(session.topic('place-value').tier).toBe(2);
    for (let i = 0; i < 3; i++) engine.recordAnswer('place-value', true, 2, true);
    expect(session.topic('place-value').tier).toBe(3);
    for (let i = 0; i < 3; i++) engine.recordAnswer('place-value', true, 3, true);
    expect(session.topic('place-value').tier).toBe(3); // capped
  });
  it('demotes softly after repeated misses, never below tier 1', () => {
    const { engine, session } = makeEngine();
    const t = session.topic('addsub');
    t.tier = 2;
    engine.recordAnswer('addsub', false, 2, true);
    expect(session.topic('addsub').tier).toBe(2); // one miss: stay
    engine.recordAnswer('addsub', false, 2, false);
    expect(session.topic('addsub').tier).toBe(1); // second recent miss: soft drop
    engine.recordAnswer('addsub', false, 1, false);
    engine.recordAnswer('addsub', false, 1, false);
    expect(session.topic('addsub').tier).toBe(1); // floor
  });
  it('mastery stars grow from XP and never shrink', () => {
    const { engine, session } = makeEngine();
    for (let i = 0; i < 4; i++) engine.recordAnswer('skeletons', true, 1, true);
    expect(session.stars('skeletons')).toBe(1); // 12xp ≥ 10
    engine.recordAnswer('skeletons', false, 1, true);
    expect(session.stars('skeletons')).toBe(1); // misses never remove stars
  });
  it('weak-topic picker prefers low-star topics', () => {
    const { engine, session } = makeEngine();
    session.topic('rocks-soils').xp = 60; // 3 stars
    const counts: Record<string, number> = { 'rocks-soils': 0, 'place-value': 0 };
    for (let i = 0; i < 300; i++) {
      const t = engine.pickWeakTopic(['rocks-soils', 'place-value']);
      counts[t]++;
    }
    expect(counts['place-value']).toBeGreaterThan(counts['rocks-soils'] * 2);
  });
});
