import * as THREE from 'three';
import { fileOf, rankOf, sq, type Square } from '../chess/types';

export const TILE = 1;
/** White sits at +z looking toward -z. File a is at -x. */
export function squareToWorld(s: Square, y = 0): THREE.Vector3 {
  return new THREE.Vector3((fileOf(s) - 3.5) * TILE, y, (3.5 - rankOf(s)) * TILE);
}
export function worldToSquare(p: THREE.Vector3): Square | null {
  const f = Math.round(p.x / TILE + 3.5);
  const r = Math.round(3.5 - p.z / TILE);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return sq(f, r);
}
