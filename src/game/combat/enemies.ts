import * as THREE from 'three';
import type { Content } from '../../engine/loader';
import type { EnemyDef } from '../../engine/types';
import { buildRig, type Rig } from '../actors/rigs';
import { toonMat } from '../../engine/renderer';
import type { CharacterDef } from '../../engine/types';

/**
 * The Clockwork Legion (§6.2): data-driven archetypes with spawn-time trait
 * noise (±0.15) so no two individuals act identically. Every attack telegraphs
 * ≥0.6 s with paired flash AND audio (never colour-only). Defeated Coglings
 * pop into gears and dizzy stars — bonked, never killed.
 */

export type EnemyState = 'idle' | 'aggro' | 'telegraph' | 'attack' | 'recover' | 'flee' | 'dizzy' | 'stunned' | 'done';

export interface EnemyHost {
  playerPos(): THREE.Vector3;
  damagePlayer(amount: number, from: THREE.Vector3): void;
  spawnBolt(from: THREE.Vector3, dir: THREE.Vector3, damage: number): void;
  onDefeated(e: EnemyActor): void;
  telegraphCue(): void;
  alertAllies(from: EnemyActor, radius: number): void;
  groundHeight(x: number, z: number): number;
}

let enemySeq = 0;

export class EnemyActor {
  readonly id = enemySeq++;
  readonly rig: Rig;
  readonly pos: THREE.Vector3;
  readonly home: THREE.Vector3;
  hp: number;
  state: EnemyState = 'idle';
  private stateT = 0;
  private cooldown = 1 + Math.random();
  private facing = Math.random() * Math.PI * 2;
  private traits: Record<string, number> = {};
  private time = Math.random() * 10;
  private hitFlash = 0;
  stunned = 0;
  private telegraphFlash: THREE.Mesh;
  private patrolAngle = Math.random() * Math.PI * 2;

