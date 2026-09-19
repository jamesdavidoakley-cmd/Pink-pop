import type { Mode, Tier } from './levels';

export interface SaveData {
  stars: Record<string, number>;
  towers: number;
  muted: boolean;
}

const KEY = 'snack-stack-save-v1';

export function levelKey(mode: Mode, tier: Tier): string {
  return `${mode}-${tier}`;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return { stars: parsed.stars ?? {}, towers: parsed.towers ?? 0, muted: parsed.muted ?? false };
    }
  } catch { /* fresh start */ }
  return { stars: {}, towers: 0, muted: false };
}

export function writeSave(data: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode etc. */ }
}
