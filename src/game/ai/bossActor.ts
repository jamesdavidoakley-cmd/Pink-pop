import * as THREE from 'three';
import type { BossDef, GameConfig, MoveDef, RangeBand } from '../../engine/types';
import type { Content } from '../../engine/loader';
import { BossBrain, type BrainContext } from './brain';
import { buildRig, type Rig } from '../actors/rigs';
import { toonMat } from '../../engine/renderer';

/**
 * Executes BossBrain decisions in the world: telegraphs (flash + audio, scaled
 * by difficulty), hit windows, motion, block stances, data-driven abilities
 * (quake rings, repair, turrets, barricades), phases with Explorer checkpoints,
 * and the freed-champion victory beat.
 */

export interface BossHost {
  playerPos(): THREE.Vector3;
  damagePlayer(amount: number, from: THREE.Vector3): void;
  recentPlayerDamage(): number;
  habitHistogram(): Record<string, number>;
  bark(pool: string): void;
  telegraphCue(): void;
  impact(pos: THREE.Vector3, strength: number): void;
  spawnBolt(from: THREE.Vector3, dir: THREE.Vector3, damage: number): void;
  spawnMinion(archetype: string, pos: THREE.Vector3): void;
  onPhaseChanged(phase: number): void;
  onDefeated(): void;
  groundHeight(x: number, z: number): number;
  arenaCenter: THREE.Vector3;
  windupScale: number;
  threatScale: number;
}

type BossState = 'idle' | 'deciding' | 'telegraph' | 'active' | 'recover' | 'dizzy' | 'staggered' | 'defeated';

interface QuakeRing {
  mesh: THREE.Mesh;
  radius: number;
  hit: boolean;
}

export class BossActor {
  readonly rig: Rig;
  readonly brain: BossBrain;
  readonly pos: THREE.Vector3;
  hp: number;
  readonly maxHp: number;
  phase = 1;
  state: BossState = 'idle';
  shielded = false; // gimmick hook (Cogwheel's generator — see W2 scene)
  private facing = 0;
  private move: MoveDef | null = null;
  private moveT = 0;
  private telegraphDur = 0;
  private stateT = 0;
  private decisionTimer = 0.8;
  private time = Math.random() * 5;
  private hitWindowDone = false;
  private blockActive = false;
  private hitFlash = 0;
  private lowHpBarked = false;
  private distanceHeld = 0;
  private lastBand: RangeBand = 'mid';
  private quakes: QuakeRing[] = [];
  private leapFrom = new THREE.Vector3();
  private leapTo = new THREE.Vector3();
  private telegraphShell: THREE.Mesh;
  private phaseCheckpointHp: number;

  constructor(
    readonly def: BossDef,
    content: Content,
    spawn: THREE.Vector3,
    private host: BossHost,
    private scene: THREE.Object3D,
    cfg: GameConfig['bossAI'],
  ) {
    const moveset = content.movesets[def.moveset];
    this.brain = new BossBrain(def, moveset, cfg, Math.random, host.threatScale, def.traitNoise ?? 0);
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.phaseCheckpointHp = def.hp;
    this.pos = spawn.clone();
    const charDef = content.characters[def.id] ?? {
      name: def.name, role: 'boss' as const, active: true, rig: 'human' as const, scale: 1.1,
      colors: { body: '#7A5230', belly: '#C8B090', accent: '#9A9A9A' },
      subtitleColor: '#FFFFFF', voice: { rate: 1, pitch: 1 },
    };
    this.rig = buildRig(charDef);
    this.rig.root.position.copy(spawn);
    scene.add(this.rig.root);
    // loadout by moveset family
    if (def.moveset === 'sword_and_board') {
      this.rig.setProp('R', 'sword');
      this.rig.setProp('L', 'shield');
    } else if (def.moveset === 'twin_daggers') {
      this.rig.setProp('R', 'dagger');
      this.rig.setProp('L', 'dagger');
    } else if (def.moveset === 'heavy_hammer') {
      this.rig.setProp('R', 'hammer');
    } else if (def.moveset === 'spanner_turrets') {
      this.rig.setProp('R', 'spanner');
    }
    this.telegraphShell = new THREE.Mesh(
      new THREE.SphereGeometry(1.1 * (charDef.scale ?? 1), 12, 10),
      new THREE.MeshBasicMaterial({ color: '#FFE14A', transparent: true, opacity: 0 }),
    );
    this.telegraphShell.position.y = 1.0;
    this.rig.root.add(this.telegraphShell);
    // gimmick: a shield generator that education switches off (Cogwheel §6.7)
    const gimmick = def.gimmick as { shieldTask?: string } | undefined;
    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.5 * (charDef.scale ?? 1), 16, 12),
      new THREE.MeshBasicMaterial({ color: '#7AC8FF', transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    );
    this.shieldBubble.position.y = 1.0;
    this.rig.root.add(this.shieldBubble);
    if (gimmick?.shieldTask) this.shielded = true;
    this.shieldBubble.visible = this.shielded;
    this.decisionTimer = 1.2; // a beat before the first move
  }

