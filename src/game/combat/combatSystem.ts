import * as THREE from 'three';
import { toonMat } from '../../engine/renderer';
import { bus } from '../../engine/events';
import type { SceneServices } from '../world/playScene';
import type { Player, CarryTarget } from '../player/player';
import type { ParticleSystem } from '../actors/particles';
import type { StaticWorld } from '../../engine/physics';
import type { LevelDef } from '../../engine/types';
import type { TaskRunner } from '../education/runner';
import { EnemyManager, type EnemyActor, type EnemyHost } from './enemies';
import { BossActor, type BossHost } from '../ai/bossActor';
import { HabitTracker } from '../ai/brain';
import { HeartDrop } from '../world/collectibles';

/**
 * Per-level combat: the Clockwork Legion, boss fights, quiz orbs, player
 * attacks, hit-pause, heart drops, and companion battle coaching (§6.1).
 */

interface Bolt {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  damage: number;
  life: number;
}

interface QuizOrb {
  mesh: THREE.Mesh;
  used: boolean;
}

export class CombatSystem {
  readonly enemies: EnemyManager;
  boss: BossActor | null = null;
  private bolts: Bolt[] = [];
  private hearts: HeartDrop[] = [];
  private orbs: QuizOrb[] = [];
  private habits = new HabitTracker();
  private recentDamage: [number, number][] = [];
  private time = 0;
  private spinHitIds = new Set<number>();
  private spinWasActive = false;
  private bossSpinHit = false;
  private hitPause = 0;
  private contactCooldown = 0;
  private victoryHandled = false;
  private introDone = false;

