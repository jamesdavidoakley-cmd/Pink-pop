import * as THREE from 'three';
import { mergeGeometries as mergeBuffers } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  // Keep LatheGeometry's own analytic normals: recomputing them from faces banded the shading.
  return new THREE.LatheGeometry(pts, 40);
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

function knightDetail(): THREE.BufferGeometry {
  // Eyes either side of the head and a mane ridge down the back of the neck.
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.13, 0.13]) {
    const eye = new THREE.SphereGeometry(0.035, 8, 6);
    eye.translate(0.18, 1.08, z);
    parts.push(eye);
  }
  for (let i = 0; i < 5; i++) {
    const tuft = new THREE.BoxGeometry(0.07, 0.09, 0.16);
    tuft.translate(-0.26 + i * 0.012, 0.55 + i * 0.12, 0);
    parts.push(tuft);
  }
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
  const a = new THREE.BoxGeometry(0.08, 0.32, 0.08);
  a.translate(0, 1.46, 0);
  const b = new THREE.BoxGeometry(0.24, 0.08, 0.08);
  b.translate(0, 1.48, 0);
  // A crown ring with four small studs under the cross.
  const ring = new THREE.TorusGeometry(0.2, 0.035, 8, 20);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 1.22, 0);
  const parts = [a, b, ring];
  for (let i = 0; i < 4; i++) {
    const stud = new THREE.BoxGeometry(0.07, 0.1, 0.07);
    const ang = (i / 4) * Math.PI * 2;
    stud.translate(Math.cos(ang) * 0.2, 1.28, Math.sin(ang) * 0.2);
    parts.push(stud);
  }
  return mergeGeometries(parts);
}

function queenCrown(): THREE.BufferGeometry {
  // Eight points around the crown and a pearl on top.
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const pt = new THREE.ConeGeometry(0.045, 0.16, 6);
    const ang = (i / 8) * Math.PI * 2;
    pt.translate(Math.cos(ang) * 0.24, 1.36, Math.sin(ang) * 0.24);
    parts.push(pt);
  }
  const pearl = new THREE.SphereGeometry(0.075, 12, 10);
  pearl.translate(0, 1.5, 0);
  parts.push(pearl);
  return parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
}

function bishopMitre(): THREE.BufferGeometry {
  // The diagonal slit of the mitre, cut as a dark sliver standing proud of the head.
  const slit = new THREE.BoxGeometry(0.03, 0.26, 0.36);
  slit.rotateX(Math.PI / 5);
  slit.translate(0, 1.02, 0.04);
  const ball = new THREE.SphereGeometry(0.06, 10, 8);
  ball.translate(0, 1.33, 0);
  return mergeGeometries([slit, ball]);
}

/** Merge parts keeping each part's own normals and UVs (so stone grain and smooth lathes survive). */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.getAttribute('uv')) {
      const count = n.getAttribute('position').count;
      n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    return n;
  });
  const merged = mergeBuffers(parts, false);
  if (!merged) throw new Error('piece geometry merge failed');
  return merged;
}

function baseRing(): THREE.BufferGeometry {
  // A sculpted plinth ring under every piece.
  const r = new THREE.TorusGeometry(0.33, 0.035, 8, 32);
  r.rotateX(Math.PI / 2);
  r.translate(0, 0.045, 0);
  return r;
}

export function pieceGeometry(type: PieceType): THREE.BufferGeometry {
  let g = geometryCache.get(type);
  if (g) return g;
  if (type === 'n') g = mergeGeometries([knightGeometry(), knightDetail()]);
  else if (type === 'r') g = rookGeometry();
  else if (type === 'k') g = mergeGeometries([latheFrom(PROFILES.k), kingCross()]);
  else if (type === 'q') g = mergeGeometries([latheFrom(PROFILES.q), queenCrown()]);
  else if (type === 'b') g = mergeGeometries([latheFrom(PROFILES.b), bishopMitre()]);
  else g = latheFrom(PROFILES[type as 'p']);
  g = mergeGeometries([g, baseRing()]);
  geometryCache.set(type, g);
  return g;
}

