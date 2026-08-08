import type {
  BossDef, CharacterDef, DialogueScene, EnemyDef, GameConfig, LevelDef,
  MovesetDef, MusicDef, QuestionPack, TaskDef, VoicePack,
} from './types';

/**
 * Content loader. Everything under /content is discovered via import.meta.glob —
 * the registry is derived from the file tree, never hardcoded. Adding a world,
 * boss, or question pack is a pure content drop (tested in tests/content).
 */
export interface Content {
  config: GameConfig;
  characters: Record<string, CharacterDef>;
  strings: Record<string, string>;
  voices: Record<string, VoicePack>;          // key: character id
  dialogue: Record<string, DialogueScene>;
  questions: Record<string, QuestionPack>;    // key: pack id
  tasks: Record<string, TaskDef>;
  enemies: Record<string, EnemyDef>;
  bosses: Record<string, BossDef>;
  movesets: Record<string, MovesetDef>;
  levels: Record<string, LevelDef>;
  music: Record<string, MusicDef>;
  /** world levels sorted by gate cost — drives door layout & fossil totals */
  worlds: LevelDef[];
  totalFossils: number;
}

type FileMap = Record<string, unknown>;

/** Build the registry from a map of path → parsed JSON (pure; unit-testable). */
export function buildContent(files: FileMap): Content {
  const out: Content = {
    config: null as unknown as GameConfig,
    characters: {}, strings: {}, voices: {}, dialogue: {}, questions: {},
    tasks: {}, enemies: {}, bosses: {}, movesets: {}, levels: {}, music: {},
    worlds: [], totalFossils: 0,
  };

  for (const [path, raw] of Object.entries(files)) {
    const doc = (raw as { default?: unknown }).default ?? raw;
    const m = path.match(/\/content\/(?:([^/]+)\/)?([^/]+)\.json$/);
    if (!m) continue;
    const [, dir, base] = m;
    const d = doc as Record<string, unknown>;
    if (!dir) {
      if (base === 'config') out.config = doc as GameConfig;
      else if (base === 'characters') {
        const { $schema: _s, ...chars } = d;
        out.characters = chars as Record<string, CharacterDef>;
      }
      continue;
    }
    switch (dir) {
      case 'schemas': break;
      case 'strings': Object.assign(out.strings, stripMeta(d) as Record<string, string>); break;
      case 'voices': out.voices[(d.character as string) ?? base] = doc as VoicePack; break;
      case 'dialogue': out.dialogue[(d.id as string) ?? base] = doc as DialogueScene; break;
      case 'questions': out.questions[(d.id as string) ?? base] = doc as QuestionPack; break;
      case 'tasks': out.tasks[(d.id as string) ?? base] = doc as TaskDef; break;
      case 'enemies': out.enemies[(d.id as string) ?? base] = doc as EnemyDef; break;
      case 'bosses': out.bosses[(d.id as string) ?? base] = doc as BossDef; break;
      case 'movesets': out.movesets[(d.id as string) ?? base] = doc as MovesetDef; break;
      case 'levels': out.levels[(d.id as string) ?? base] = doc as LevelDef; break;
      case 'music': out.music[(d.id as string) ?? base] = doc as MusicDef; break;
      default: break;
    }
  }

  out.worlds = Object.values(out.levels)
    .filter((l) => l.kind === 'world')
    .sort((a, b) => gate(out, a) - gate(out, b));
  out.totalFossils = Object.values(out.levels)
    .reduce((sum, l) => sum + (l.fossils?.length ?? 0), 0);
  return out;
}

function gate(c: Content, l: LevelDef): number {
  return l.gateKey ? (c.config?.doors?.[l.gateKey] ?? 0) : 0;
}

function stripMeta(d: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _s, ...rest } = d;
  return rest;
}

let cached: Content | null = null;

/** Load all bundled content (browser + vitest; both run through Vite). */
export function loadContent(): Content {
  if (cached) return cached;
  const files = import.meta.glob('/content/**/*.json', { eager: true }) as FileMap;
  cached = buildContent(files);
  if (!cached.config) throw new Error('content/config.json missing');
  return cached;
}

/** String table lookup with {var} interpolation. Falls back to the key loudly. */
export function makeStrings(content: Content) {
  return {
    get(key: string, vars?: Record<string, string | number>): string {
      let s = content.strings[key];
      if (s === undefined) { console.warn(`[strings] missing key: ${key}`); s = key; }
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    has(key: string): boolean { return content.strings[key] !== undefined; },
  };
}
export type Strings = ReturnType<typeof makeStrings>;
