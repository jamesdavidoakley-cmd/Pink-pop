import * as THREE from 'three';
import type { Content } from '../../engine/loader';
import { buildRig, type Rig } from '../actors/rigs';
import type { StaticWorld } from '../../engine/physics';

/**
 * Kenji, Marcus, and Digger travel with Max: follow slots behind the player,
 * catch-up teleports, talk gestures when speaking, Digger's secret sniffing.
 */

const SLOT_OFFSETS: Record<string, [number, number]> = {
  kenji: [-1.6, -1.9],
  marcus: [1.7, -2.1],
  digger: [0.2, -3.0],
};

export class CompanionActor {
  readonly rig: Rig;
  readonly pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private facing = 0;
  private talking = false;
  private time = Math.random() * 10;
  private bobble = 0;

  constructor(public readonly id: string, content: Content, scene: THREE.Object3D, spawn: THREE.Vector3) {
    this.rig = buildRig(content.characters[id]);
    this.pos.copy(spawn);
    this.rig.root.position.copy(spawn);
    scene.add(this.rig.root);
  }

  setTalking(on: boolean): void {
    this.talking = on;
    this.rig.setExpression(on ? 'happy' : 'neutral');
  }

  /** Face a world point (used while speaking to Max). */
  face(target: THREE.Vector3): void {
    const d = new THREE.Vector3().subVectors(target, this.pos);
    if (d.lengthSq() > 0.01) this.facing = Math.atan2(d.x, d.z);
  }

  update(dt: number, playerPos: THREE.Vector3, playerFacing: number, world: StaticWorld | null, catchUpDist: number): void {
    this.time += dt;
    const [ox, oz] = SLOT_OFFSETS[this.id] ?? [0, -2.5];
    // slot behind the player, rotated by player facing
    const sin = Math.sin(playerFacing), cos = Math.cos(playerFacing);
    const slot = new THREE.Vector3(
      playerPos.x + ox * cos + oz * sin,
      playerPos.y,
      playerPos.z - ox * sin + oz * cos,
    );
    const toSlot = new THREE.Vector3().subVectors(slot, this.pos);
    toSlot.y = 0;
    const dist = toSlot.length();

    if (dist > catchUpDist) {
      this.pos.copy(slot);
      this.vel.set(0, 0, 0);
    } else if (dist > 0.6 && !this.talking) {
      const speed = Math.min(9, 2.5 + dist * 1.6);
      toSlot.normalize();
      this.vel.x = toSlot.x * speed;
      this.vel.z = toSlot.z * speed;
      this.facing = Math.atan2(toSlot.x, toSlot.z);
    } else {
      this.vel.x *= Math.max(0, 1 - dt * 8);
      this.vel.z *= Math.max(0, 1 - dt * 8);
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // stick to the ground (simple ray snap — companions are narrative, not physical)
    if (world) {
      const hit = world.raycast(this.pos.clone().add(new THREE.Vector3(0, 3, 0)), new THREE.Vector3(0, -1, 0), 12);
      if (hit) this.pos.y = THREE.MathUtils.damp(this.pos.y, hit.point.y, 12, dt);
    } else {
      this.pos.y = THREE.MathUtils.damp(this.pos.y, playerPos.y, 8, dt);
    }

    this.bobble = Math.max(0, this.bobble - dt);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    const speed01 = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 6);
    const mode = this.talking ? 'talk' : speed01 > 0.12 ? 'run' : 'idle';
    this.rig.update({ mode, speed01: Math.max(speed01, 0.4) }, this.time, dt);
  }
}

export class CompanionParty {
  readonly actors: CompanionActor[] = [];

  constructor(content: Content, scene: THREE.Object3D, spawn: THREE.Vector3, ids: string[]) {
    for (const id of ids) {
      if (content.characters[id]?.active) {
        const jitter = new THREE.Vector3((Math.random() - 0.5) * 2, 0, -2 - Math.random());
        this.actors.push(new CompanionActor(id, content, scene, spawn.clone().add(jitter)));
      }
    }
  }

  byId(id: string): CompanionActor | undefined {
    return this.actors.find((a) => a.id === id);
  }

  ids(): string[] { return this.actors.map((a) => a.id); }

  update(dt: number, playerPos: THREE.Vector3, playerFacing: number, world: StaticWorld | null, catchUp: number): void {
    for (const a of this.actors) a.update(dt, playerPos, playerFacing, world, catchUp);
  }
}
