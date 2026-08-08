import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Wire three-mesh-bvh into three's raycasting.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export interface CapsuleMoveResult {
  position: THREE.Vector3;
  grounded: boolean;
  groundNormal: THREE.Vector3;
  hitCeiling: boolean;
  hitWall: boolean;
  wallNormal: THREE.Vector3;
}

const _tri = new THREE.Triangle();
const _seg = new THREE.Line3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _box = new THREE.Box3();
const _capsulePoint = new THREE.Vector3();
const _triPoint = new THREE.Vector3();
const _ray = new THREE.Raycaster();
_ray.firstHitOnly = true;

/**
 * Static level collision: all level geometry merged into one BVH-indexed mesh.
 * The kinematic capsule controller resolves against it (three-mesh-bvh shapecast).
 */
export class StaticWorld {
  readonly mesh: THREE.Mesh;
  private bvh: MeshBVH;

  constructor(geometries: THREE.BufferGeometry[]) {
    const cleaned = geometries.map((g) => {
      const c = g.index ? g.toNonIndexed() : g;
      // Collision only needs positions; strip the rest so merge always succeeds.
      const slim = new THREE.BufferGeometry();
      slim.setAttribute('position', c.getAttribute('position').clone());
      return slim;
    });
    const merged = cleaned.length ? mergeGeometries(cleaned, false) : new THREE.BufferGeometry();
    this.bvh = new MeshBVH(merged);
    (merged as THREE.BufferGeometry & { boundsTree?: MeshBVH }).boundsTree = this.bvh;
    this.mesh = new THREE.Mesh(merged);
    this.mesh.visible = false;
    this.mesh.updateMatrixWorld(true);
  }

  /**
   * Move a capsule (feet at `position`) by `delta`, resolving collisions.
   * Returns the corrected position plus contact classification.
   */
  moveCapsule(position: THREE.Vector3, radius: number, height: number, delta: THREE.Vector3): CapsuleMoveResult {
    const result: CapsuleMoveResult = {
      position: position.clone().add(delta),
      grounded: false,
      groundNormal: new THREE.Vector3(0, 1, 0),
      hitCeiling: false,
      hitWall: false,
      wallNormal: new THREE.Vector3(),
    };

    for (let iter = 0; iter < 5; iter++) {
      const p = result.position;
      _seg.start.set(p.x, p.y + radius, p.z);
      _seg.end.set(p.x, p.y + height - radius, p.z);
      _box.makeEmpty();
      _box.expandByPoint(_seg.start);
      _box.expandByPoint(_seg.end);
      _box.min.addScalar(-radius);
      _box.max.addScalar(radius);

      let pushed = false;
      this.bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(_box),
        intersectsTriangle: (tri) => {
          _tri.copy(tri as unknown as THREE.Triangle);
          const distSq = closestSegmentTriangle(_seg, _tri, _capsulePoint, _triPoint);
          if (distSq < radius * radius) {
            const dist = Math.sqrt(distSq);
            const depth = radius - dist;
            if (dist > 1e-7) _v1.subVectors(_capsulePoint, _triPoint).divideScalar(dist);
            else _tri.getNormal(_v1);
            _seg.start.addScaledVector(_v1, depth);
            _seg.end.addScaledVector(_v1, depth);
            classify(_v1, result);
            pushed = true;
          }
          return false;
        },
      });

      if (!pushed) break;
      result.position.set(_seg.start.x, _seg.start.y - radius, _seg.start.z);
    }
    return result;
  }

  /** First raycast hit (camera probes, ground checks, interaction). */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Intersection | null {
    _ray.set(origin, dir);
    _ray.far = far;
    const hits = _ray.intersectObject(this.mesh, false);
    return hits[0] ?? null;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

function classify(normal: THREE.Vector3, result: CapsuleMoveResult): void {
  if (normal.y > 0.55) {
    result.grounded = true;
    result.groundNormal.copy(normal);
  } else if (normal.y < -0.5) {
    result.hitCeiling = true;
  } else {
    result.hitWall = true;
    result.wallNormal.copy(normal);
  }
}

/** Squared distance between a segment and a triangle, with closest points. */
function closestSegmentTriangle(seg: THREE.Line3, tri: THREE.Triangle, segPoint: THREE.Vector3, triPoint: THREE.Vector3): number {
  // Sample: closest point on tri to both ends + midpoint, then refine by
  // projecting back. Robust enough for platformer capsules vs static tris.
  let best = Infinity;
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    _v2.lerpVectors(seg.start, seg.end, i / steps);
    tri.closestPointToPoint(_v2, _triPoint);
    const d = _v2.distanceToSquared(_triPoint);
    if (d < best) {
      best = d;
      segPoint.copy(_v2);
      triPoint.copy(_triPoint);
    }
  }
  return best;
}

/** Simple sphere-vs-point overlap helpers used by combat + pickups. */
export function withinXZ(a: THREE.Vector3, b: THREE.Vector3, dist: number): boolean {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz <= dist * dist;
}
export function within3D(a: THREE.Vector3, b: THREE.Vector3, dist: number): boolean {
  return a.distanceToSquared(b) <= dist * dist;
}
