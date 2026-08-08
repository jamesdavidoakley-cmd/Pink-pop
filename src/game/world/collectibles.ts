import * as THREE from 'three';
import { toonMat } from '../../engine/renderer';
import type { ChipGroup } from '../../engine/types';

/** Instanced Amber Chips with magnet pickup; star fossils; heart drops. */

export class ChipField {
  private inst: THREE.InstancedMesh;
  private positions: THREE.Vector3[] = [];
  private alive: boolean[] = [];
  private baseY: number[] = [];
  private m = new THREE.Matrix4();
  remaining: number;

  constructor(scene: THREE.Object3D, groups: ChipGroup[], collected: Set<number>) {
    for (const g of groups) {
      const n = g.count;
      for (let i = 0; i < n; i++) {
        let p: THREE.Vector3;
        if (g.pattern === 'ring' && g.center) {
          const a = (i / n) * Math.PI * 2;
          p = new THREE.Vector3(
            g.center[0] + Math.cos(a) * (g.radius ?? 2),
            g.center[1],
            g.center[2] + Math.sin(a) * (g.radius ?? 2),
          );
        } else if (g.pattern === 'arc' && g.center) {
          const a = (i / Math.max(1, n - 1)) * Math.PI;
          p = new THREE.Vector3(
            g.center[0] + Math.cos(a) * (g.radius ?? 2),
            g.center[1] + Math.sin(a) * (g.radius ?? 2) * 0.5,
            g.center[2],
          );
        } else if (g.pattern === 'line' && g.from && g.to) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          p = new THREE.Vector3(
            g.from[0] + (g.to[0] - g.from[0]) * t,
            g.from[1] + (g.to[1] - g.from[1]) * t,
            g.from[2] + (g.to[2] - g.from[2]) * t,
          );
        } else {
          const c = g.center ?? [0, 0, 0];
          const a = (i * 2.4) % (Math.PI * 2);
          const r = 0.5 + (i % 3) * 0.5;
          p = new THREE.Vector3(c[0] + Math.cos(a) * r, c[1] + (i % 2) * 0.4, c[2] + Math.sin(a) * r);
        }
        this.positions.push(p);
        this.baseY.push(p.y);
        this.alive.push(true);
      }
    }
    const geo = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 6);
    geo.rotateX(Math.PI / 2);
    this.inst = new THREE.InstancedMesh(geo, toonMat('#FFB13B', { emissive: '#FF9A1F' }), Math.max(1, this.positions.length));
    this.inst.castShadow = false;
    // apply persistence: already-collected chip indices stay hidden
    collected.forEach((i) => { if (i < this.alive.length) this.alive[i] = false; });
    this.remaining = this.alive.filter(Boolean).length;
    this.refresh(0);
    scene.add(this.inst);
  }

  private refresh(t: number): void {
    for (let i = 0; i < this.positions.length; i++) {
      if (!this.alive[i]) {
        this.m.makeScale(0, 0, 0);
      } else {
        const p = this.positions[i];
        this.m.makeRotationY(t * 2.4 + i * 0.7);
        this.m.setPosition(p.x, this.baseY[i] + 0.35 + Math.sin(t * 2.5 + i) * 0.09, p.z);
      }
      this.inst.setMatrixAt(i, this.m);
    }
    this.inst.instanceMatrix.needsUpdate = true;
  }

  /** Magnet + pickup. Returns indices collected this frame. */
  update(t: number, playerPos: THREE.Vector3, magnetRadius: number): number[] {
    const got: number[] = [];
    for (let i = 0; i < this.positions.length; i++) {
      if (!this.alive[i]) continue;
      const p = this.positions[i];
      const d = p.distanceTo(playerPos);
      if (d < 0.8) {
        this.alive[i] = false;
        this.remaining--;
        got.push(i);
      } else if (d < magnetRadius) {
        p.lerp(playerPos.clone().add(new THREE.Vector3(0, 0.6, 0)), 0.18);
        this.baseY[i] = p.y - 0.35;
      }
    }
    this.refresh(t);
    return got;
  }
}

/** A Star Fossil pickup: spinning star with sparkle ring. */
export class FossilPickup {
  readonly group = new THREE.Group();
  collected = false;

  constructor(scene: THREE.Object3D, public readonly fossilId: string, pos: THREE.Vector3) {
    const star = makeStarMesh('#FFE156', 0.55);
    this.group.add(star);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.05, 8, 24),
      toonMat('#FFF3B8', { emissive: '#FFE87F' }),
    );
    halo.rotation.x = Math.PI / 2;
    this.group.add(halo);
    this.group.position.copy(pos);
    scene.add(this.group);
  }

  update(t: number, playerPos: THREE.Vector3): boolean {
    if (this.collected) return false;
    this.group.rotation.y = t * 1.6;
    this.group.position.y += Math.sin(t * 2.2) * 0.0035;
    if (this.group.position.distanceTo(playerPos) < 1.1) {
      this.collected = true;
      this.group.visible = false;
      return true;
    }
    return false;
  }

  remove(): void { this.group.parent?.remove(this.group); }
}

export function makeStarMesh(color: string, size: number): THREE.Mesh {
  const shape = new THREE.Shape();
  const outer = size, inner = size * 0.45;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: size * 0.3, bevelEnabled: false });
  geo.center();
  const mesh = new THREE.Mesh(geo, toonMat(color, { emissive: color }));
  mesh.castShadow = true;
  return mesh;
}

export class HeartDrop {
  readonly mesh: THREE.Mesh;
  taken = false;
  private life = 12;

  constructor(scene: THREE.Object3D, pos: THREE.Vector3) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toonMat('#FF6B8A', { emissive: '#FF3B6B' }));
    this.mesh.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    this.mesh.scale.y = 1.2;
    scene.add(this.mesh);
  }

  /** @returns 'taken' | 'expired' | null */
  update(dt: number, t: number, playerPos: THREE.Vector3): 'taken' | 'expired' | null {
    if (this.taken) return null;
    this.life -= dt;
    this.mesh.position.y += Math.sin(t * 3) * 0.003;
    this.mesh.rotation.y = t * 2;
    if (this.life < 3) this.mesh.visible = Math.floor(t * 8) % 2 === 0;
    if (this.life <= 0) { this.taken = true; this.mesh.parent?.remove(this.mesh); return 'expired'; }
    if (this.mesh.position.distanceTo(playerPos) < 1) {
      this.taken = true;
      this.mesh.parent?.remove(this.mesh);
      return 'taken';
    }
    return null;
  }
}
