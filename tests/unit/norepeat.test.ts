// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadContent, makeStrings } from '../../src/engine/loader';
import { DialogueEngine, freshVoiceMemory } from '../../src/game/dialogue/engine';
import type { TTSManager } from '../../src/engine/tts';
import type { AudioEngine } from '../../src/engine/audio';

/** P2 gate: a line never repeats until its pool is exhausted; speakers rotate. */

function makeEngine() {
  const content = loadContent();
  const tts = {
    speak: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    voiceOn: false,
    rateMultiplier: 1,
    providerName: 'null',
  } as unknown as TTSManager;
  const audio = { signature: vi.fn(), duck: vi.fn(), sfx: vi.fn() } as unknown as AudioEngine;
  const root = document.createElement('div');
  const engine = new DialogueEngine(content, makeStrings(content), tts, audio, root);
  engine.timingScale = 0; // subtitle pacing is real-time; not under test here
  return { engine, content, root };
}

describe('DialogueEngine no-repeat memory', () => {
  beforeAll(() => {
    // portraitFor falls back to 2D canvas in jsdom; stub getContext + toDataURL
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () => null;
    (HTMLCanvasElement.prototype as unknown as { toDataURL: unknown }).toDataURL = () => 'data:,';
  });

  it('never repeats a line until the pool is exhausted, then resets', async () => {
    const { engine, content, root } = makeEngine();
    const memory = freshVoiceMemory();
    engine.attachMemory(memory);
    const pool = content.voices.kenji.pools.ask_intro;
    const heard: string[] = [];
    const textEl = () => root.querySelector('.subtitle-text')!.textContent ?? '';

    for (let i = 0; i < pool.length; i++) {
      await engine.say('kenji', 'ask_intro');
      heard.push(textEl());
    }
    // every draw distinct across a full pool pass
    expect(new Set(heard).size).toBe(pool.length);
    expect(memory.used['kenji:ask_intro'].length).toBe(pool.length);

    // next draw resets the pool and still yields a valid line
    await engine.say('kenji', 'ask_intro');
    expect(memory.used['kenji:ask_intro'].length).toBe(1);
    expect(pool).toContain(textEl());
  });

  it('memory survives a save/load roundtrip (persisted per slot)', async () => {
    const { engine } = makeEngine();
    const memory = freshVoiceMemory();
    engine.attachMemory(memory);
    await engine.say('digger', 'fossil_get');
    await engine.say('digger', 'fossil_get');
    const snapshot = JSON.parse(JSON.stringify(memory));

    const { engine: engine2, content } = makeEngine();
    engine2.attachMemory(snapshot);
    const pool = content.voices.digger.pools.fossil_get;
    const remainingBefore = pool.length - snapshot.used['digger:fossil_get'].length;
    await engine2.say('digger', 'fossil_get');
    expect(snapshot.used['digger:fossil_get'].length).toBe(pool.length - remainingBefore + 1);
  });

  it('rotates question speakers across eligible companions', () => {
    const { engine } = makeEngine();
    engine.attachMemory(freshVoiceMemory());
    const styles = ['kenji', 'marcus', 'digger'];
    const seq = [1, 2, 3, 4, 5, 6].map(() => engine.pickAskSpeaker(styles));
    expect(seq.slice(0, 3).sort()).toEqual(['digger', 'kenji', 'marcus']);
    expect(seq[3]).toBe(seq[0]); // round-robin wraps
  });

  it('one-shot cutscenes only play once per memory', async () => {
    const { engine } = makeEngine();
    engine.attachMemory(freshVoiceMemory());
    expect(await engine.playCutscene('intro')).toBe(true);
    expect(await engine.playCutscene('intro')).toBe(false);
  });
});
