import * as THREE from 'three';
import type { Color, PieceType, Square } from '../chess/types';
import { PALETTE } from './palette';
import { squareToWorld } from './coords';

/**
 * Stylised low-poly pieces built from lathe profiles. Chunky silhouettes read
 * well from a high camera and at small sizes, which matters for a 7-year-old.
 */
type Profile = [number, number][]; // [radius, height]

const PROFILES: Record<Exclude<PieceType, 'n'>, Profile> = {
  p: [[0, 0], [0.34, 0], [0.34, 0.06], [0.22, 0.14], [0.17, 0.42], [0.26, 0.5], [0.17, 0.56], [0.2, 0.66], [0.15, 0.78], [0, 0.84]],
  r: [[0, 0], [0.36, 0], [0.36, 0.08], [0.25, 0.18], [0.22, 0.72], [0.31, 0.78], [0.31, 0.95], [0, 0.95]],
  b: [[0, 0], [0.36, 0], [0.36, 0.08], [0.24, 0.18], [0.18, 0.72], [0.28, 0.8], [0.2, 0.9], [0.17, 1.1], [0.08, 1.18], [0.09, 1.26], [0, 1.3]],
  q: [[0, 0], [0.38, 0], [0.38, 0.08], [0.26, 0.2], [0.19, 0.85], [0.32, 0.95], [0.3, 1.1], [0.2, 1.2], [0.26, 1.28], [0.16, 1.34], [0.1, 1.42], [0, 1.46]],
  k: [[0, 0], [0.38, 0], [0.38, 0.08], [0.27, 0.2], [0.2, 0.9], [0.33, 1.0], [0.3, 1.15], [0.22, 1.24], [0.14, 1.3], [0, 1.3]],
};

const geometryCache = new Map<PieceType, THREE.BufferGeometry>();

function latheFrom(profile: Profile): THREE.BufferGeometry {
  const pts = profile.map(([r, h]) => new THREE.Vector2(r, h));
  const g = new THREE.LatheGeometry(pts, 24);
  g.computeVertexNormals();
  return g;
}

function knightGeometry(): THREE.BufferGeometry {
  // Base + an extruded horse-head silhouette. The 2D outline is what reads
  // as "knight" from the high camera; depth is kept thin so it stays elegant.
  const parts: THREE.BufferGeometry[] = [];
  parts.push(latheFrom([[0, 0], [0.36, 0], [0.36, 0.08], [0.25, 0.18], [0.24, 0.3], [0, 0.3]]));
  const outline: [number, number][] = [
    [-0.2, 0.0], [0.2, 0.0], [0.22, 0.25], [0.16, 0.45], [0.2, 0.62], [0.34, 0.72], // chest → muzzle
    [0.36, 0.84], [0.3, 0.9], [0.18, 0.88], [0.12, 0.94], [0.1, 1.08], // nose, brow
    [0.0, 1.12], [-0.04, 1.02], [-0.1, 1.1], [-0.14, 0.98], [-0.12, 0.84], // ears
    [-0.22, 0.6], [-0.26, 0.35], [-0.22, 0.1], // mane / back of neck
  ];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const head = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  head.translate(0, 0.28, -0.11);
  // Profile stays in the XY plane so the silhouette reads from the player's high camera.
  parts.push(head);
  return mergeGeometries(parts);
}

function rookGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [latheFrom(PROFILES.r)];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.translate(Math.cos(a) * 0.22, 1.02, Math.sin(a) * 0.22);
    parts.push(b);
  }
  return mergeGeometries(parts);
}

function kingCross(): THREE.BufferGeometry {
  const a = new THREE.BoxGeometry(0.08, 0.3, 0.08);
  a.translate(0, 1.44, 0);
  const b = new THREE.BoxGeometry(0.22, 0.08, 0.08);
  b.translate(0, 1.46, 0);
  return mergeGeometries([a, b]);
}

/** Minimal non-indexed merge so we avoid pulling in the examples bundle. */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const positions: number[] = [];
  const normals: number[] = [];
  for (const g of nonIndexed) {
    positions.push(...(g.getAttribute('position').array as Float32Array));
    normals.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return out;
}

export function pieceGeometry(type: PieceType): THREE.BufferGeometry {
  let g = geometryCache.get(type);
  if (g) return g;
  if (type === 'n') g = knightGeometry();
  else if (type === 'r') g = rookGeometry();
  else if (type === 'k') g = mergeGeometries([latheFrom(PROFILES.k), kingCross()]);
  else g = latheFrom(PROFILES[type as Exclude<PieceType, 'n' | 'r'>]);
  geometryCache.set(type, g);
  return g;
}

const materials: Record<Color, THREE.MeshStandardMaterial> = {
  w: new THREE.MeshStandardMaterial({ color: PALETTE.whitePiece, roughness: 0.35, metalness: 0.08 }),
  b: new THREE.MeshStandardMaterial({ color: PALETTE.blackPiece, roughness: 0.3, metalness: 0.35, emissive: PALETTE.blackPieceEmissive, emissiveIntensity: 0.6 }),
};

export interface PieceMesh extends THREE.Mesh {
  userData: { kind: 'piece'; square: Square; type: PieceType; color: Color };
}

export function makePiece(type: PieceType, color: Color, square: Square): PieceMesh {
  const mesh = new THREE.Mesh(pieceGeometry(type), materials[color].clone()) as unknown as PieceMesh;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.position.copy(squareToWorld(square));
  if (type === 'n' && color === 'b') mesh.rotation.y = Math.PI; // black knights mirror white ones
  mesh.userData = { kind: 'piece', square, type, color };
  return mesh;
}

/** Simple tween helper used for piece motion and capture fades. */
export interface Tween {
  update(dt: number): boolean; // returns false when finished
}

export function tweenMove(mesh: THREE.Object3D, to: THREE.Vector3, duration = 0.28, hop = 0.35): Tween {
  const from = mesh.position.clone();
  let t = 0;
  return {
    update(dt) {
      t = Math.min(1, t + dt / duration);
      const e = 1 - Math.pow(1 - t, 3);
      mesh.position.lerpVectors(from, to, e);
      mesh.position.y = from.y + Math.sin(e * Math.PI) * hop;
      return t < 1;
    },
  };
}

export function tweenVanish(mesh: THREE.Mesh, onDone: () => void, duration = 0.3): Tween {
  let t = 0;
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.transparent = true;
  return {
    update(dt) {
      t = Math.min(1, t + dt / duration);
      const s = 1 - t;
      mesh.scale.setScalar(Math.max(0.001, s));
      mesh.position.y += dt * 2.5;
      mat.opacity = s;
      if (t >= 1) {
        onDone();
        return false;
      }
      return true;
    },
  };
}
