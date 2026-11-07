import * as THREE from 'three';
import type { Square } from '../chess/types';
import type { BoardScene } from './scene';
import { worldToSquare } from './coords';

export interface PickResult {
  square: Square | null;
  piece: THREE.Object3D | null;
}

/** Pointer → board square picking. Works for mouse and touch. */
export class BoardInput {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  onDown: ((p: PickResult) => void) | null = null;
  onMove: ((p: PickResult, world: THREE.Vector3) => void) | null = null;
  onUp: ((p: PickResult) => void) | null = null;

  constructor(private board: BoardScene) {
    const c = board.renderer.domElement;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => this.onDown?.(this.pick(e)));
    c.addEventListener('pointermove', (e) => this.onMove?.(this.pick(e), this.hit.clone()));
    c.addEventListener('pointerup', (e) => this.onUp?.(this.pick(e)));
    c.addEventListener('pointercancel', (e) => this.onUp?.(this.pick(e)));
  }

  private pick(e: PointerEvent): PickResult {
    const rect = this.board.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.board.camera);
    const pieces = this.ray.intersectObjects(this.board.piecesGroup.children, false);
    const piece = pieces[0]?.object ?? null;
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return { square: null, piece };
    const square = piece ? (piece.userData.square as Square) : worldToSquare(this.hit);
    return { square, piece };
  }
}
