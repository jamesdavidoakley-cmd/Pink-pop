export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Square = `${'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function sq(file: number, rank: number): Square {
  return `${FILES[file]}${rank + 1}` as Square;
}
export function fileOf(s: Square): number {
  return s.charCodeAt(0) - 97;
}
export function rankOf(s: Square): number {
  return Number(s[1]) - 1;
}
export function other(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}
