import type { Content, Strings } from '../../engine/loader';
import type { TTSManager } from '../../engine/tts';
import type { AudioEngine } from '../../engine/audio';
import { bus } from '../../engine/events';
import { portraitFor } from '../ui/portraits';

/**
 * The voice of the game (§3.6): delivery pools with no-repeat memory,
 * rotating question speakers, a priority bark scheduler with cooldowns and a
 * "don't talk over each other" rule, subtitles with portraits, and TTS.
 */

export interface VoiceMemoryStore {
  used: Record<string, number[]>;
  rotation: Record<string, number>;
  seenScenes: string[];
}

export function freshVoiceMemory(): VoiceMemoryStore {
  return { used: {}, rotation: {}, seenScenes: [] };
}

export interface SpeakerHooks {
  onSpeakStart?(charId: string): void;
  onSpeakEnd?(charId: string): void;
}

export interface SayOptions {
  vars?: Record<string, string | number>;
  /** 1 flavour · 2 hints/tasks · 3 combat/danger (may interrupt) */
  priority?: number;
  /** droppable: if busy and not higher priority, silently skip (barks) */
  droppable?: boolean;
}

const MIN_DISPLAY = 0.8;

export class DialogueEngine {
  private memory: VoiceMemoryStore = freshVoiceMemory();
  private hooks: SpeakerHooks = {};
  private bar!: HTMLDivElement;
  private portraitEl!: HTMLImageElement;
  private nameEl!: HTMLDivElement;
  private textEl!: HTMLDivElement;
  private busy = false;
  private currentPriority = 0;
  private skipFlag = false;
  private cancelCurrent: (() => void) | null = null;
  private charCooldowns = new Map<string, number>();
  private poolCooldowns = new Map<string, number>();
  private banterTimer: number;
  cutsceneActive = false;
  /** Subtitle pacing multiplier — tests set 0 to run instantly. */
  timingScale = 1;

  constructor(
    private content: Content,
    readonly strings: Strings,
    private tts: TTSManager,
    private audio: AudioEngine,
    uiRoot: HTMLElement,
  ) {
    this.banterTimer = content.config.voice.banterIntervalSeconds * 0.5;
    this.buildDom(uiRoot);
  }

  private buildDom(root: HTMLElement): void {
    this.bar = document.createElement('div');
    this.bar.className = 'subtitle-bar';
    this.portraitEl = document.createElement('img');
    this.portraitEl.className = 'subtitle-portrait';
    this.portraitEl.alt = '';
    const body = document.createElement('div');
    body.className = 'subtitle-body';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'subtitle-name';
    this.textEl = document.createElement('div');
    this.textEl.className = 'subtitle-text';
    body.append(this.nameEl, this.textEl);
    this.bar.append(this.portraitEl, body);
    root.appendChild(this.bar);
  }

  attachMemory(store: VoiceMemoryStore): void { this.memory = store; }
  setSpeakerHooks(hooks: SpeakerHooks): void { this.hooks = hooks; }
  get speaking(): boolean { return this.busy; }

  /** Player pressed the advance/skip input. */
  skip(): void { this.skipFlag = true; }

  update(dt: number): void {
    for (const [k, v] of this.charCooldowns) this.charCooldowns.set(k, Math.max(0, v - dt));
    for (const [k, v] of this.poolCooldowns) this.poolCooldowns.set(k, Math.max(0, v - dt));
    this.banterTimer = Math.max(0, this.banterTimer - dt);
  }

  /** Pick a line from a character's delivery pool — never repeats until exhausted. */
  private pickLine(charId: string, poolKey: string): string | null {
    const pack = this.content.voices[charId];
    const pool = pack?.pools[poolKey];
    if (!pool || pool.length === 0) return null;
    const memKey = `${charId}:${poolKey}`;
    let used = this.memory.used[memKey] ?? [];
    if (used.length >= pool.length) used = [];
    const available = pool.map((_, i) => i).filter((i) => !used.includes(i));
    const idx = available[Math.floor(Math.random() * available.length)];
    used.push(idx);
    this.memory.used[memKey] = used;
    return pool[idx];
  }

