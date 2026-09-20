export type HouseId = 'emberfox' | 'frostowl' | 'moonhare' | 'thornbadger';
export const HOUSES: Record<HouseId, { name: string; crest: string; color: string; motto: string }> = {
  emberfox: { name: 'Emberfox', crest: '🦊', color: '#ff7a3c', motto: 'Bold and bright' },
  frostowl: { name: 'Frostowl', crest: '🦉', color: '#5fc8ff', motto: 'Wise and calm' },
  moonhare: { name: 'Moonhare', crest: '🐇', color: '#c48bff', motto: 'Quick and curious' },
  thornbadger: { name: 'Thornbadger', crest: '🦡', color: '#7bd88f', motto: 'Steady and kind' },
};

export interface SaveData {
  house: HouseId | null;
  points: number;
  stars: Record<string, number>;
  muted: boolean;
}

const KEY = 'numbermoor-save-v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SaveData>;
      return { house: p.house ?? null, points: p.points ?? 0, stars: p.stars ?? {}, muted: p.muted ?? false };
    }
  } catch { /* fresh */ }
  return { house: null, points: 0, stars: {}, muted: false };
}

export function writeSave(d: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode */ }
}