  private shieldBubble: THREE.Mesh;

  dropShield(): void {
    this.shielded = false;
    this.shieldBubble.visible = false;
    this.state = 'staggered';
    this.stateT = 2.0; // the generator dying staggers her — earned opening
  }

  get alive(): boolean { return this.state !== 'defeated'; }
  get hpFrac(): number { return this.hp / this.maxHp; }
  get isBlocking(): boolean { return this.blockActive; }

  /** Player attack. Returns what happened so the scene can react. */
  takeDamage(amount: number, from: THREE.Vector3): 'hit' | 'blocked' | 'shielded' | 'gone' {
    if (!this.alive) return 'gone';
    if (this.shielded) return 'shielded';
    if (this.blockActive) {
      const toAttacker = from.clone().sub(this.pos).setY(0).normalize();
      const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
      if (fwd.dot(toAttacker) > 0.25) return 'blocked';
    }
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlash = 0.3;
    if (Math.random() < 0.4) this.host.bark('hit_react');
    if (!this.lowHpBarked && this.hpFrac < 0.35) {
      this.lowHpBarked = true;
      this.host.bark('low_hp');
    }
    // phase transitions at even hp splits
    const nextPhaseAt = 1 - this.phase / this.def.phases;
    if (this.def.phases > 1 && this.phase < this.def.phases && this.hpFrac <= nextPhaseAt) {
      this.phase++;
      this.brain.enterPhase(this.phase);
      this.phaseCheckpointHp = this.hp;
      this.state = 'staggered';
      this.stateT = 1.4;
      this.host.onPhaseChanged(this.phase);
    }
    if (this.hp <= 0) this.beginDefeat();
    return 'hit';
  }

  stun(seconds: number): void {
    if (!this.alive || this.state === 'defeated') return;
    this.state = 'dizzy';
    this.stateT = Math.max(this.stateT, seconds);
    this.blockActive = false;
  }

  /** Explorer kindness: after a player wipe mid-fight, restart from the phase. */
  resetForRetry(phaseCheckpoints: boolean): void {
    if (phaseCheckpoints && this.phase > 1) {
      this.hp = this.phaseCheckpointHp;
    } else {
      this.hp = this.maxHp;
      this.phase = 1;
      this.brain.enterPhase(1);
    }
    this.state = 'idle';
    this.decisionTimer = 1.5;
    this.move = null;
    this.blockActive = false;
    this.pos.copy(this.host.arenaCenter);
  }

