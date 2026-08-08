import * as THREE from 'three';
import type { CapsuleMoveResult } from '../../engine/physics';
import type { GameConfig } from '../../engine/types';
import type { Input } from '../../engine/input';
import type { AudioEngine } from '../../engine/audio';
import type { ParticleSystem } from '../actors/particles';
import type { Rig } from '../actors/rigs';
import { JumpLogic, jumpVelocityFor } from './jumpLogic';

/** Combined collision surface (static world + movers), provided by the scene. */
export interface CollisionWorld {
  moveCapsule(pos: THREE.Vector3, radius: number, height: number, delta: THREE.Vector3): CapsuleMoveResult & { moverId?: number };
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Intersection | null;
}

export interface CarryTarget {
  root: THREE.Object3D;
  kind: 'crate' | 'enemy' | 'item';
  id?: string;
  onPicked?: () => void;
}

export interface PlayerHooks {
  getGrabTarget(pos: THREE.Vector3, forward: THREE.Vector3, range: number): CarryTarget | null;
  onSpit(origin: THREE.Vector3, dir: THREE.Vector3, carried: CarryTarget): void;
  onStompLand(pos: THREE.Vector3): void;
  onSpinStart(): void;
  onRoar(pos: THREE.Vector3): void;
  onFellOut(): void;
  onDizzy(): void;
  shake(amount: number): void;
}