  private interpolate(text: string, vars?: Record<string, string | number>): string {
    let out = text;
    const all: Record<string, string | number> = {
      playerName: this.content.characters.max?.name ?? 'Max',
      ...(vars ?? {}),
    };
    for (const [k, v] of Object.entries(all)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  }

  /** Speak a pooled line. Resolves when the line (incl. subtitle time) is done. */
  async say(charId: string, poolKey: string, opts: SayOptions = {}): Promise<void> {
    const line = this.pickLine(charId, poolKey);
    if (!line) return;
    return this.sayText(charId, line, opts, poolKey);
  }

  /** Speak literal text (questions, cutscene lines). */
  async sayText(charId: string, text: string, opts: SayOptions = {}, poolKey?: string): Promise<void> {
    const prio = opts.priority ?? 2;
    if (this.busy) {
      if (opts.droppable && prio <= this.currentPriority) return;
      if (prio >= 3 && this.currentPriority < 3) this.cancelCurrent?.(); // danger interrupts
      // wait for the floor
      while (this.busy) await sleep(60);
    }
    if (poolKey && opts.droppable) {
      const cd = this.charCooldowns.get(charId) ?? 0;
      const pcd = this.poolCooldowns.get(`${charId}:${poolKey}`) ?? 0;
      if (prio < 3 && (cd > 0 || pcd > 0)) return;
    }

    const def = this.content.characters[charId];
    if (!def) return;
    this.busy = true;
    this.currentPriority = prio;
    this.skipFlag = false;
    const resolved = this.interpolate(text, opts.vars);

    // subtitle
    this.portraitEl.src = portraitFor(charId, def);
    this.nameEl.textContent = def.name;
    this.nameEl.style.color = def.subtitleColor;
    this.textEl.textContent = resolved;
    this.bar.classList.add('visible');

    this.audio.signature(def.signature);
    this.audio.duck(true, this.content.config.voice.duckDb);
    this.hooks.onSpeakStart?.(charId);
    bus.emit('DialogueLine', { speaker: charId, text: resolved });

    let cancelled = false;
    this.cancelCurrent = () => { cancelled = true; this.tts.stop(); };

    const spoken = this.tts.speak(def, resolved);
    const started = performance.now();
    // wait for speech end, skip, or cancel
    let done = false;
    void spoken.then(() => { done = true; });
    while (!done && !cancelled) {
      if (this.skipFlag) { this.tts.stop(); this.skipFlag = false; break; }
      await sleep(this.timingScale > 0 ? 50 : 1);
    }
    const elapsed = (performance.now() - started) / 1000;
    const minShow = MIN_DISPLAY * this.timingScale;
    if (elapsed < minShow && !cancelled) await sleep((minShow - elapsed) * 1000);

    this.hooks.onSpeakEnd?.(charId);
    this.audio.duck(false);
    this.bar.classList.remove('visible');
    if (poolKey) {
      const cdBase = this.content.config.voice.barkCooldownSeconds;
      this.charCooldowns.set(charId, cdBase);
      this.poolCooldowns.set(`${charId}:${poolKey}`, cdBase * 2.5);
    }
    this.busy = false;
    this.currentPriority = 0;
    this.cancelCurrent = null;
    await sleep(120 * this.timingScale);
  }

  /** Fire-and-forget bark through the scheduler (droppable, cooldown-gated). */
  bark(charId: string, poolKey: string, opts: SayOptions = {}): void {
    void this.say(charId, poolKey, { ...opts, droppable: true });
  }

  /** Scripted scene. Returns false if a once-only scene was already seen. */
  async playCutscene(id: string): Promise<boolean> {
    const scene = this.content.dialogue[id];
    if (!scene) return false;
    if (scene.once && this.memory.seenScenes.includes(id)) return false;
    this.cutsceneActive = true;
    try {
      for (const line of scene.lines) {
        if (line.delay) await sleep(line.delay * 1000);
        await this.sayText(line.speaker, line.text, { priority: 2 });
      }
    } finally {
      this.cutsceneActive = false;
      if (scene.once) this.memory.seenScenes.push(id);
    }
    return true;
  }

  /** Rotate which companion asks (same fact, different voice — §3.6.2). */
  pickAskSpeaker(askStyles: string[]): string {
    const eligible = askStyles.filter((s) => this.content.characters[s]?.active && this.content.voices[s]);
    if (eligible.length === 0) return 'kenji';
    const key = eligible.slice().sort().join('|');
    const cursor = this.memory.rotation[key] ?? 0;
    this.memory.rotation[key] = (cursor + 1) % eligible.length;
    return eligible[cursor % eligible.length];
  }

  /** Ambient companion banter — quiet exploration only, max once per interval. */
  maybeBanter(companions: string[]): void {
    if (this.banterTimer > 0 || this.busy || this.cutsceneActive || companions.length === 0) return;
    this.banterTimer = this.content.config.voice.banterIntervalSeconds;
    // paired scenes take priority over solo quips when available
    const pairs = Object.values(this.content.dialogue).filter((d) => d.id.startsWith('banter_'));
    if (pairs.length > 0 && Math.random() < 0.6) {
      const pick = pairs[Math.floor(Math.random() * pairs.length)];
      if (!this.memory.seenScenes.includes(`b:${pick.id}`)) {
        this.memory.seenScenes.push(`b:${pick.id}`);
        void this.playCutscene(pick.id);
        return;
      }
    }
    const who = companions[Math.floor(Math.random() * companions.length)];
    this.bark(who, 'banter', { priority: 1 });
  }

  /** Gentle idle nudge when the player has been still a while. */
  idleNudge(companions: string[]): void {
    if (this.busy || this.cutsceneActive || companions.length === 0) return;
    const who = companions[Math.floor(Math.random() * companions.length)];
    this.bark(who, 'idle_nudge', { priority: 1 });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
