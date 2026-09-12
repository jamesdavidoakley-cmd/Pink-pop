import type { ModeId, Tier } from './levels';

export interface SaveData {
  stars: Record<string, number>;
  muted: boolean;
}

const KEY = 'crash-test-save-v1';

export function levelKey(mode: ModeId, tier: Tier): string {
  return `${mode}-${tier}`;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return { stars: parsed.stars ?? {}, muted: parsed.muted ?? false };
    }
  } catch { /* fresh start */ }
  return { stars: {}, muted: false };
}

export function writeSave(data: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode etc. */ }
}
