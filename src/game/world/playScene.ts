import * as THREE from 'three';
import type { Content, Strings } from '../../engine/loader';
import type { CapsuleMoveResult } from '../../engine/physics';
import type { Input } from '../../engine/input';
import type { AudioEngine } from '../../engine/audio';
import type { RendererSystem } from '../../engine/renderer';
import type { LevelDef } from '../../engine/types';
import { toonMat } from '../../engine/renderer';
import { buildLevel, type Breakable, type LevelBuild } from './levelBuilder';
import { ChipField } from './collectibles';
import { ParticleSystem } from '../actors/particles';
import { buildRig } from '../actors/rigs';
import { CameraRig } from '../player/camera';
import { Player, type CarryTarget, type CollisionWorld } from '../player/player';

export interface SceneServices {
  content: Content;
  strings: Strings;
  renderer: RendererSystem;
  input: Input;
  audio: AudioEngine;
}

interface Projectile {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  carried: CarryTarget;
}

interface SpringPad {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  power: number;
  anim: number;
}

/**
 * A running level: builds geometry, owns the player/camera/particles/pickups,
 * and implements the combined collision world (static + movers + breakables).
 * Later phases extend it with NPCs, tasks, and combat via dedicated modules.
 */
export class PlayScene implements CollisionWorld {
  readonly def: LevelDef;
  readonly build: LevelBuild;
  readonly player: Player;
  readonly cameraRig: CameraRig;
  readonly particles: ParticleSystem;
  readonly chips: ChipField;
  private projectiles: Projectile[] = [];
  private crates: { target: CarryTarget; free: boolean }[] = [];
  private springPads: SpringPad[] = [];
  private checkpoint: THREE.Vector3;
  private time = 0;
  chipsCollected = 0;
  /** Chip indices collected in this level (persisted by the session layer). */
  readonly collectedChipIndices = new Set<number>();
  onChipCollected: ((total: number) => void) | null = null;
  onPlayerDizzy: (() => void) | null = null;