/** Procedural stone grain, shared by both sides' materials. */
export function stoneTexture(size = 256, contrast = 0.5): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 128 + (Math.random() - 0.5) * 255 * contrast;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Soften into blotches so it reads as stone, not static.
  g.globalAlpha = 0.6;
  g.filter = 'blur(2px)';
  g.drawImage(c, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Stone by roughness alone: a bump texture on the lathes produced per-facet banding
// under derivative-based bump mapping, so the grain lives on the board, not the pieces.
const materials: Record<Color, THREE.MeshStandardMaterial> = {
  // Pale sandstone and dark basalt: living statues, not plastic.
  w: new THREE.MeshStandardMaterial({ color: PALETTE.whitePiece, roughness: 0.86, metalness: 0.0 }),
  b: new THREE.MeshStandardMaterial({ color: PALETTE.blackPiece, roughness: 0.78, metalness: 0.05, emissive: PALETTE.blackPieceEmissive, emissiveIntensity: 0.3 }),
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

/** A statue slides with weight: fast out, eased in, a low arc, and a squash as it lands. */
export function tweenMove(mesh: THREE.Object3D, to: THREE.Vector3, duration = 0.34, hop = 0.16): Tween {
  const from = mesh.position.clone();
  const settle = 0.14;
  let t = 0;
  return {
    update(dt) {
      t += dt;
      if (t < duration) {
        const k = Math.min(1, t / duration);
        const e = 1 - Math.pow(1 - k, 3);
        mesh.position.lerpVectors(from, to, e);
        mesh.position.y = from.y + Math.sin(e * Math.PI) * hop;
        return true;
      }
      // landing squash: compress then spring back
      const k = Math.min(1, (t - duration) / settle);
      const sq = 1 - 0.08 * Math.sin(k * Math.PI);
      mesh.position.copy(to);
      mesh.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
      if (k >= 1) {
        mesh.scale.set(1, 1, 1);
        return false;
      }
      return true;
    },
  };
}

/** The victim braces: leans away from the attacker during the wind-up, then is struck. */
export function tweenBrace(mesh: THREE.Object3D, awayFrom: THREE.Vector3, duration = 0.3): Tween {
  const away = mesh.position.clone().sub(awayFrom).setY(0).normalize();
  const axis = new THREE.Vector3(0, 1, 0).cross(away).normalize().negate();
  const q0 = mesh.quaternion.clone();
  let t = 0;
  return {
    update(dt) {
      t += dt;
      const k = Math.min(1, t / duration);
      mesh.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromAxisAngle(axis, -0.28 * Math.sin((k * Math.PI) / 2)));
      return t < duration + 0.6; // hold the brace until the blow lands
    },
  };
}

/** Runs tweens one after another. */
export function sequence(steps: (() => Tween)[]): Tween {
  let i = 0;
  let cur: Tween | null = null;
  return {
    update(dt) {
      if (!cur) {
        const next = steps[i];
        if (!next) return false;
        cur = next();
      }
      if (!cur.update(dt)) {
        cur = null;
        i++;
        return i < steps.length;
      }
      return true;
    },
  };
}

export type StrikeStyle = 'shove' | 'stomp' | 'slash' | 'smash' | 'chop';

/** How each piece fights. */
export function strikeStyle(type: PieceType): StrikeStyle {
  switch (type) {
    case 'n': return 'stomp'; // rears up, crashes down
    case 'b': return 'slash'; // a sweeping spin
    case 'r': return 'smash'; // a straight battering charge
    case 'q': return 'chop'; // rises and brings the full weight down
    default: return 'shove'; // pawn and king: a hard shoulder
  }
}

/**
 * The fight animation for a living statue: wind-up, blow, settle. `onImpact`
 * fires at the moment the blow lands so the victim can shatter in time.
 */
export function tweenStrike(mesh: THREE.Object3D, dir: THREE.Vector3, style: StrikeStyle, onImpact: () => void): Tween {
  const fwd = dir.clone().setY(0).normalize();
  const axis = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
  const base = mesh.position.clone();
  const q0 = mesh.quaternion.clone();
  const timings: Record<StrikeStyle, { windup: number; blow: number; settle: number }> = {
    shove: { windup: 0.22, blow: 0.1, settle: 0.25 },
    stomp: { windup: 0.34, blow: 0.12, settle: 0.3 },
    slash: { windup: 0.26, blow: 0.16, settle: 0.3 },
    smash: { windup: 0.18, blow: 0.09, settle: 0.32 },
    chop: { windup: 0.36, blow: 0.1, settle: 0.34 },
  };
  const timing = timings[style];
  let t = 0;
  let hit = false;
  const tilt = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  return {
    update(dt) {
      t += dt;
      const { windup, blow, settle } = timing;
      // The blow is short; on a slow frame it can be stepped over entirely, so the impact
      // is guaranteed here rather than inside the blow branch.
      if (!hit && t >= windup + blow * 0.82) {
        hit = true;
        onImpact();
      }
      let lean = 0; // rotation about the side axis: negative = lean back
      let push = 0; // along fwd
      let rise = 0; // up
      let yaw = 0; // spin about up
      if (t < windup) {
        const k = Math.sin((Math.min(1, t / windup) * Math.PI) / 2);
        switch (style) {
          case 'stomp': rise = 0.55 * k; lean = -0.35 * k; push = -0.05 * k; break;
          case 'slash': yaw = -1.1 * k; lean = -0.2 * k; break;
          case 'smash': push = -0.22 * k; lean = -0.15 * k; break;
          case 'chop': rise = 0.4 * k; lean = -0.8 * k; push = -0.1 * k; break;
          default: lean = -0.55 * k; push = -0.1 * k;
        }
      } else if (t < windup + blow) {
        const k = (t - windup) / blow;
        switch (style) {
          case 'stomp': rise = 0.55 * (1 - k) - 0.02 * k; lean = -0.35 + 0.75 * k; push = -0.05 + 0.55 * k; break;
          case 'slash': yaw = -1.1 + 3.3 * k; lean = -0.2 + 0.5 * k; push = 0.45 * k; break;
          case 'smash': push = -0.22 + 1.0 * k; lean = -0.15 + 0.4 * k; break;
          case 'chop': rise = 0.4 * (1 - k); lean = -0.8 + 1.5 * k; push = -0.1 + 0.7 * k; break;
          default: lean = -0.55 + 1.0 * k; push = -0.1 + 0.7 * k;
        }
      } else {
        const k = Math.min(1, (t - windup - blow) / settle);
        const e = 1 - Math.pow(1 - k, 2);
        switch (style) {
          case 'slash': yaw = 2.2 * (1 - e); lean = 0.3 * (1 - e); push = 0.45 * (1 - e); break;
          case 'smash': push = 0.78 * (1 - e); lean = 0.25 * (1 - e); break;
          case 'chop': lean = 0.7 * (1 - e); push = 0.6 * (1 - e); break;
          case 'stomp': lean = 0.4 * (1 - e); push = 0.5 * (1 - e); break;
          default: lean = 0.45 * (1 - e); push = 0.6 * (1 - e);
        }
      }
      tilt.setFromAxisAngle(axis, lean);
      spin.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      mesh.quaternion.copy(q0).multiply(spin).multiply(tilt);
      mesh.position.copy(base).addScaledVector(fwd, push);
      mesh.position.y = base.y + rise;
      if (t >= windup + blow + settle) {
        mesh.quaternion.copy(q0);
        mesh.position.copy(base);
        return false;
      }
      return true;
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
