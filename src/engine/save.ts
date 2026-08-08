/** 3 save slots in localStorage + JSON export/import. No servers, no accounts. */

export interface TopicProgress {
  xp: number; tier: number; streak: number; recentMisses: number;
  attempts: number; correct: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  playtimeSeconds: number;
  fossils: string[];
  chipsCarried: Record<string, number>;   // per level id (un-banked)
  chipsBanked: Record<string, number>;    // per level id
  brainSegments: number;
  mastery: Record<string, TopicProgress>;
  voiceUsed: Record<string, number[]>;    // pool key → used line indices
  seenDialogue: string[];                 // one-shot cutscenes played
  freedChampions: string[];
  gadgets: string[];
  flags: Record<string, boolean>;
  difficulty: 'explorer' | 'hero';
  lastLevel: string;
}

export interface Settings {
  musicVolume: number; sfxVolume: number; voiceOn: boolean; speechRate: number; readMenus: boolean;
  subtitleSize: 'small' | 'medium' | 'large';
  dyslexiaFont: boolean; colorSafe: boolean; reduceShake: boolean; reduceFlash: boolean; holdToggle: boolean;
  invertY: boolean; sensitivity: number;
  quality: 'low' | 'medium' | 'high' | 'auto';
  breakReminderMins: number; // 0 = off
  bindings: Record<string, string[]>;
}

const SAVE_PREFIX = 'maxfossils.save.';
const SETTINGS_KEY = 'maxfossils.settings';
export const SAVE_VERSION = 1;

export function freshSave(difficulty: 'explorer' | 'hero' = 'explorer'): SaveData {
  return {
    version: SAVE_VERSION, createdAt: Date.now(), playtimeSeconds: 0,
    fossils: [], chipsCarried: {}, chipsBanked: {}, brainSegments: 0,
    mastery: {}, voiceUsed: {}, seenDialogue: [], freedChampions: [], gadgets: [],
    flags: {}, difficulty, lastLevel: 'hub',
  };
}

export function defaultSettings(): Settings {
  return {
    musicVolume: 0.7, sfxVolume: 0.9, voiceOn: true, speechRate: 1, readMenus: false,
    subtitleSize: 'medium', dyslexiaFont: false, colorSafe: false, reduceShake: false,
    reduceFlash: false, holdToggle: false, invertY: false, sensitivity: 1,
    quality: 'auto', breakReminderMins: 0, bindings: {},
  };
}

function storage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

export class SaveManager {
  listSlots(): (SaveData | null)[] {
    const out: (SaveData | null)[] = [];
    for (let i = 0; i < 3; i++) out.push(this.load(i));
    return out;
  }

  load(slot: number): SaveData | null {
    const s = storage(); if (!s) return null;
    const raw = s.getItem(SAVE_PREFIX + slot);
    if (!raw) return null;
    try { return migrate(JSON.parse(raw) as SaveData); }
    catch { return null; }
  }

  save(slot: number, data: SaveData): void {
    const s = storage(); if (!s) return;
    s.setItem(SAVE_PREFIX + slot, JSON.stringify(data));
  }

  delete(slot: number): void { storage()?.removeItem(SAVE_PREFIX + slot); }

  export(data: SaveData): string { return JSON.stringify(data, null, 2); }

  import(json: string): SaveData {
    const parsed = JSON.parse(json) as SaveData;
    if (typeof parsed.version !== 'number' || !Array.isArray(parsed.fossils)) {
      throw new Error('Not a Max & the Star Fossils save file');
    }
    return migrate(parsed);
  }

  loadSettings(): Settings {
    const s = storage(); if (!s) return defaultSettings();
    try {
      const raw = s.getItem(SETTINGS_KEY);
      return raw ? { ...defaultSettings(), ...(JSON.parse(raw) as Partial<Settings>) } : defaultSettings();
    } catch { return defaultSettings(); }
  }

  saveSettings(settings: Settings): void {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}

function migrate(data: SaveData): SaveData {
  // Future save-format migrations layer here; v1 is current.
  return { ...freshSave(data.difficulty ?? 'explorer'), ...data, version: SAVE_VERSION };
}

export const saves = new SaveManager();