  constructor(protected s: SceneServices, levelId: string) {
    const def = s.content.levels[levelId];
    if (!def) throw new Error(`unknown level '${levelId}'`);
    this.def = def;

    this.build = buildLevel(def);
    s.renderer.scene.add(this.build.group);
    s.renderer.applyPalette(def.palette);

    this.particles = new ParticleSystem(s.renderer.scene);
    this.chips = new ChipField(this.build.group, def.chips ?? [], this.collectedChipIndices);
    this.checkpoint = this.build.spawn.clone();

    // player
    const maxRig = buildRig(s.content.characters.max);
    s.renderer.scene.add(maxRig.root);
    s.renderer.addOutline(maxRig.root);
    this.player = new Player(
      s.content.config, maxRig, this, s.input,
      {
        getGrabTarget: (pos, fwd, range) => this.findGrabTarget(pos, fwd, range),
        onSpit: (origin, dir, carried) => this.spawnProjectile(origin, dir, carried),
        onStompLand: (pos) => this.handleStomp(pos),
        onSpinStart: () => { /* combat hooks arrive in P5 */ },
        onRoar: (pos) => this.handleRoar(pos),
        onFellOut: () => this.respawn(false),
        onDizzy: () => this.handleDizzy(),
        shake: (a) => s.renderer.shake(a),
      },
      this.particles, s.audio,
      s.content.config.difficulty.explorer.bonusHearts,
    );
    this.player.teleport(this.build.spawn, this.build.spawnYaw);

    this.cameraRig = new CameraRig(s.content.config.camera, s.renderer.camera, s.input);
    this.cameraRig.snapTo(this.build.spawn, this.build.spawnYaw + Math.PI);
    this.cameraRig.invertY = false;

    // spring pads
    for (const sp of def.springPads ?? []) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 0.25, 12), toonMat('#4E9A5E'));
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 10), toonMat('#7FE0A0', { emissive: '#3ECB70' }));
      coil.position.y = 0.35;
      g.add(base, coil);
      g.position.set(...sp.pos);
      this.build.group.add(g);
      this.springPads.push({ mesh: g, pos: new THREE.Vector3(...sp.pos), power: sp.power ?? 16, anim: 0 });
    }

    // crates (chompable props)
    for (const p of def.props ?? []) {
      if (p.type !== 'crate') continue;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), toonMat(p.color ?? '#B08850'));
      mesh.castShadow = true;
      mesh.position.set(p.pos[0], p.pos[1] + 0.35, p.pos[2]);
      this.build.group.add(mesh);
      const entry = {
        free: true,
        target: {
          root: mesh, kind: 'crate' as const,
          onPicked: () => { entry.free = false; },
        },
      };
      this.crates.push(entry);
    }

    const music = s.content.music[def.music];
    if (music) s.audio.playMusic(music);
  }

  // ---------------- CollisionWorld ----------------
  moveCapsule(pos: THREE.Vector3, radius: number, height: number, delta: THREE.Vector3): CapsuleMoveResult & { moverId?: number } {
    // carry from the mover we stood on last frame
    if (this.player && this.player.moverId >= 0) {
      const m = this.build.movers[this.player.moverId];
      if (m) delta.add(m.carry(pos));
    }
    const res = this.build.staticWorld.moveCapsule(pos, radius, height, delta) as CapsuleMoveResult & { moverId?: number };
    let standing = -1;
    for (const m of this.build.movers) {
      if (m.collide(res.position, radius, height, res)) standing = m.id;
    }
    for (const b of this.build.breakables) {
      if (b.broken) continue;
      collideAABB(res.position, radius, height, b.mesh.position, b.half, res);
    }
    res.moverId = standing;
    // conveyor surface velocity
    if (standing >= 0) {
      this.player.surfaceVelocity.copy(this.build.movers[standing].surfaceVelocity());
    } else {
      this.player.surfaceVelocity.set(0, 0, 0);
    }
    return res;
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Intersection | null {
    return this.build.staticWorld.raycast(origin, dir, far);
  }

  // ---------------- gameplay handlers ----------------
  private findGrabTarget(pos: THREE.Vector3, fwd: THREE.Vector3, range: number): CarryTarget | null {
    let best: CarryTarget | null = null;
    let bestD = range + 0.4;
    const probe = pos.clone().addScaledVector(fwd, range * 0.6);
    for (const c of this.crates) {
      if (!c.free) continue;
      const d = c.target.root.position.distanceTo(probe);
      if (d < bestD) { bestD = d; best = c.target; }
    }
    return best ?? this.extraGrabTarget(pos, fwd, range);
  }

  /** Overridden by later phases (task items, chompable enemies). */
  protected extraGrabTarget(_pos: THREE.Vector3, _fwd: THREE.Vector3, _range: number): CarryTarget | null {
    return null;
  }

  private spawnProjectile(origin: THREE.Vector3, dir: THREE.Vector3, carried: CarryTarget): void {
    this.s.renderer.scene.add(carried.root);
    carried.root.position.copy(origin);
    this.projectiles.push({
      mesh: carried.root,
      vel: dir.clone().multiplyScalar(this.s.content.config.player.spitSpeed),
      life: 3,
      carried,
    });
  }

  protected handleStomp(pos: THREE.Vector3): void {
    const r = this.s.content.config.player.stompRadius;
    for (const b of this.build.breakables) {
      if (b.broken || b.kind !== 'cracked') continue;
      if (b.mesh.position.distanceTo(pos) < r + Math.max(b.half.x, b.half.z)) this.breakBlock(b);
    }
  }

  protected handleRoar(pos: THREE.Vector3): void {
    const r = this.s.content.config.player.roarRadius;
    this.particles.ring(pos, '#BFE3FF', r * 0.5, 32);
    for (const b of this.build.breakables) {
      if (b.broken || b.kind !== 'roarwall') continue;
      if (b.mesh.position.distanceTo(pos) < r + Math.max(b.half.x, b.half.z)) this.breakBlock(b);
    }
  }

  private breakBlock(b: Breakable): void {
    b.broken = true;
    this.particles.burst(b.mesh.position, '#C8A868', 22, 5);
    this.s.audio.sfx('stomp');
    this.build.group.remove(b.mesh);
    if (b.contains === 'chips') {
      // little celebration: instant chips
      for (let i = 0; i < 3; i++) this.collectChip();
      this.particles.burst(b.mesh.position, '#FFB13B', 12, 4);
      this.s.audio.sfx('chip');
    }
  }

  private handleDizzy(): void {
    this.s.audio.sfx('stun');
    this.onPlayerDizzy?.();
    setTimeout(() => this.respawn(true), 1600);
  }

  protected respawn(fromDizzy: boolean): void {
    this.player.revive(this.checkpoint.clone().add(new THREE.Vector3(0, 0.5, 0)));
    if (!fromDizzy) this.s.renderer.shake(0.2);
  }

  private collectChip(): void {
    this.chipsCollected++;
    this.onChipCollected?.(this.chipsCollected);
  }

  // ---------------- frame ----------------
  update(dt: number): void {
    this.time += dt;
    for (const m of this.build.movers) m.update(dt);
    this.player.update(dt, this.cameraRig.moveYaw);
    this.cameraRig.update(dt, this.player.pos, this.build.staticWorld, this.player.facing);
    this.s.renderer.focusShadows(this.player.pos);

    // chips
    const got = this.chips.update(this.time, this.player.pos, this.s.content.config.economy.chipMagnetRadius);
    for (const i of got) {
      this.collectedChipIndices.add(i);
      this.collectChip();
      this.s.audio.sfx('chip');
      this.particles.sparkle(this.player.pos, '#FFB13B', 3);
    }

    // checkpoints: nearest visited
    for (const c of this.def.checkpoints ?? []) {
      const p = new THREE.Vector3(...c);
      if (p.distanceToSquared(this.player.pos) < 4 && !p.equals(this.checkpoint)) {
        this.checkpoint = p;
      }
    }

    // spring pads
    for (const sp of this.springPads) {
      sp.anim = Math.max(0, sp.anim - dt * 3);
      sp.mesh.scale.y = 1 - sp.anim * 0.4;
      const d2 = this.player.pos.distanceToSquared(sp.pos);
      if (d2 < 1.2 && this.player.pos.y < sp.pos.y + 0.9 && this.player.vel.y <= 0.1) {
        this.player.launch(sp.power);
        sp.anim = 1;
        this.particles.ring(sp.pos, '#7FE0A0', 1, 14);
      }
    }

    // projectiles (spat crates etc.)
    for (const pr of [...this.projectiles]) {
      pr.vel.y -= this.s.content.config.player.gravity * 0.7 * dt;
      const from = pr.mesh.position.clone();
      const step = pr.vel.clone().multiplyScalar(dt);
      const hit = this.build.staticWorld.raycast(from, step.clone().normalize(), step.length() + 0.3);
      pr.mesh.position.add(step);
      pr.life -= dt;
      if (hit || pr.life <= 0) {
        this.particles.dust(pr.mesh.position, 4);
        this.projectileLanded(pr, hit);
        if (pr.carried.kind === 'crate') {
          if (hit) pr.mesh.position.copy(hit.point).add(new THREE.Vector3(0, 0.35, 0));
          const entry = this.crates.find((c) => c.target.root === pr.mesh);
          if (entry) entry.free = true;
        } else {
          pr.mesh.parent?.remove(pr.mesh);
        }
        this.projectiles.splice(this.projectiles.indexOf(pr), 1);
      }
    }

    this.updateExtras(dt);
    this.particles.update(dt);
  }

  /** Overridden by later phases (NPCs, tasks, enemies, hazards). */
  protected updateExtras(_dt: number): void { /* base scene has none */ }
  protected projectileLanded(_pr: { mesh: THREE.Object3D; carried: CarryTarget }, _hit: THREE.Intersection | null): void { /* combat uses this */ }

  dispose(): void {
    this.s.renderer.scene.remove(this.build.group);
    this.s.renderer.scene.remove(this.player.rig.root);
    this.s.renderer.clearOutlines();
    this.build.staticWorld.dispose();
    this.particles.dispose();
    this.s.audio.stopMusic();
  }
}

/** AABB vs capsule pushout (breakable blocks). */
export function collideAABB(
  pos: THREE.Vector3, radius: number, height: number,
  center: THREE.Vector3, half: THREE.Vector3, res: CapsuleMoveResult,
): void {
  const ex = half.x + radius, ez = half.z + radius;
  const dx = pos.x - center.x, dz = pos.z - center.z;
  const top = center.y + half.y, bottom = center.y - half.y;
  if (Math.abs(dx) < ex && Math.abs(dz) < ez && pos.y < top && pos.y + height > bottom) {
    const pushUp = top - pos.y;
    const pushDown = pos.y + height - bottom;
    const pushX = ex - Math.abs(dx);
    const pushZ = ez - Math.abs(dz);
    const min = Math.min(pushUp, pushX, pushZ, pushDown);
    if (min === pushUp && pushUp < 0.55) {
      pos.y = top; res.grounded = true; res.groundNormal.set(0, 1, 0);
    } else if (min === pushX) {
      pos.x = center.x + Math.sign(dx) * ex; res.hitWall = true;
    } else if (min === pushZ) {
      pos.z = center.z + Math.sign(dz) * ez; res.hitWall = true;
    } else {
      pos.y = bottom - height; res.hitCeiling = true;
    }
  }
}
