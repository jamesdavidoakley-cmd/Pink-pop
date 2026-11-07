import replaysJson from '../../content/replays.json';
import type { Principle } from './ladder';

export interface Ask {
  prompt: string;
  hint: string;
  why: string;
  principle: Principle;
}

export interface Replay {
  id: string;
  title: string;
  hero: string;
  heroSide: 'w' | 'b';
  opponent: string;
  year: number;
  where: string;
  story: string;
  moves: string[]; // SAN from the standard start
  start: number; // ply where guess-the-move begins (a hero move)
  asks: Record<string, Ask>; // hero plies the player must guess
  notes: Record<string, string>; // auto-played plies with a line of commentary
  finale: string;
}

export const REPLAYS = (replaysJson as unknown as { version: number; replays: Replay[] }).replays;