export type PlayerState = 'normal' | 'spin' | 'stompHop' | 'stompFall' | 'hang' | 'dizzy' | 'locked';

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  state: PlayerState = 'normal';
  facing = 0;
  grounded = false;
  groundNormal = new THREE.Vector3(0, 1, 0);

  hearts: number;
  maxHearts: number;
  brainSegments = 0;
  iFrames = 0;

  carried: CarryTarget | null = null;

  private jump: JumpLogic;
  private jumpVel: number;
  private doubleVel: number;
  private spinT = 0;
  private spinCooldown = 0;
  private stompT = 0;
  private roarCharge = 0;
  private dizzyT = 0;
  private squash = 1;      // 1 = neutral; <1 squashed; >1 stretched
  private squashVel = 0;
  private stepAccum = 0;
  private knockback = new THREE.Vector3();
  private wasGrounded = true;
  private fallPeak = 0;
  private carryAnchor = new THREE.Group();
  private time = 0;
  /** Set by the scene when standing on a conveyor. */
  surfaceVelocity = new THREE.Vector3();
  moverId = -1;

  constructor(
    private cfg: GameConfig,
    public rig: Rig,
    private world: CollisionWorld,
    private input: Input,
    private hooks: PlayerHooks,
    private particles: ParticleSystem,
    private audio: AudioEngine,
    bonusHearts = 1,
  ) {
    const p = cfg.player;
    this.maxHearts = p.maxHearts + bonusHearts;
    this.hearts = this.maxHearts;
    this.jumpVel = jumpVelocityFor(p.gravity, p.jumpHeight);
    this.doubleVel = jumpVelocityFor(p.gravity, p.doubleJumpHeight);
    this.jump = new JumpLogic({
      coyoteTime: p.coyoteTime, jumpBuffer: p.jumpBuffer,
      jumpVelocity: this.jumpVel, doubleJumpVelocity: this.doubleVel,
      variableJumpCut: p.variableJumpCut,
    });
    this.carryAnchor.position.set(0, this.rig.height + 0.25, 0);
    this.rig.root.add(this.carryAnchor);
  }

  get spinning(): boolean { return this.state === 'spin'; }
  get stomping(): boolean { return this.state === 'stompFall'; }
  get roaring(): boolean { return this.roarCharge < 0; }

  teleport(pos: THREE.Vector3, yaw = 0): void {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.facing = yaw;
    this.state = 'normal';
    this.rig.root.position.copy(pos);
    this.rig.root.rotation.y = yaw;
  }

  /** External vertical launch (spring pads, updrafts): keeps double jump. */
  launch(vy: number): void {
    this.vel.y = vy;
    this.grounded = false;
    this.jump.setAirborneWithJumps(1);
    this.squashVel = 6;
    this.audio.sfx('spring');
  }

  takeDamage(amount: number, from?: THREE.Vector3): boolean {
    if (this.iFrames > 0 || this.state === 'dizzy') return false;
    this.hearts = Math.max(0, this.hearts - amount);
    this.iFrames = this.cfg.player.iFramesSeconds;
    this.audio.sfx('hurt');
    this.hooks.shake(0.35);
    if (from) {
      this.knockback.subVectors(this.pos, from).setY(0);
      if (this.knockback.lengthSq() < 0.01) this.knockback.set(0, 0, 1);
      this.knockback.normalize().multiplyScalar(this.cfg.combat.knockback);
      this.knockback.y = 3.5;
    }
    if (this.hearts <= 0) {
      this.state = 'dizzy';
      this.dizzyT = 2.2;
      this.hooks.onDizzy();
    }
    return true;
  }

  heal(amount: number): void {
    this.hearts = Math.min(this.maxHearts, this.hearts + amount);
    this.audio.sfx('heart');
  }

  addBrain(n = 1): boolean {
    const before = this.brainSegments;
    this.brainSegments = Math.min(this.cfg.economy.brainSegments, this.brainSegments + n);
    return this.brainSegments !== before;
  }

  /** Recover from dizzy at a checkpoint (Digger dragged us back). */
  revive(at: THREE.Vector3): void {
    this.teleport(at);
    this.hearts = this.maxHearts;
    this.iFrames = 1.2;
  }

  update(dt: number, camYaw: number): void {
    const p = this.cfg.player;
    this.time += dt;
    this.iFrames = Math.max(0, this.iFrames - dt);
    this.spinCooldown = Math.max(0, this.spinCooldown - dt);

    if (this.state === 'dizzy') {
      this.dizzyT -= dt;
      this.applyGravityAndMove(dt, new THREE.Vector3());
      this.syncRig(dt, 0);
      return;
    }
    if (this.state === 'locked') {
      this.vel.set(0, 0, 0);
      this.syncRig(dt, 0);
      return;
    }
    if (this.state === 'hang') {
      this.updateHang();
      this.syncRig(dt, 0);
      return;
    }

    // ---- intent
    const mv = this.input.moveVector();
    const wish = new THREE.Vector3(mv.x, 0, mv.y);
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 0.01) wish.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);
    else wish.set(0, 0, 0);

    // ---- states
    if (this.state === 'spin') {
      this.spinT -= dt;
      if (this.spinT <= 0) { this.state = 'normal'; this.spinCooldown = p.spinCooldown; }
    }
    if (this.state === 'stompHop') {
      this.stompT -= dt;
      this.vel.x = 0; this.vel.z = 0;
      if (this.stompT <= 0) { this.state = 'stompFall'; this.vel.y = -p.stompSpeed; }
    } else if (this.state === 'stompFall') {
      this.vel.y = -p.stompSpeed;
    }

    // ---- actions
    const canAct = this.state === 'normal' || this.state === 'spin';
    // Spin / roar (hold with full brain)
    if (canAct) {
      if (this.input.held('spin') && this.brainSegments >= this.cfg.economy.brainSegments) {
        this.roarCharge += dt;
        if (this.roarCharge >= p.roarChargeTime) {
          this.roarCharge = 0;
          this.brainSegments = 0;
          this.audio.sfx('roar');
          this.hooks.onRoar(this.pos);
          this.hooks.shake(0.5);
          this.squashVel = 8;
        }
      } else {
        if (this.input.pressed('spin') && this.state === 'normal' && this.spinCooldown <= 0) {
          this.state = 'spin';
          this.spinT = p.spinDuration;
          this.audio.sfx('spin');
          this.hooks.onSpinStart();
        }
        this.roarCharge = 0;
      }
      // Stomp
      if (this.input.pressed('stomp') && !this.grounded && this.state === 'normal') {
        this.state = 'stompHop';
        this.stompT = p.stompHopTime;
        this.vel.set(0, 3.5, 0);
      }
      // Chomp: grab / spit
      if (this.input.pressed('chomp')) {
        if (this.carried) this.spit();
        else this.tryGrab();
      }
    }

    // ---- jumping
    const jumpEvent = this.state === 'normal' || this.state === 'spin'
      ? this.jump.update(dt, this.grounded, this.input.pressed('jump'))
      : null;
    if (jumpEvent === 'jump') {
      this.vel.y = this.jumpVel;
      this.audio.sfx('jump');
      this.squashVel = 5;
      this.particles.dust(this.pos, 4);
    } else if (jumpEvent === 'double') {
      this.vel.y = this.doubleVel;
      this.audio.sfx('doubleJump');
      this.squashVel = 5;
      this.particles.ring(this.pos, '#BFE3FF', 0.8, 10);
    }
    if (!this.input.held('jump') && this.vel.y > 0 && this.state === 'normal') {
      this.vel.y *= this.jump.onJumpReleased(this.vel.y);
    }
    if (this.vel.y <= 0) this.jump.notifyFalling();

    // ---- horizontal movement
    const speedTarget = p.runSpeed * wishLen * (this.state === 'spin' ? 0.75 : 1);
    const accel = (p.runSpeed / p.accelTime) * (this.grounded ? 1 : p.airControl);
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const targetV = wish.clone().multiplyScalar(speedTarget);
    const dv = targetV.sub(hv);
    const dvLen = dv.length();
    if (dvLen > 0.0001) {
      const step = Math.min(dvLen, accel * dt);
      hv.addScaledVector(dv.normalize(), step);
    }
    this.vel.x = hv.x; this.vel.z = hv.z;

    // Knockback decay
    this.vel.add(this.knockback);
    this.knockback.multiplyScalar(Math.max(0, 1 - dt * 6));
    if (this.knockback.lengthSq() < 0.05) this.knockback.set(0, 0, 0);

    this.applyGravityAndMove(dt, wish);

    // ---- ledge grab
    if (p.ledgeGrabEnabled && !this.grounded && this.vel.y < -1 && wishLen > 0.3 && this.state === 'normal') {
      this.tryLedgeGrab(wish);
    }

    // ---- facing + rig
    if (wishLen > 0.05 && this.state !== 'spin') {
      const targetYaw = Math.atan2(wish.x, wish.z);
      this.facing = lerpAngle(this.facing, targetYaw, Math.min(1, dt * 12));
    }
    this.syncRig(dt, wishLen);
  }

  private applyGravityAndMove(dt: number, _wish: THREE.Vector3): void {
    const p = this.cfg.player;
    if (this.state !== 'stompHop') this.vel.y -= p.gravity * dt;
    this.vel.y = Math.max(this.vel.y, -32);

    const delta = this.vel.clone().multiplyScalar(dt);
    delta.add(this.surfaceVelocity.clone().multiplyScalar(dt));
    const res = this.world.moveCapsule(this.pos, p.capsuleRadius, p.capsuleHeight, delta);
    this.pos.copy(res.position);
    this.moverId = res.moverId ?? -1;

    const wasFalling = this.vel.y < -3;
    if (!this.grounded) this.fallPeak = Math.max(this.fallPeak, -this.vel.y);
    this.grounded = res.grounded;
    this.groundNormal.copy(res.groundNormal);

    if (res.grounded) {
      if (this.state === 'stompFall') {
        this.state = 'normal';
        this.audio.sfx('stomp');
        this.hooks.onStompLand(this.pos);
        this.hooks.shake(0.3);
        this.particles.ring(this.pos, '#E8D8B0', this.cfg.player.stompRadius, 20);
        this.squash = 0.72;
      } else if (!this.wasGrounded && wasFalling) {
        this.audio.sfx('land');
        this.particles.dust(this.pos, this.fallPeak > 14 ? 8 : 4);
        this.squash = this.fallPeak > 14 ? 0.75 : 0.85;
      }
      if (this.vel.y < 0) this.vel.y = -0.5;
      this.fallPeak = 0;

      // Slope slide: steep ground pushes Max downhill.
      const angle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(res.groundNormal.y, -1, 1)));
      if (angle > this.cfg.player.slopeSlideAngle) {
        const downhill = new THREE.Vector3(res.groundNormal.x, 0, res.groundNormal.z).normalize();
        this.vel.addScaledVector(downhill, this.cfg.player.gravity * 0.55 * dt * 2);
      }
    } else if (res.hitCeiling && this.vel.y > 0) {
      this.vel.y = 0;
    }
    this.wasGrounded = this.grounded;

    if (this.pos.y < this.cfg.player.fallRespawnY) this.hooks.onFellOut();
  }

  private tryLedgeGrab(wish: THREE.Vector3): void {
    const p = this.cfg.player;
    const dir = wish.clone().normalize();
    const chest = this.pos.clone().add(new THREE.Vector3(0, p.capsuleHeight * 0.7, 0));
    const wallHit = this.world.raycast(chest, dir, p.capsuleRadius + 0.35);
    if (!wallHit) return;
    const headOrigin = this.pos.clone().add(new THREE.Vector3(0, p.capsuleHeight + 0.45, 0));
    if (this.world.raycast(headOrigin, dir, p.capsuleRadius + 0.5)) return; // wall continues above
    // Find the ledge top surface just past the wall edge
    const over = headOrigin.clone().addScaledVector(dir, p.capsuleRadius + 0.35);
    const topHit = this.world.raycast(over, new THREE.Vector3(0, -1, 0), 1.0);
    if (!topHit) return;
    this.state = 'hang';
    this.vel.set(0, 0, 0);
    this.hangLedge = { point: topHit.point.clone(), dir: dir.clone() };
    this.facing = Math.atan2(dir.x, dir.z);
  }

  private hangLedge: { point: THREE.Vector3; dir: THREE.Vector3 } | null = null;

  private updateHang(): void {
    if (!this.hangLedge) { this.state = 'normal'; return; }
    const p = this.cfg.player;
    const hangPos = this.hangLedge.point.clone()
      .addScaledVector(this.hangLedge.dir, -(p.capsuleRadius + 0.12));
    hangPos.y = this.hangLedge.point.y - p.capsuleHeight * 0.92;
    this.pos.copy(hangPos);
    this.vel.set(0, 0, 0);
    if (this.input.pressed('jump') || this.input.held('up')) {
      // climb: pop up onto the ledge
      this.pos.copy(this.hangLedge.point).addScaledVector(this.hangLedge.dir, p.capsuleRadius * 0.6);
      this.pos.y = this.hangLedge.point.y + 0.05;
      this.vel.y = 4;
      this.state = 'normal';
      this.hangLedge = null;
      this.particles.dust(this.pos, 3);
      this.audio.sfx('jump');
    } else if (this.input.held('down') || this.input.pressed('stomp')) {
      this.state = 'normal';
      this.hangLedge = null;
    }
  }

  private tryGrab(): void {
    const dir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const target = this.hooks.getGrabTarget(this.pos, dir, this.cfg.player.chompRange);
    if (!target) return;
    this.carried = target;
    target.onPicked?.();
    this.audio.sfx('chomp');
    attachTo(target.root, this.carryAnchor);
  }

  private spit(): void {
    if (!this.carried) return;
    const dir = new THREE.Vector3(Math.sin(this.facing), 0.25, Math.cos(this.facing)).normalize();
    const origin = this.pos.clone().add(new THREE.Vector3(0, this.rig.height * 0.7, 0)).addScaledVector(dir, 0.6);
    const carried = this.carried;
    this.carried = null;
    detachToWorld(carried.root);
    this.audio.sfx('spit');
    this.hooks.onSpit(origin, dir, carried);
  }

  dropCarried(): void {
    if (!this.carried) return;
    detachToWorld(this.carried.root);
    this.carried.root.position.copy(this.pos).add(new THREE.Vector3(0, 0.4, 0));
    this.carried = null;
  }

  private syncRig(dt: number, wishLen: number): void {
    // squash & stretch spring
    const target = 1;
    this.squashVel += (target - this.squash) * 90 * dt;
    this.squashVel *= Math.max(0, 1 - 12 * dt);
    this.squash += this.squashVel * dt;
    const s = THREE.MathUtils.clamp(this.squash, 0.6, 1.35);
    this.rig.visual.scale.set((2 - s) * (this.rig.root.scale.x || 1), s, 2 - s);

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    if (this.state === 'spin') this.rig.root.rotation.y = this.facing + (1 - this.spinT / this.cfg.player.spinDuration) * Math.PI * 4;

    // footsteps
    if (this.grounded && wishLen > 0.4) {
      this.stepAccum += dt * wishLen;
      if (this.stepAccum > 0.24) {
        this.stepAccum = 0;
        this.particles.dust(this.pos, 2);
      }
    }

    // i-frame flicker
    this.rig.root.visible = this.iFrames <= 0 || Math.floor(this.time * 14) % 2 === 0;

    const mode = this.state === 'dizzy' ? 'dizzy'
      : this.state === 'hang' ? 'hang'
      : this.state === 'spin' ? 'spin'
      : this.state === 'stompHop' || this.state === 'stompFall' ? 'stomp'
      : this.carried ? 'carry'
      : !this.grounded ? 'air'
      : wishLen > 0.05 ? 'run' : 'idle';
    this.rig.update({ mode, speed01: Math.max(wishLen, 0.3) }, this.time, dt);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function attachTo(obj: THREE.Object3D, anchor: THREE.Object3D): void {
  anchor.add(obj);
  obj.position.set(0, 0.2, 0);
  obj.rotation.set(0, 0, 0);
}

function detachToWorld(obj: THREE.Object3D): void {
  const world = obj.getWorldPosition(new THREE.Vector3());
  obj.parent?.remove(obj);
  obj.position.copy(world);
}
