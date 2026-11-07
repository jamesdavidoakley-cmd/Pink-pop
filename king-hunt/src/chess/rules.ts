import { Chess, type Move } from 'chess.js';
import type { Color, MoveInput, PieceType, Square } from './types';

export interface PieceOn {
  square: Square;
  type: PieceType;
  color: Color;
}

/** Thin, intention-revealing wrapper over chess.js. One instance per game. */
export class Rules {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
  }

  fen(): string {
    return this.chess.fen();
  }
  turn(): Color {
    return this.chess.turn();
  }
  pieces(): PieceOn[] {
    const out: PieceOn[] = [];
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) out.push({ square: cell.square as Square, type: cell.type, color: cell.color });
      }
    }
    return out;
  }
  pieceAt(square: Square): PieceOn | null {
    const p = this.chess.get(square);
    return p ? { square, type: p.type, color: p.color } : null;
  }
  legalMoves(from?: Square): Move[] {
    return from ? this.chess.moves({ square: from, verbose: true }) : this.chess.moves({ verbose: true });
  }
  isLegal(m: MoveInput): boolean {
    return this.legalMoves(m.from).some((x) => x.to === m.to && (!x.promotion || x.promotion === (m.promotion ?? 'q')));
  }
  needsPromotion(m: MoveInput): boolean {
    return this.legalMoves(m.from).some((x) => x.to === m.to && !!x.promotion);
  }
  /** Applies the move. Returns the verbose move, or null if illegal. */
  play(m: MoveInput): Move | null {
    try {
      return this.chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? (this.needsPromotion(m) ? 'q' : undefined) });
    } catch {
      return null;
    }
  }
  playUci(uci: string): Move | null {
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci[4] as MoveInput['promotion'] | undefined;
    return this.play({ from, to, promotion });
  }
  undo(): Move | null {
    return this.chess.undo();
  }
  history(): Move[] {
    return this.chess.history({ verbose: true });
  }
  inCheck(): boolean {
    return this.chess.inCheck();
  }
  isCheckmate(): boolean {
    return this.chess.isCheckmate();
  }
  isGameOver(): boolean {
    return this.chess.isGameOver();
  }
  isDraw(): boolean {
    return this.chess.isDraw();
  }
  kingSquare(color: Color): Square {
    return this.chess.findPiece({ type: 'k', color })[0] as Square;
  }
  attackers(square: Square, by: Color): Square[] {
    return this.chess.attackers(square, by) as Square[];
  }
  /** Raw access for read-only analysis helpers. */
  raw(): Chess {
    return this.chess;
  }
  clone(): Rules {
    return new Rules(this.fen());
  }
}
