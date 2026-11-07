import { describe, expect, it } from 'vitest';
import { readMs, shouldAskPrinciple, shouldAskWhy } from '../src/game/questions';
import { EMPTY_PROGRESS, loadProgress, recordPrinciple, recordWhy, rungProgress, setQuestions } from '../src/game/progress';

describe('question pacing', () => {
  it('quick asks the why on the first puzzle, then every third, and after a miss', () => {
    expect(shouldAskWhy('quick', 0, [])).toBe(true);
    expect(shouldAskWhy('quick', 1, [true, true, true])).toBe(false);
    expect(shouldAskWhy('quick', 2, [true, true, true])).toBe(false);
    expect(shouldAskWhy('quick', 3, [true, true, true])).toBe(true);
    expect(shouldAskWhy('quick', 1, [true, false, true])).toBe(true);
  });
  it('full always asks, off never asks', () => {
    expect(shouldAskWhy('full', 5, [true, true, true])).toBe(true);
    expect(shouldAskWhy('off', 0, [])).toBe(false);
    expect(shouldAskPrinciple('full', 10, true)).toBe(true);
    expect(shouldAskPrinciple('off', 0, false)).toBe(false);
  });
  it('quick stops asking the principle after two right on the rung, unless hints were needed', () => {
    expect(shouldAskPrinciple('quick', 0, true)).toBe(true);
    expect(shouldAskPrinciple('quick', 2, true)).toBe(false);
    expect(shouldAskPrinciple('quick', 5, false)).toBe(true);
  });
  it('reading time scales with words and is shorter in quick mode', () => {
    const t = 'The king cannot run. Trap it before it reaches safety.';
    expect(readMs(t, 'quick')).toBeLessThan(readMs(t, 'full'));
    expect(readMs(t, 'full')).toBeGreaterThan(1500);
  });
  it('progress tracks principle answers per rung and recent why results', () => {
    let p = EMPTY_PROGRESS;
    expect(p.settings.questions).toBe('quick');
    p = recordPrinciple(p, 'finish-him', true);
    p = recordPrinciple(p, 'finish-him', false);
    expect(rungProgress(p, 'finish-him').principleRight).toBe(1);
    for (let i = 0; i < 7; i++) p = recordWhy(p, i % 2 === 0);
    expect(p.whyRecent).toHaveLength(5);
    expect(setQuestions(p, 'off').settings.questions).toBe('off');
    expect(loadProgress().settings.questions).toBe('quick'); // no storage in tests → defaults
  });
});
