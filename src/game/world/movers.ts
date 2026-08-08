import * as THREE from 'three';
import { toonMat } from '../../engine/renderer';
import type { CapsuleMoveResult } from '../../engine/physics';
import type { MoverDef } from '../../engine/types';

/**
 * Moving platforms, conveyors, and rotating gear platforms. Movers resolve
 * against the player capsule after the static world and carry riders.
 */
export class MoverRuntime {
  readonly mesh: THREE.Object3D;
  readonly frameDelta = new THREE.Vector3();
  private t = 0;
  private dirSign = 1;
  private pauseT = 0;
  private from: THREE.Vector3;
  private to: THREE.Vector3 | null = null;
  private half = new THREE.Vector3(1, 0.25, 1);
  private radius = 2;
  angleDelta = 0;
  private angle = 0;

  constructor(public readonly id: number, public readonly def: MoverDef) {
    this.from = new THREE.Vector3(...def.pos);
    const color = def.color ?? '#8898A8';
    if (def.kind === 'rotator') {
      this.radius = def.r ?? 2.4;
      const h = def.size?.[1] ?? 0.5;
      const group = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(this.radius, this.radius, h, 20), toonMat(color));
      disc.castShadow = true; disc.receiveShadow = true;
      group.add(disc);
      if (def.teeth !== false) {
        const toothGeo = new THREE.BoxGeometry(0.5, h, 0.62);
        const teeth = new THREE.InstancedMesh(toothGeo, toonMat(color), 10);
        const m = new THREE.Matrix4();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          m.makeRotationY(a).setPosition(Math.sin(a) * (this.radius + 0.2), 0, Math.cos(a) * (this.radius + 0.2));
          teeth.setMatrixAt(i, m);
        }
        teeth.castShadow = true;
        group.add(teeth);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, h + 0.3, 10), toonMat('#5A5A68'));
      group.add(hub);
      group.position.copy(this.from);
      this.mesh = group;
      this.half.y = h / 2;
    } else {
      const size = def.size ?? [2.4, 0.4, 2.4];
      this.half.set(size[0] / 2, size[1] / 2, size[2] / 2);
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), toonMat(color));
      m.castShadow = true; m.receiveShadow = true;
      m.position.copy(this.from);
      this.mesh = m;
      if (def.kind === 'conveyor') {
        // stripes so the motion reads
        const stripes = new THREE.Mesh(
          new THREE.BoxGeometry(size[0] * 0.96, 0.05, size[2] * 0.96),
          toonMat('#3A3A48'),
        );
        stripes.position.y = size[1] / 2 + 0.01;
        m.add(stripes);
      }
      if (def.to) this.to = new THREE.Vector3(...def.to);
    }
  }

  update(dt: number): void {
    this.frameDelta.set(0, 0, 0);
    this.angleDelta = 0;
    const def = this.def;
    if (def.kind === 'platform' && this.to) {
      if (this.pauseT > 0) { this.pauseT -= dt; return; }
      const speed = def.speed ?? 1.6;
      const total = this.from.distanceTo(this.to);
      if (total < 0.01) return;
      this.t += (speed / total) * dt * this.dirSign;
      if (this.t >= 1) { this.t = 1; this.dirSign = -1; this.pauseT = def.pause ?? 0.6; }
      else if (this.t <= 0) { this.t = 0; this.dirSign = 1; this.pauseT = def.pause ?? 0.6; }
      const target = this.from.clone().lerp(this.to, this.t);
      this.frameDelta.subVectors(target, this.mesh.position);
      this.mesh.position.copy(target);
    } else if (def.kind === 'rotator') {
      this.angleDelta = (def.speed ?? 0.6) * dt;
      this.angle += this.angleDelta;
      this.mesh.rotation.y = this.angle;
    }
  }

  get center(): THREE.Vector3 { return this.mesh.position; }

  /** Resolve capsule (feet pos) against this mover. Returns true if standing on it. */
  collide(pos: THREE.Vector3, radius: number, height: number, res: CapsuleMoveResult): boolean {
    const c = this.mesh.position;
    if (this.def.kind === 'rotator') {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const top = c.y + this.half.y;
      const bottom = c.y - this.half.y;
      if (d < this.radius + radius && pos.y < top && pos.y + height > bottom) {
        if (pos.y > top - 0.45) {
          pos.y = top;
          res.grounded = true;
          res.groundNormal.set(0, 1, 0);
          return true;
        }
        if (d > 0.001) {
          const push = (this.radius + radius - d);
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
          res.hitWall = true;
        }
      }
      return false;
    }
    // AABB (platform / conveyor)
    const ex = this.half.x + radius, ez = this.half.z + radius;
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const top = c.y + this.half.y, bottom = c.y - this.half.y;
    if (Math.abs(dx) < ex && Math.abs(dz) < ez && pos.y < top && pos.y + height > bottom) {
      const pushUp = top - pos.y;
      const pushDown = pos.y + height - bottom;
      const pushX = ex - Math.abs(dx);
      const pushZ = ez - Math.abs(dz);
      const min = Math.min(pushUp, pushX, pushZ, pushDown);
      if (min === pushUp && pushUp < 0.6) {
        pos.y = top;
        res.grounded = true;
        res.groundNormal.set(0, 1, 0);
        return true;
      } else if (min === pushX) {
        pos.x = c.x + Math.sign(dx) * ex; res.hitWall = true;
      } else if (min === pushZ) {
        pos.z = c.z + Math.sign(dz) * ez; res.hitWall = true;
      } else {
        pos.y = bottom - height; res.hitCeiling = true;
      }
    }
    return false;
  }

  /** Displacement to apply to a rider this frame. */
  carry(pos: THREE.Vector3): THREE.Vector3 {
    if (this.def.kind === 'rotator') {
      const c = this.mesh.position;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const cos = Math.cos(this.angleDelta), sin = Math.sin(this.angleDelta);
      return new THREE.Vector3(dx * cos + dz * sin - dx, 0, -dx * sin + dz * cos - dz);
    }
    return this.frameDelta.clone();
  }

  /** Surface velocity for conveyors (added to the rider's motion). */
  surfaceVelocity(): THREE.Vector3 {
    if (this.def.kind !== 'conveyor') return new THREE.Vector3();
    const dir = new THREE.Vector3(...(this.def.dir ?? [1, 0, 0]));
    return dir.normalize().multiplyScalar(this.def.speed ?? 2);
  }
}
