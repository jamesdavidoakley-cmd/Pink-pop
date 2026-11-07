import recipesJson from '../../content/recipes.json';
import type { Principle } from './ladder';

export interface Bait {
  give: number; // material value offered
  get: string[]; // the real payoffs (all correct answers)
  decoys: string[]; // wrong reasons
  /** ply by which the pressure must have risen (default: bait ply + 4) */
  payoffPly?: number;
  /** the calculation in words: give now, get by when */
  count?: string;
}

export interface Step {
  prompt: string;
  why: string;
  bait?: Bait;
}

export interface Recipe {
  id: string;
  title: string;
  rung: string;
  principle: Principle;
  side: 'w' | 'b';
  goal: string;
  howWeGotHere: string;
  /** starting position; the standard start if omitted */
  fen?: string;
  moves: string[]; // SAN from `fen` (or the standard start)
  start: number; // ply index of the first lesson move (player to move)
  steps: Record<string, Step>; // keyed by ply index of the player's move
  payoff: string;
}

export const RECIPES = (recipesJson as unknown as { version: number; recipes: Recipe[] }).recipes;