  constructor(
    readonly def: EnemyDef,
    spawn: THREE.Vector3,
    private host: EnemyHost,
    scene: THREE.Object3D,
    readonly patrolRadius = 3,
  ) {
    this.hp = def.hp;
    this.pos = spawn.clone();
    this.home = spawn.clone();
    const charDef: CharacterDef = {
      name: def.name, role: 'prop', active: true, rig: 'cogling',
      scale: def.scale ?? 1,
      colors: def.colors ?? { body: '#8A8A96', belly: '#B8B8C8', accent: '#5A5A68' },
      subtitleColor: '#FFFFFF',
      voice: { rate: 1, pitch: 1 },
    };
    this.rig = buildRig(charDef);
    this.rig.root.position.copy(spawn);
    scene.add(this.rig.root);
    // spawn-time personality noise: ±traitNoise per §6.2
    const noise = def.traitNoise ?? 0.15;
    for (const [k, v] of Object.entries(def.traits ?? {})) {
      this.traits[k] = Math.max(0, Math.min(1, v + (Math.random() * 2 - 1) * noise));
    }
    // telegraph flash: a bright warning shell (shape + the audio cue = never colour-only)
    this.telegraphFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.62 * (def.scale ?? 1), 10, 8),
      new THREE.MeshBasicMaterial({ color: '#FFE14A', transparent: true, opacity: 0 }),
    );
    this.telegraphFlash.position.y = 0.45 * (def.scale ?? 1);
    this.rig.root.add(this.telegraphFlash);
  }

  get alive(): boolean { return this.state !== 'done'; }
  get chompable(): boolean { return !!this.def.chompable && (this.stunned > 0 || this.state === 'dizzy'); }

  /** Player attack lands. Returns true if it connected. */
  takeDamage(amount: number, from: THREE.Vector3): boolean {
    if (!this.alive || this.hitFlash > 0.2) return false;
    this.hp -= amount;
    this.hitFlash = 0.35;
    const away = this.pos.clone().sub(from).setY(0).normalize().multiplyScalar(2.2);
    this.pos.add(away);
    if (this.hp <= 0) {
      this.state = 'done';
      this.host.onDefeated(this);
      this.rig.root.parent?.remove(this.rig.root);
      return true;
    }
    // scouts run and tell their friends
    if (this.def.behavior === 'scout' && this.hp / this.def.hp <= (this.def.fleeBelowHp ?? 0)) {
      this.state = 'flee';
      this.stateT = 3.5;
      this.host.alertAllies(this, this.def.alertRadius ?? 10);
    }
    return true;
  }

  stun(seconds: number): void {
    if (!this.alive) return;
    this.stunned = seconds;
    this.state = 'stunned';
  }

  update(dt: number, frozen: boolean): void {
    if (!this.alive) return;
    this.time += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (frozen) { this.syncRig(dt, 0); return; }
    this.stunned = Math.max(0, this.stunned - dt);
    if (this.stunned > 0) { this.state = 'stunned'; this.syncRig(dt, 0); return; }
    if (this.state === 'stunned') this.state = 'idle';
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.stateT = Math.max(0, this.stateT - dt);

    const player = this.host.playerPos();
    const dist = this.pos.distanceTo(player);
    const aggro = this.def.aggroRadius ?? 9;
    let moveSpeed = 0;

    switch (this.state) {
      case 'idle': {
        // gentle patrol around home
        this.patrolAngle += dt * 0.5;
        const target = this.home.clone().add(new THREE.Vector3(Math.cos(this.patrolAngle), 0, Math.sin(this.patrolAngle)).multiplyScalar(this.patrolRadius));
        moveSpeed = this.stepToward(target, dt, this.def.speed * 0.35);
        if (dist < aggro) this.state = 'aggro';
        break;
      }
      case 'aggro': {
        const b = this.def.behavior;
        if (b === 'scout') {
          // keep distance, pepper with bolts
          const want = (this.def.attack.range ?? 8) * 0.75;
          const dir = this.pos.clone().sub(player).setY(0).normalize();
          const target = player.clone().addScaledVector(dir, want);
          moveSpeed = this.stepToward(target, dt, this.def.speed);
          this.face(player);
          if (this.cooldown <= 0 && dist < (this.def.attack.range ?? 9)) this.beginTelegraph();
        } else if (b === 'brute') {
          moveSpeed = this.stepToward(player, dt, this.def.speed);
          this.face(player);
          if (this.cooldown <= 0 && dist < (this.def.attack.range ?? 2) + 0.4) this.beginTelegraph();
        } else if (b === 'tinkerer') {
          // hide from the player, repair hurt allies (priority-target lesson)
          const dir = this.pos.clone().sub(player).setY(0).normalize();
          moveSpeed = this.stepToward(this.pos.clone().addScaledVector(dir, 3), dt, this.def.speed);
          if (this.cooldown <= 0) this.beginTelegraph();
        } else if (b === 'buzzer') {
          // predictable loops, then a dive
          this.patrolAngle += dt * 1.6;
          const orbit = player.clone().add(new THREE.Vector3(Math.cos(this.patrolAngle), 0, Math.sin(this.patrolAngle)).multiplyScalar(5));
          moveSpeed = this.stepToward(orbit, dt, this.def.speed);
          this.face(player);
          if (this.cooldown <= 0) this.beginTelegraph();
        }
        if (dist > aggro * 1.6) this.state = 'idle';
        break;
      }
      case 'telegraph': {
        this.face(player);
        const t = this.def.attack.telegraph - this.stateT;
        this.telegraphFlash.visible = true;
        (this.telegraphFlash.material as THREE.MeshBasicMaterial).opacity =
          0.22 + 0.22 * Math.sin(t * 18);
        if (this.stateT <= 0) {
          (this.telegraphFlash.material as THREE.MeshBasicMaterial).opacity = 0;
          this.executeAttack(player, dist);
        }
        break;
      }
      case 'attack': {
        if (this.def.attack.kind === 'charge') {
          moveSpeed = this.stepToward(player, dt, this.def.speed * 2.2);
          if (dist < 1.1) {
            this.host.damagePlayer(this.def.attack.damage, this.pos);
            this.state = 'recover';
            this.stateT = 0.8;
          }
        }
        if (this.stateT <= 0) { this.state = 'recover'; this.stateT = 0.7; }
        break;
      }
      case 'recover':
        if (this.stateT <= 0) this.state = 'aggro';
        break;
      case 'dizzy':
        if (this.stateT <= 0) this.state = 'aggro';
        break;
      case 'flee': {
        const dir = this.pos.clone().sub(player).setY(0).normalize();
        moveSpeed = this.stepToward(this.pos.clone().addScaledVector(dir, 4), dt, this.def.speed * 1.3);
        if (this.stateT <= 0) this.state = 'aggro';
        break;
      }
      default: break;
    }

    this.pos.y = this.host.groundHeight(this.pos.x, this.pos.z);
    this.syncRig(dt, moveSpeed);
  }

  private beginTelegraph(): void {
    this.state = 'telegraph';
    this.stateT = this.def.attack.telegraph;
    this.host.telegraphCue();
  }

  private executeAttack(player: THREE.Vector3, dist: number): void {
    const atk = this.def.attack;
    switch (atk.kind) {
      case 'projectile': {
        const from = this.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
        const dir = player.clone().add(new THREE.Vector3(0, 0.7, 0)).sub(from).normalize();
        this.host.spawnBolt(from, dir, atk.damage);
        this.state = 'recover';
        this.stateT = 0.6;
        break;
      }
      case 'melee': {
        if (dist < (atk.range ?? 2) + 0.6) {
          this.host.damagePlayer(atk.damage, this.pos);
          this.state = 'recover';
          this.stateT = 0.7;
        } else if (atk.dizzyOnMiss) {
          // the punish window: big swing, big whiff, big wobble
          this.state = 'dizzy';
          this.stateT = atk.dizzyOnMiss;
        } else {
          this.state = 'recover';
          this.stateT = 0.7;
        }
        break;
      }
      case 'charge':
        this.state = 'attack';
        this.stateT = 1.4;
        break;
      case 'repair':
        this.state = 'recover';
        this.stateT = 0.5;
        this.repairRequested = true;
        break;
    }
    this.cooldown = this.def.attack.cooldown;
  }

  repairRequested = false;

  heal(n: number): void {
    this.hp = Math.min(this.def.hp, this.hp + n);
  }

  private stepToward(target: THREE.Vector3, dt: number, speed: number): number {
    const d = target.clone().sub(this.pos).setY(0);
    const len = d.length();
    if (len < 0.15) return 0;
    d.normalize();
    this.pos.addScaledVector(d, Math.min(len, speed * dt));
    this.facing = Math.atan2(d.x, d.z);
    return speed;
  }

  private face(target: THREE.Vector3): void {
    const d = target.clone().sub(this.pos);
    this.facing = Math.atan2(d.x, d.z);
  }

  private syncRig(dt: number, moveSpeed: number): void {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    const body = this.rig.parts.body;
    if (this.hitFlash > 0) body?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) m.material = toonMat('#FFFFFF');
    });
    const mode = this.state === 'dizzy' || this.state === 'stunned' ? 'dizzy'
      : this.state === 'flee' ? 'flee'
      : this.state === 'telegraph' ? 'attack'
      : moveSpeed > 0.5 ? 'run' : 'idle';
    this.rig.update({
      mode,
      speed01: Math.min(1, moveSpeed / this.def.speed),
      attackT: this.state === 'telegraph' ? 1 - this.stateT / this.def.attack.telegraph : 0,
      teleFrac: 0.99,
    }, this.time, dt);
  }
}

