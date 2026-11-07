import type { Puzzle } from '../content/ladder';

/**
 * Pure state machine for one Lichess-format puzzle. No DOM, no Three.js.
 * moves[0] is the opponent's setup move. The player then plays moves[1],
 * the opponent replies moves[2], and so on.
 */
export type TryResult = 'correct' | 'complete' | 'wrong';

export class PuzzleRunner {
  private index = 1; // next expected player move
  wrongTries = 0;
  revealed = false;

  constructor(readonly puzzle: Puzzle) {}

  setupMove(): string {
    return this.puzzle.moves[0]!;
  }
  expected(): string | null {
    return this.puzzle.moves[this.index] ?? null;
  }
  /** Lichess marks any mating move as correct even if it differs from the stored line. */
  tryMove(uci: string, isMate = false): TryResult {
    const exp = this.expected();
    if (!exp) return 'complete';
    const ok = uci === exp || (isMate && this.index === this.puzzle.moves.length - 1);
    if (!ok) {
      this.wrongTries++;
      return 'wrong';
    }
    this.index++;
    return this.index >= this.puzzle.moves.length ? 'complete' : 'correct';
  }
  /** The opponent's scripted reply after a correct player move, or null at the end. */
  opponentReply(): string | null {
    const m = this.puzzle.moves[this.index] ?? null;
    if (m) this.index++;
    return m;
  }
  isComplete(): boolean {
    return this.index >= this.puzzle.moves.length;
  }
  /** Hint level grows with wrong tries: 0 none, 1 show the piece, 2 show the move, 3 reveal. */
  hintLevel(): 0 | 1 | 2 | 3 {
    return Math.min(3, this.wrongTries) as 0 | 1 | 2 | 3;
  }
  firstTry(): boolean {
    return this.wrongTries === 0 && !this.revealed;
  }
}
