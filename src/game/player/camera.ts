import * as THREE from 'three';
import type { GameConfig } from '../../engine/types';
import type { Input } from '../../engine/input';
import type { StaticWorld } from '../../engine/physics';

/**
 * Orbit-follow camera (§4.1): zoom steps, wall-collision probe (never clips),
 * recentre, invert + sensitivity, soft lock-on for arenas.
 */
export class CameraRig {
  yaw = 0;
  pitch = 0.32;
  private distStep: number;
  private currentDist: number;
  private lookTarget = new THREE.Vector3();
  private smoothPos = new THREE.Vector3();
  invertY = false;
  sensitivity = 1;
  lockOn: THREE.Vector3 | null = null;

  constructor(
    private cfg: GameConfig['camera'],
    private camera: THREE.PerspectiveCamera,
    private input: Input,
  ) {
    this.distStep = cfg.defaultStep;
    this.currentDist = cfg.distanceSteps[this.distStep];
  }

  recenter(behindYaw: number): void { this.yaw = behindYaw + Math.PI; }

  update(dt: number, targetPos: THREE.Vector3, world: StaticWorld | null, facing: number): void {
    const c = this.cfg;
    // input
    const sens = c.sensitivity * this.sensitivity;
    const mouseScale = 0.0035;
    this.yaw -= this.input.pointerDX * mouseScale * sens;
    this.pitch += this.input.pointerDY * mouseScale * sens * (this.invertY ? -1 : 1);
    if (this.input.held('camLeft')) this.yaw += dt * 2.4 * sens;
    if (this.input.held('camRight')) this.yaw -= dt * 2.4 * sens;
    const stick = this.input.cameraVector();
    this.yaw -= stick.x * dt * 3 * sens;
    this.pitch += stick.y * dt * 2.2 * sens * (this.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, c.minPitch, c.maxPitch);

    if (this.input.pressed('zoom') || this.input.wheelDelta !== 0) {
      const dir = this.input.wheelDelta !== 0 ? Math.sign(this.input.wheelDelta) : 1;
      this.distStep = (this.distStep + dir + c.distanceSteps.length) % c.distanceSteps.length;
    }
    if (this.input.pressed('recenter')) this.recenter(facing);

    // soft lock-on: bias yaw toward keeping target + lock point framed
    if (this.lockOn) {
      const toLock = new THREE.Vector3().subVectors(this.lockOn, targetPos);
      const lockYaw = Math.atan2(toLock.x, toLock.z) + Math.PI;
      this.yaw = dampAngle(this.yaw, lockYaw, dt * 1.6);
    }

    const targetDist = c.distanceSteps[this.distStep];
    this.currentDist = THREE.MathUtils.damp(this.currentDist, targetDist, 5, dt);

    const focus = targetPos.clone().add(new THREE.Vector3(0, c.height, 0));
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.currentDist);
    let desired = focus.clone().add(offset);

    // collision probe: pull the camera in front of any wall between focus & desired
    if (world) {
      const dir = offset.clone().normalize();
      const hit = world.raycast(focus, dir, this.currentDist + 0.3);
      if (hit) {
        const d = Math.max(0.6, hit.distance - c.collisionRadius);
        desired = focus.clone().addScaledVector(dir, d);
      }
    }

    if (this.smoothPos.lengthSq() === 0) this.smoothPos.copy(desired);
    this.smoothPos.x = THREE.MathUtils.damp(this.smoothPos.x, desired.x, c.followLerp, dt);
    this.smoothPos.y = THREE.MathUtils.damp(this.smoothPos.y, desired.y, c.followLerp, dt);
    this.smoothPos.z = THREE.MathUtils.damp(this.smoothPos.z, desired.z, c.followLerp, dt);
    this.lookTarget.x = THREE.MathUtils.damp(this.lookTarget.x, focus.x, c.followLerp * 1.4, dt);
    this.lookTarget.y = THREE.MathUtils.damp(this.lookTarget.y, focus.y, c.followLerp * 1.4, dt);
    this.lookTarget.z = THREE.MathUtils.damp(this.lookTarget.z, focus.z, c.followLerp * 1.4, dt);

    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.lookTarget);
  }

  /**
   * Movement basis for player-relative controls. The camera sits at
   * +(sin yaw, cos yaw) from the focus and looks back along it, so pressing
   * "up" must map to −(sin yaw, cos yaw) — which is what rotating (0,0,−1)
   * by exactly `yaw` produces.
   */
  get moveYaw(): number { return this.yaw; }

  snapTo(targetPos: THREE.Vector3, yaw: number): void {
    this.yaw = yaw;
    this.smoothPos.set(0, 0, 0);
    this.lookTarget.copy(targetPos);
  }
}

function dampAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}