  private beginDefeat(): void {
    this.state = 'defeated';
    this.blockActive = false;
    // the Obedience Cog pops off and spins away
    const cog = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 8), toonMat('#3A2E52', { emissive: '#8C7DB8' }));
    cog.position.copy(this.pos).add(new THREE.Vector3(0, 1.8, 0));
    this.scene.add(cog);
    const start = performance.now();
    const fly = (): void => {
      const t = (performance.now() - start) / 1000;
      cog.position.y += 0.04;
      cog.position.x += Math.sin(t * 8) * 0.02;
      cog.rotation.x += 0.2; cog.rotation.z += 0.13;
      (cog.material as THREE.MeshToonMaterial).opacity = 1;
      if (t < 2.4) requestAnimationFrame(fly);
      else this.scene.remove(cog);
    };
    fly();
    this.host.onDefeated();
  }

  update(dt: number, frozen: boolean): void {
    if (!this.alive) {
      this.rig.root.position.copy(this.pos);
      this.rig.update({ mode: 'dizzy', speed01: 0 }, this.time += dt, dt);
      return;
    }
    this.time += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.updateQuakes(dt);
    if (this.shielded) {
      this.shieldBubble.visible = true;
      (this.shieldBubble.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(this.time * 3) * 0.08;
    }
    if (frozen) { this.syncRig(dt, 0); return; }

    const player = this.host.playerPos();
    const dist = this.pos.distanceTo(player);
    const band: RangeBand = dist < 3 ? 'near' : dist <= 7 ? 'mid' : 'far';
    if (band === this.lastBand) this.distanceHeld += dt;
    else { this.distanceHeld = 0; this.lastBand = band; }

    let moveSpeed = 0;
    this.stateT = Math.max(0, this.stateT - dt);

    switch (this.state) {
      case 'idle': case 'deciding': {
        this.face(player, dt * 4);
        this.decisionTimer -= dt;
        if (this.decisionTimer <= 0) this.decide(band, dt);
        break;
      }
      case 'telegraph': {
        this.face(player, dt * 2.2);
        this.moveT += dt;
        (this.telegraphShell.material as THREE.MeshBasicMaterial).opacity =
          0.16 + 0.18 * Math.sin(this.moveT * 16);
        if (this.moveT >= this.telegraphDur) {
          (this.telegraphShell.material as THREE.MeshBasicMaterial).opacity = 0;
          this.state = 'active';
          this.hitWindowDone = false;
          if (this.move?.motion?.kind === 'leap') {
            this.leapFrom.copy(this.pos);
            this.leapTo.copy(player);
          }
          if (this.move?.motion?.kind === 'vanishStep') {
            // reappear behind the player — trickery made flesh
            const behind = player.clone().addScaledVector(
              new THREE.Vector3().subVectors(player, this.pos).setY(0).normalize(), 2.2);
            this.pos.set(behind.x, this.host.groundHeight(behind.x, behind.z), behind.z);
            this.host.impact(this.pos, 0.1);
          }
        }
        break;
      }
      case 'active': {
        const m = this.move!;
        this.moveT += dt;
        const activeT = this.moveT; // includes telegraph time (hit windows are absolute)
        const motion = m.motion?.kind;
        if (motion === 'approach' || motion === 'lunge') {
          moveSpeed = this.stepToward(player, dt, m.motion?.speed ?? 4);
          this.face(player, dt * 6);
        } else if (motion === 'retreat') {
          const away = this.pos.clone().sub(player).setY(0).normalize();
          moveSpeed = this.stepToward(this.pos.clone().addScaledVector(away, 3), dt, m.motion?.speed ?? 4);
        } else if (motion === 'strafe') {
          const toP = player.clone().sub(this.pos).setY(0).normalize();
          const side = new THREE.Vector3(toP.z, 0, -toP.x);
          moveSpeed = this.stepToward(this.pos.clone().addScaledVector(side, 2.5), dt, m.motion?.speed ?? 3);
          this.face(player, dt * 4);
        } else if (motion === 'leap') {
          const total = m.duration - this.telegraphDur;
          const t = Math.min(1, (this.moveT - this.telegraphDur) / Math.max(0.2, total * 0.6));
          this.pos.lerpVectors(this.leapFrom, this.leapTo, t);
          this.pos.y = this.host.groundHeight(this.pos.x, this.pos.z) + Math.sin(t * Math.PI) * 2.2;
          if (t >= 1) this.pos.y = this.host.groundHeight(this.pos.x, this.pos.z);
        }
        this.blockActive = m.stance === 'block';

        // hit window
        if (m.hit && !this.hitWindowDone && activeT >= (m.hit.from ?? 0) && activeT <= (m.hit.to ?? m.duration)) {
          if (this.checkHit(m, player, dist)) {
            this.host.damagePlayer(m.damage ?? 1, this.pos);
            this.hitWindowDone = true;
            this.host.impact(this.pos, 0.25);
          }
        }
        // projectile fire moment
        if (m.projectile && !this.hitWindowDone && activeT >= (m.telegraph ?? 0.6)) {
          const from = this.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
          const dir = player.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(from).normalize();
          for (let i = 0; i < (m.projectile.count ?? 1); i++) {
            const spread = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - ((m.projectile.count ?? 1) - 1) / 2) * 0.18);
            this.host.spawnBolt(from, spread, m.projectile.damage ?? 0.5);
          }
          this.hitWindowDone = true;
        }

        if (this.moveT >= m.duration) {
          this.blockActive = false;
          // Bruno's tell: overextends after the big combo — a stomp window
          const dizzyAfter = (this.def.gimmick as { dizzyAfterCombo?: number } | undefined)?.dizzyAfterCombo;
          if (dizzyAfter && m.id === 'slash_combo' && !this.hitWindowDone) {
            this.state = 'dizzy';
            this.stateT = dizzyAfter;
            this.host.bark('dizzy');
          } else {
            this.state = 'recover';
            this.stateT = m.recovery ?? 0.4;
          }
        }
        break;
      }
      case 'recover':
        if (this.stateT <= 0) { this.state = 'deciding'; this.decisionTimer = 0.1; }
        break;
      case 'dizzy':
      case 'staggered':
        if (this.stateT <= 0) { this.state = 'deciding'; this.decisionTimer = 0.3; }
        break;
      default: break;
    }

    if (this.state !== 'active' || this.move?.motion?.kind !== 'leap') {
      this.pos.y = this.host.groundHeight(this.pos.x, this.pos.z);
    }
    this.keepInArena();
    this.syncRig(dt, moveSpeed);
  }

  private decide(band: RangeBand, dt: number): void {
    const ctx: BrainContext = {
      distanceBand: band,
      selfHpFrac: this.hpFrac,
      playerHpFrac: 1,
      playerHabits: this.host.habitHistogram(),
      distanceHeldSeconds: this.distanceHeld,
      recentPlayerDamage: this.host.recentPlayerDamage(),
    };
    const { move, firedAbilities } = this.brain.tick(ctx, Math.max(dt, this.brain.decisionInterval));
    for (const ab of firedAbilities) this.executeAbility(ab.effect);
    this.move = move;
    this.moveT = 0;
    this.telegraphDur = (move.telegraph ?? 0) * this.host.windupScale;
    if (move.bark && Math.random() < 0.25 + this.brain.traits.showmanship * 0.5) {
      this.host.bark(move.bark);
    }
    if (this.telegraphDur > 0) {
      this.state = 'telegraph';
      this.host.telegraphCue();
    } else {
      this.state = 'active';
      this.hitWindowDone = false;
    }
    this.decisionTimer = this.brain.decisionInterval;
  }

  private executeAbility(effect: string): void {
    switch (effect) {
      case 'quake': {
        this.host.bark('quake');
        this.host.impact(this.pos, 0.5);
        for (let i = 0; i < 2; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1, 0.22, 8, 32),
            toonMat('#E8A868', { emissive: '#C86A2E' }),
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.copy(this.pos).setY(this.host.groundHeight(this.pos.x, this.pos.z) + 0.15);
          this.scene.add(ring);
          this.quakes.push({ mesh: ring, radius: 0.5 - i * 2.2, hit: false });
        }
        break;
      }
      case 'repair': {
        this.host.bark('repair');
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.08);
        break;
      }
      case 'turrets': {
        this.host.bark('repair');
        const side = new THREE.Vector3(Math.cos(this.facing), 0, -Math.sin(this.facing));
        this.host.spawnMinion('cogling_scout', this.pos.clone().addScaledVector(side, 3));
        this.host.spawnMinion('cogling_scout', this.pos.clone().addScaledVector(side, -3));
        break;
      }
      case 'barricade': case 'invisible':
        // W5/W6 signature counters — wired when their worlds land
        break;
      default: break;
    }
  }

  private updateQuakes(dt: number): void {
    const player = this.host.playerPos();
    for (const q of [...this.quakes]) {
      q.radius += dt * 7;
      if (q.radius > 0) {
        q.mesh.visible = true;
        q.mesh.scale.setScalar(Math.max(0.01, q.radius));
        const d = player.clone().setY(q.mesh.position.y).distanceTo(q.mesh.position);
        const playerGrounded = Math.abs(player.y - q.mesh.position.y) < 0.6;
        if (!q.hit && playerGrounded && Math.abs(d - q.radius) < 0.7) {
          q.hit = true;
          this.host.damagePlayer(0.5, q.mesh.position);
        }
      } else q.mesh.visible = false;
      if (q.radius > 18) {
        this.scene.remove(q.mesh);
        this.quakes.splice(this.quakes.indexOf(q), 1);
      }
    }
  }

  private checkHit(m: MoveDef, player: THREE.Vector3, dist: number): boolean {
    const h = m.hit!;
    const r = h.radius ?? 2;
    if (dist > r + 0.5) return false;
    if (h.shape === 'ring') return true;
    const toP = player.clone().sub(this.pos).setY(0).normalize();
    const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const angle = Math.acos(THREE.MathUtils.clamp(fwd.dot(toP), -1, 1));
    if (h.shape === 'arc') return angle < (h.arc ?? 2) / 2;
    return angle < 0.45; // line
  }

  private stepToward(target: THREE.Vector3, dt: number, speed: number): number {
    const d = target.clone().sub(this.pos).setY(0);
    const len = d.length();
    if (len < 0.8) return 0;
    d.normalize();
    this.pos.addScaledVector(d, Math.min(len, speed * dt));
    return speed;
  }

  private face(target: THREE.Vector3, lerp: number): void {
    const d = target.clone().sub(this.pos);
    const want = Math.atan2(d.x, d.z);
    let diff = (want - this.facing) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.facing += diff * Math.min(1, lerp);
  }

  private keepInArena(): void {
    const c = this.host.arenaCenter;
    const d = this.pos.clone().sub(c).setY(0);
    const maxR = 19;
    if (d.length() > maxR) {
      d.setLength(maxR);
      this.pos.set(c.x + d.x, this.pos.y, c.z + d.z);
    }
  }

  private syncRig(dt: number, moveSpeed: number): void {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    const mode = this.state === 'dizzy' || this.state === 'staggered' ? 'dizzy'
      : this.state === 'telegraph' || (this.state === 'active' && this.move?.hit) ? 'attack'
      : this.blockActive ? 'block'
      : moveSpeed > 0.5 ? 'run' : 'idle';
    const total = this.move?.duration ?? 1;
    this.rig.update({
      mode,
      speed01: Math.min(1, moveSpeed / 5),
      attackT: this.move ? Math.min(1, this.moveT / total) : 0,
      teleFrac: this.move ? this.telegraphDur / total : 0.4,
    }, this.time, dt);
  }

  dispose(): void {
    this.rig.root.parent?.remove(this.rig.root);
    for (const q of this.quakes) this.scene.remove(q.mesh);
  }
}
