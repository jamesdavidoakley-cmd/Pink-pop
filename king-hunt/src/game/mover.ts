import type * as THREE from 'three';
import type { Rules } from '../chess/rules';
import type { Color, MoveInput, Square } from '../chess/types';
import type { BoardInput } from '../board3d/input';
import type { BoardView } from '../board3d/view';
import type { PieceMesh } from '../board3d/pieces';
import type { Hud } from '../ui/hud';

/**
 * Turns pointer input into a candidate move for the human side: click-click,
 * or drag-and-drop, with legal-target highlights and a promotion picker.
 * Sessions decide what to do with the move.
 */
export class HumanMover {
  enabled = false;
  onMove: ((m: MoveInput) => void) | null = null;
  private selected: Square | null = null;
  private dragging: Square | null = null;
  rules: Rules | null = null;
  side: Color = 'w';

  constructor(
    private view: BoardView,
    input: BoardInput,
    private hud: Hud,
  ) {
    input.onDown = (p) => this.down(p.square, p.piece as PieceMesh | null);
    input.onMove = (_p, world) => this.move(world);
    input.onUp = (p) => this.up(p.square);
  }

  reset() {
    this.selected = null;
    this.dragging = null;
    this.view.clearHighlights();
  }

  private canAct() {
    return this.enabled && this.rules && this.rules.turn() === this.side && !this.rules.isGameOver();
  }

  private down(square: Square | null, piece: PieceMesh | null) {
    if (!this.canAct() || !this.rules) return;
    if (!square) return this.reset();
    if (this.selected && this.rules.isLegal({ from: this.selected, to: square })) {
      void this.submit(this.selected, square);
      return;
    }
    const p = this.rules.pieceAt(square);
    if (p && p.color === this.side) {
      this.selected = square;
      this.dragging = piece && piece.userData.square === square ? square : square;
      this.view.showTargets(this.rules, square);
    } else {
      this.reset();
    }
  }
  private move(world: THREE.Vector3) {
    if (this.dragging) this.view.drag(this.dragging, world);
  }
  private up(square: Square | null) {
    if (!this.dragging || !this.rules) return;
    const from = this.dragging;
    this.dragging = null;
    if (square && square !== from && this.rules.isLegal({ from, to: square })) {
      this.view.drag(from, null);
      void this.submit(from, square);
    } else {
      this.view.drag(from, null);
    }
  }
  private async submit(from: Square, to: Square) {
    if (!this.rules) return;
    const m: MoveInput = { from, to };
    if (this.rules.needsPromotion(m)) m.promotion = await this.hud.pickPromotion();
    this.reset();
    this.onMove?.(m);
  }
}