/** Spawns + updates a level's enemies; handles tinkerer repairs. */
export class EnemyManager {
  readonly enemies: EnemyActor[] = [];

  constructor(private content: Content) {}

  spawnFromLevel(defs: { archetype: string; pos: [number, number, number]; patrolRadius?: number }[], host: EnemyHost, scene: THREE.Object3D): void {
    for (const e of defs) {
      const def = this.content.enemies[e.archetype];
      if (!def) continue;
      this.enemies.push(new EnemyActor(def, new THREE.Vector3(...e.pos), host, scene, e.patrolRadius ?? 3));
    }
  }

  spawn(archetype: string, pos: THREE.Vector3, host: EnemyHost, scene: THREE.Object3D): EnemyActor | null {
    const def = this.content.enemies[archetype];
    if (!def) return null;
    const actor = new EnemyActor(def, pos, host, scene, 2);
    this.enemies.push(actor);
    return actor;
  }

  get aliveCount(): number { return this.enemies.filter((e) => e.alive).length; }

  update(dt: number, frozen: boolean): void {
    for (const e of this.enemies) {
      e.update(dt, frozen);
      if (e.repairRequested) {
        e.repairRequested = false;
        // tinkerers patch their most damaged friend
        const hurt = this.enemies
          .filter((x) => x.alive && x !== e && x.hp < x.def.hp)
          .sort((a, b) => a.hp / a.def.hp - b.hp / b.def.hp)[0];
        if (hurt && hurt.pos.distanceTo(e.pos) < (e.def.attack.range ?? 6)) hurt.heal(1);
      }
    }
  }

  dispose(): void {
    for (const e of this.enemies) e.rig.root.parent?.remove(e.rig.root);
    this.enemies.length = 0;
  }
}