  constructor(
    private s: SceneServices,
    def: LevelDef,
    private player: Player,
    private particles: ParticleSystem,
    private world: StaticWorld,
    private group: THREE.Object3D,
    private runner: TaskRunner,
    private onBossVictory: (bossId: string, fossilId?: string) => void,
  ) {
    this.enemies = new EnemyManager(s.content);
    const host = this.enemyHost();
    this.enemies.spawnFromLevel(def.enemies ?? [], host, group);

    for (const pos of def.quizOrbs ?? []) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 12, 10),
        toonMat('#B47FFF', { emissive: '#8A4AE8' }),
      );
      orb.position.set(...pos);
      group.add(orb);
      this.orbs.push({ mesh: orb, used: false });
    }

    if (def.boss) {
      const bd = s.content.bosses[def.boss];
      if (bd) {
        const spawn = new THREE.Vector3(def.spawn[0], 0, def.spawn[2] - 14);
        spawn.y = this.groundHeight(spawn.x, spawn.z);
        this.boss = new BossActor(bd, s.content, spawn, this.bossHost(bd), group, s.content.config.bossAI);
        s.audio.setCombat(true);
        // shield-generator gimmick: solving the arena-edge puzzle drops it
        const shieldTask = (bd.gimmick as { shieldTask?: string } | undefined)?.shieldTask;
        if (shieldTask) {
          const off = bus.on('TaskCompleted', ({ taskId }) => {
            if (taskId !== shieldTask || !this.boss) return;
            off();
            this.boss.dropShield();
            this.particles.burst(this.boss.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), '#7AC8FF', 30, 6);
            this.s.audio.sfx('stun');
            this.s.renderer.shake(0.25);
            this.s.dialogue.bark('kenji', 'combat_tip', { priority: 3 });
          });
        }
      }
    }
  }

  // ---------------- hosts ----------------
  private groundHeight(x: number, z: number): number {
    const hit = this.world.raycast(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0), 60);
    return hit ? hit.point.y : 0;
  }

  private damagePlayer(amount: number, from: THREE.Vector3): void {
    if (this.runner.isActive) return; // quiz orbs pause combat — learning is safe time
    if (this.player.takeDamage(amount, from)) {
      this.recentDamage.push([this.time, amount]);
      this.playerHitStreak = 0;
      if (Math.random() < 0.35) this.s.dialogue.bark('marcus', 'combat_tip', { priority: 3 });
    }
  }

  private enemyHost(): EnemyHost {
    return {
      playerPos: () => this.player.pos,
      damagePlayer: (a, f) => this.damagePlayer(a, f),
      spawnBolt: (from, dir, damage) => this.spawnBolt(from, dir, damage),
      onDefeated: (e) => this.handleEnemyDefeated(e),
      telegraphCue: () => this.s.audio.sfx('telegraph'),
      alertAllies: (from, radius) => {
        for (const e of this.enemies.enemies) {
          if (e.alive && e !== from && e.pos.distanceTo(from.pos) < radius) e.state = 'aggro';
        }
        this.s.dialogue.bark('digger', 'combat_tip', { priority: 3 });
      },
      groundHeight: (x, z) => this.groundHeight(x, z),
    };
  }

  private bossHost(bd: { id: string; fossil?: string }): BossHost {
    const diff = this.s.content.config.difficulty[this.s.session.data.difficulty];
    return {
      playerPos: () => this.player.pos,
      damagePlayer: (a, f) => this.damagePlayer(a, f),
      recentPlayerDamage: () => {
        const cutoff = this.time - 10;
        this.recentDamage = this.recentDamage.filter(([t]) => t >= cutoff);
        return this.recentDamage.reduce((s, [, a]) => s + a, 0);
      },
      habitHistogram: () => this.habits.histogram(),
      bark: (pool) => this.s.dialogue.bark(this.voiceCharFor(bd.id), pool, { priority: 2 }),
      telegraphCue: () => this.s.audio.sfx('telegraph'),
      impact: (pos, strength) => {
        this.s.renderer.shake(strength);
        this.particles.burst(pos, '#E8C878', 10, 3);
        this.s.audio.sfx('stomp');
      },
      spawnBolt: (from, dir, damage) => this.spawnBolt(from, dir, damage),
      spawnMinion: (arch, pos) => {
        pos.y = this.groundHeight(pos.x, pos.z);
        this.enemies.spawn(arch, pos, this.enemyHost(), this.group);
      },
      onPhaseChanged: (phase) => {
        bus.emit('BossPhaseChanged', { bossId: bd.id, phase });
        this.s.audio.sfx('roar');
        this.s.hud.toast(this.s.strings.get('arena.checkpoint'));
        this.s.dialogue.bark('kenji', 'combat_tip', { priority: 3 });
      },
      onDefeated: () => this.handleBossDefeated(bd.id, bd.fossil),
      groundHeight: (x, z) => this.groundHeight(x, z),
      arenaCenter: new THREE.Vector3(0, 0, 0),
      windupScale: diff.windupScale,
      threatScale: diff.threatScale,
    };
  }

  private voiceCharFor(bossId: string): string {
    return this.s.content.characters[bossId] ? bossId : 'vex';
  }

  // ---------------- events from the scene ----------------
  notePlayerAction(action: string): void {
    this.habits.add(action);
    this.boss?.brain.notePlayerAction(action);
  }

  private playerHitStreak = 0;

  private landPlayerHit(): void {
    this.playerHitStreak++;
    this.boss?.brain.notePlayerStreak(this.playerHitStreak);
    this.hitPause = this.s.content.config.combat.hitPauseSeconds;
    this.s.audio.sfx('hit');
  }

  playerStomp(pos: THREE.Vector3): void {
    this.notePlayerAction('stomp');
    const r = this.s.content.config.player.stompRadius;
    for (const e of this.enemies.enemies) {
      if (e.alive && e.pos.distanceTo(pos) < r + 0.5) {
        if (e.takeDamage(this.s.content.config.player.stompDamage, pos)) this.landPlayerHit();
      }
    }
    if (this.boss?.alive && this.boss.pos.distanceTo(pos) < r + 0.8) {
      const result = this.boss.takeDamage(this.s.content.config.player.stompDamage, pos);
      this.reactToBossHit(result, pos);
    }
  }

  playerRoar(pos: THREE.Vector3): void {
    this.notePlayerAction('roar');
    const r = this.s.content.config.player.roarRadius;
    const stun = this.s.content.config.player.roarStunSeconds;
    for (const e of this.enemies.enemies) {
      if (e.alive && e.pos.distanceTo(pos) < r) e.stun(stun);
    }
    if (this.boss?.alive && this.boss.pos.distanceTo(pos) < r) this.boss.stun(stun * 0.5);
    this.s.audio.sfx('stun');
  }

  projectileImpact(pos: THREE.Vector3, carried: CarryTarget): void {
    const dmg = this.s.content.config.player.spitDamage;
    let hitSomething = false;
    for (const e of this.enemies.enemies) {
      if (e.alive && e.pos.distanceTo(pos) < 1.6) {
        if (e.takeDamage(dmg, pos)) { hitSomething = true; this.landPlayerHit(); }
      }
    }
    if (this.boss?.alive && this.boss.pos.distanceTo(pos) < 2) {
      this.reactToBossHit(this.boss.takeDamage(dmg, pos), pos);
      hitSomething = true;
    }
    if (carried.kind === 'enemy') {
      // a spat cogling pops on landing (bonked, and rather embarrassed)
      this.particles.burst(pos, '#8A8A96', 14, 4);
      this.s.audio.sfx('pop');
    }
    if (hitSomething) this.particles.burst(pos, '#FFE14A', 8, 3);
  }

  private reactToBossHit(result: 'hit' | 'blocked' | 'shielded' | 'gone', pos: THREE.Vector3): void {
    if (result === 'hit') {
      this.landPlayerHit();
      this.particles.burst(this.boss!.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), '#FFE14A', 8, 3);
    } else if (result === 'blocked') {
      this.s.audio.sfx('gear');
      this.particles.burst(pos, '#C8CDD8', 6, 2);
      this.playerHitStreak = 0;
    } else if (result === 'shielded') {
      this.s.audio.sfx('incorrect');
      if (this.boss && Math.random() < 0.4) {
        this.s.dialogue.bark(this.voiceCharFor(this.boss.def.id), 'shield', { priority: 2 });
      }
    }
  }

  /** Chompable enemies become carry targets when stunned/dizzy. */
  getGrabTarget(pos: THREE.Vector3, fwd: THREE.Vector3, range: number): CarryTarget | null {
    const probe = pos.clone().addScaledVector(fwd, range * 0.6);
    for (const e of this.enemies.enemies) {
      if (!e.alive || !e.chompable) continue;
      if (e.pos.distanceTo(probe) < range) {
        return {
          root: e.rig.root,
          kind: 'enemy',
          onPicked: () => {
            e.state = 'done'; // carried off — out of the fight
            this.notePlayerAction('chomp');
          },
        };
      }
    }
    return null;
  }

  private handleEnemyDefeated(e: EnemyActor): void {
    bus.emit('EnemyDefeated', { archetype: e.def.id });
    this.particles.burst(e.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), '#8A8A96', 18, 5);
    this.particles.sparkle(e.pos, '#FFE14A', 4);
    this.s.audio.sfx('pop');
    for (let i = 0; i < 2; i++) this.s.session.addChip();
    if (Math.random() < this.s.content.config.combat.heartDropChance) {
      this.hearts.push(new HeartDrop(this.group, e.pos));
    }
  }

  private handleBossDefeated(bossId: string, fossilId?: string): void {
    if (this.victoryHandled) return;
    this.victoryHandled = true;
    bus.emit('BossDefeated', { bossId });
    this.s.audio.setCombat(false);
    this.particles.confetti(this.boss!.pos.clone().add(new THREE.Vector3(0, 2, 0)), 60);
    this.s.renderer.shake(0.3);
    const name = this.s.content.characters[bossId]?.name ?? bossId;
    void (async () => {
      await this.s.dialogue.say(this.voiceCharFor(bossId), 'defeat_freed', { priority: 3 });
      const kind = this.s.content.bosses[bossId]?.kind;
      if (kind === 'boss') {
        this.s.session.freeChampion(bossId);
        this.s.hud.toast(this.s.strings.get('toast.champFreed', { name }), 4);
      }
      this.s.dialogue.bark('max', 'victory', { priority: 2 });
      this.s.dialogue.bark('marcus', 'victory', { priority: 1 });
      this.onBossVictory(bossId, fossilId);
    })();
  }

  private spawnBolt(from: THREE.Vector3, dir: THREE.Vector3, damage: number): void {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toonMat('#FF9A4A', { emissive: '#E8641E' }));
    mesh.position.copy(from);
    this.group.add(mesh);
    this.bolts.push({ mesh, vel: dir.clone().multiplyScalar(9), damage, life: 3 });
    this.s.audio.sfx('spit');
  }

  /** Called by the scene when the player revives after a wipe. */
  onPlayerRetry(): void {
    const diff = this.s.content.config.difficulty[this.s.session.data.difficulty];
    this.boss?.resetForRetry(diff.phaseCheckpoints);
    this.recentDamage = [];
    this.playerHitStreak = 0;
  }

  get frozen(): boolean {
    return this.runner.isActive || this.s.dialogue.cutsceneActive;
  }

  /** dt scale for hit-pause juice. */
  consumeHitPause(dt: number): number {
    if (this.hitPause > 0) {
      this.hitPause -= dt;
      return dt * 0.08;
    }
    return dt;
  }

  update(dt: number): void {
    this.time += dt;
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    const frozen = this.frozen;

    // boss intro beat: one bark when the player first closes in
    if (this.boss && !this.introDone && this.player.pos.distanceTo(this.boss.pos) < 14) {
      this.introDone = true;
      this.s.dialogue.bark(this.voiceCharFor(this.boss.def.id), 'boss_intro', { priority: 2 });
      this.s.dialogue.bark('marcus', 'boss_intro', { priority: 1 });
    }

    this.enemies.update(dt, frozen);
    this.boss?.update(dt, frozen);

    // spin attack: continuous hit volume while spinning (fresh set per spin)
    if (this.player.spinning) {
      if (!this.spinWasActive) {
        this.spinHitIds.clear();
        this.bossSpinHit = false;
        this.notePlayerAction('spin');
      }
      const r = this.s.content.config.player.spinRadius;
      for (const e of this.enemies.enemies) {
        if (e.alive && !this.spinHitIds.has(e.id) && e.pos.distanceTo(this.player.pos) < r) {
          this.spinHitIds.add(e.id);
          if (e.takeDamage(this.s.content.config.player.spinDamage, this.player.pos)) this.landPlayerHit();
        }
      }
      if (this.boss?.alive && !this.bossSpinHit && this.boss.pos.distanceTo(this.player.pos) < r + 0.6) {
        this.bossSpinHit = true;
        this.reactToBossHit(this.boss.takeDamage(this.s.content.config.player.spinDamage, this.player.pos), this.player.pos);
      }
    }
    this.spinWasActive = this.player.spinning;

    // enemy body contact stings a little (½ heart, kid-fair cooldown)
    if (!frozen && this.contactCooldown === 0) {
      for (const e of this.enemies.enemies) {
        if (e.alive && e.state !== 'stunned' && e.state !== 'dizzy'
          && e.pos.distanceTo(this.player.pos) < 0.9) {
          this.damagePlayer(0.5, e.pos);
          this.contactCooldown = 0.9;
          break;
        }
      }
    }

    // bolts
    for (const b of [...this.bolts]) {
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      if (b.mesh.position.distanceTo(this.player.pos.clone().add(new THREE.Vector3(0, 0.8, 0))) < 0.75) {
        this.damagePlayer(b.damage, b.mesh.position);
        b.life = 0;
      }
      if (b.life <= 0) {
        this.group.remove(b.mesh);
        this.bolts.splice(this.bolts.indexOf(b), 1);
      }
    }

    // hearts
    for (const h of [...this.hearts]) {
      const result = h.update(dt, this.time, this.player.pos);
      if (result === 'taken') this.player.heal(1);
      if (result) this.hearts.splice(this.hearts.indexOf(h), 1);
    }

    // quiz orbs: optional learning mid-fight — always helps, never forced
    for (const o of this.orbs) {
      if (o.used) continue;
      o.mesh.rotation.y += dt * 2;
      o.mesh.position.y += Math.sin(this.time * 2.4) * 0.004;
      if (!this.runner.isActive && o.mesh.position.distanceTo(this.player.pos) < 1.2) {
        o.used = true;
        o.mesh.visible = false;
        this.particles.burst(o.mesh.position, '#B47FFF', 16, 4);
        this.s.audio.sfx('secret');
        const started = this.runner.start('quiz-orb', this.player.pos.clone(), this.player.facing, { practice: true });
        if (started) {
          const off = bus.on('TaskCompleted', ({ taskId }) => {
            if (taskId !== 'quiz-orb') return;
            off();
            this.player.heal(1);
            this.player.addBrain(1);
          });
        }
      }
    }
  }

  dispose(): void {
    this.enemies.dispose();
    this.boss?.dispose();
    for (const b of this.bolts) this.group.remove(b.mesh);
    this.s.audio.setCombat(false);
  }
}
