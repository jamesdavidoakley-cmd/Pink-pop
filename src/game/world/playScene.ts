import * as THREE from 'three';
import type { Content, Strings } from '../../engine/loader';
import type { CapsuleMoveResult } from '../../engine/physics';
import type { Input } from '../../engine/input';
import type { AudioEngine } from '../../engine/audio';
import type { RendererSystem } from '../../engine/renderer';
import type { LevelDef } from '../../engine/types';
import { toonMat } from '../../engine/renderer';
import { buildLevel, type Breakable, type LevelBuild } from './levelBuilder';
import { ChipField, FossilPickup } from './collectibles';
import { ParticleSystem } from '../actors/particles';
import { buildRig } from '../actors/rigs';
import { CameraRig } from '../player/camera';
import { Player, type CarryTarget, type CollisionWorld } from '../player/player';
import { CompanionParty } from '../companions/companions';
import type { DialogueEngine } from '../dialogue/engine';
import type { Session } from '../session';
import type { Hud } from '../ui/hud';
import type { FossilDefC, PortalDef } from '../../engine/types';
import { InteractableManager } from './interactables';
import { makeTextSprite, updateTextSprite } from './textSprite';
import { EducationEngine } from '../education/engine';
import { TaskRunner } from '../education/runner';
import { TaskKit } from '../education/taskKit';
import { registerTaskModules } from '../education/registry';
import type { QuestionPanel } from '../education/panel';
import { CombatSystem } from '../combat/combatSystem';

export interface SceneServices {
  content: Content;
  strings: Strings;
  renderer: RendererSystem;
  input: Input;
  audio: AudioEngine;
  dialogue: DialogueEngine;
  session: Session;
  hud: Hud;
  panel: QuestionPanel;
  /** Game-level navigation: the scene asks, the game decides. */
  onPortal: (portal: PortalDef) => void;
  isUiBlocked: () => boolean;
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
  readonly party: CompanionParty;
  readonly interactables: InteractableManager;
  private idleTimer = 0;
  private projectiles: Projectile[] = [];
  private crates: { target: CarryTarget; free: boolean }[] = [];
  private springPads: SpringPad[] = [];
  private checkpoint: THREE.Vector3;
  protected time = 0;
  chipsCollected = 0;
  /** Chip indices collected in this visit (chips respawn per visit by design). */
  readonly collectedChipIndices = new Set<number>();
  private fossilPickups: FossilPickup[] = [];
  private lockedFossils: FossilDefC[] = [];
  private doorLabels: { sprite: THREE.Sprite; portal: PortalDef }[] = [];
  private gardenGroup: THREE.Group | null = null;
  private focusBeacon: THREE.Mesh | null = null;
  education!: EducationEngine;
  runner!: TaskRunner;
  combat: CombatSystem | null = null;
  private sniffCooldown = 0;

  constructor(protected s: SceneServices, levelId: string, private opts: { focusFossilId?: string | null } = {}) {
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
        onSpit: (origin, dir, carried) => {
          this.combat?.notePlayerAction('spit');
          this.spawnProjectile(origin, dir, carried);
        },
        onStompLand: (pos) => this.handleStomp(pos),
        onSpinStart: () => { /* spin damage windows live in CombatSystem */ },
        onRoar: (pos) => this.handleRoar(pos),
        onFellOut: () => this.respawn(false),
        onDizzy: () => this.handleDizzy(),
        shake: (a) => s.renderer.shake(a),
      },
      this.particles, s.audio,
      s.content.config.difficulty[s.session.data.difficulty].bonusHearts,
    );
    this.player.teleport(this.build.spawn, this.build.spawnYaw);
    this.player.brainSegments = s.session.brain;

    this.interactables = new InteractableManager(s.hud, s.input);
    this.education = new EducationEngine(s.content, s.session);
    this.runner = new TaskRunner({
      content: s.content,
      strings: s.strings,
      dialogue: s.dialogue,
      education: this.education,
      panel: s.panel,
      player: this.player,
      makeKit: () => new TaskKit(this.build.group, this.particles, s.audio, this.player, this.interactables),
      onTaskChainComplete: (headId, practice) => this.onTaskChainComplete(headId, practice),
    });
    registerTaskModules(this.runner);
    this.buildPortals();
    this.buildFossils();
    this.buildInfoPoints();
    this.buildGarden();
    this.buildTaskStations();
    this.buildBank();

    if ((def.enemies?.length ?? 0) > 0 || def.boss || (def.quizOrbs?.length ?? 0) > 0) {
      this.combat = new CombatSystem(
        s, def, this.player, this.particles, this.build.staticWorld, this.build.group, this.runner,
        (bossId, fossilId) => this.handleBossVictory(bossId, fossilId),
      );
    }

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

    // companions travel everywhere with Max
    this.party = new CompanionParty(s.content, s.renderer.scene, this.build.spawn, ['kenji', 'marcus', 'digger']);
    s.dialogue.setSpeakerHooks({
      onSpeakStart: (charId) => {
        const c = this.party.byId(charId);
        if (c) { c.setTalking(true); c.face(this.player.pos); }
      },
      onSpeakEnd: (charId) => this.party.byId(charId)?.setTalking(false),
    });

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
    for (const c of this.runner?.colliders ?? []) {
      collideAABB(res.position, radius, height, c.center, c.half, res);
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

  // ---------------- P3: doors, fossils, info points, garden ----------------
  private buildPortals(): void {
    const { strings, session } = this.s;
    for (const p of this.def.portals ?? []) {
      if (p.kind === 'walk') continue; // handled by proximity in update
      const group = new THREE.Group();
      const big = p.gateKey === 'vexGate';
      const w = big ? 5.2 : 3.2, h = big ? 6.4 : 4.4;
      const col = p.color ?? '#C8945A';
      const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.9), toonMat(col));
      pillarL.position.set(-w / 2, h / 2, 0);
      const pillarR = pillarL.clone(); pillarR.position.x = w / 2;
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.8, 1.1), toonMat(col));
      lintel.position.y = h + 0.4;
      const open = !p.sealed && session.doorOpen(p.gateKey ?? '');
      const glowColor = p.sealed ? '#5A5470' : open ? '#7FE0A0' : '#8A8498';
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.5, h - 0.3),
        new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      glow.position.y = h / 2 - 0.1;
      group.add(pillarL, pillarR, lintel, glow);
      group.position.set(...p.pos);
      group.rotation.y = p.yaw ?? 0;
      group.traverse((o) => { o.castShadow = true; });
      this.build.group.add(group);

      // label sprite: world name + fossil requirement
      const label = makeTextSprite(this.doorLabelText(p), big ? 480 : 380);
      label.position.set(p.pos[0], h + 1.6, p.pos[2]);
      this.build.group.add(label);
      this.doorLabels.push({ sprite: label, portal: p });

      const pos = new THREE.Vector3(...p.pos);
      this.interactables.add({
        id: `portal:${p.to}`,
        pos, radius: 3.4,
        label: p.sealed ? strings.get('prompt.locked') : open ? strings.get('prompt.enter') : strings.get('prompt.locked'),
        onInteract: () => this.tryPortal(p),
      });
    }
  }

  private doorLabelText(p: PortalDef): string {
    const { strings, session } = this.s;
    const name = strings.has(p.labelKey ?? '') ? strings.get(p.labelKey!) : p.to;
    if (p.sealed) return `${name}\n~ sealed ~`;
    const need = session.gateCost(p.gateKey ?? '');
    if (session.fossilCount >= need) return `${name}\n* open! *`;
    return `${name}\n* ${session.fossilCount} of ${need} *`;
  }

  private tryPortal(p: PortalDef): void {
    const { strings, session, dialogue } = this.s;
    if (p.sealed) {
      if (p.gateKey === 'vexGate') dialogue.bark('vex', 'gate', { priority: 2 });
      else void dialogue.sayText('digger', strings.get('door.sealed'));
      return;
    }
    const need = session.gateCost(p.gateKey ?? '');
    if (session.fossilCount < need) {
      this.s.audio.sfx('incorrect');
      void dialogue.sayText('digger', strings.get('door.locked', { need, have: session.fossilCount }));
      return;
    }
    this.s.audio.sfx('door');
    this.s.onPortal(p);
  }

  private buildFossils(): void {
    for (const f of this.def.fossils ?? []) {
      if (!f.pos || this.s.session.hasFossil(f.id)) continue;
      if (f.type === 'task' && f.taskId) continue;   // task fossils materialise on completion (P4)
      if (f.type === 'arena' || f.type === 'boss' || f.type === 'bonus') continue; // awarded via arenas/banks
      if (!this.fossilUnlocked(f)) { this.lockedFossils.push(f); continue; }
      this.spawnFossilPickup(f);
    }
    // focus beacon from fossil select
    if (this.opts.focusFossilId) {
      const f = (this.def.fossils ?? []).find((x) => x.id === this.opts.focusFossilId);
      if (f?.pos && !this.s.session.hasFossil(f.id)) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.55, 40, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: '#FFE87F', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
        );
        beam.position.set(f.pos[0], f.pos[1] + 18, f.pos[2]);
        this.build.group.add(beam);
        this.focusBeacon = beam;
      }
    }
  }

  private fossilUnlocked(f: FossilDefC): boolean {
    if (!f.unlock) return true;
    if (f.unlock.kind === 'mastery') return this.s.session.masteredTopicCount >= (f.unlock.count ?? 1);
    if (f.unlock.kind === 'flag') return this.s.session.flag(f.unlock.name ?? '');
    return true;
  }

  protected spawnFossilPickup(f: FossilDefC): void {
    if (!f.pos) return;
    this.fossilPickups.push(new FossilPickup(this.build.group, f.id, new THREE.Vector3(...f.pos)));
  }

  /** Award a fossil with full celebration (used by pickups, tasks, arenas, banks). */
  awardFossil(fossilId: string): void {
    const { session, strings, hud, dialogue, audio } = this.s;
    if (session.hasFossil(fossilId)) return;
    session.addFossil(fossilId, this.def.id);
    audio.sfx('fossil');
    hud.banner(strings.get('fossil.get'));
    const f = (this.def.fossils ?? []).find((x) => x.id === fossilId);
    if (f) hud.toast(strings.get(f.nameKey), 3.5);
    this.particles.confetti(this.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 50);
    this.s.renderer.shake(0.18);
    const who = this.party.ids();
    if (who.length) dialogue.bark(who[Math.floor(Math.random() * who.length)], 'fossil_get', { priority: 2 });
    dialogue.bark('max', 'fossil_get', { priority: 2 });
    this.refreshDoorLabels();
  }

  private refreshDoorLabels(): void {
    for (const d of this.doorLabels) {
      updateTextSprite(d.sprite, this.doorLabelText(d.portal));
    }
  }

  private buildInfoPoints(): void {
    for (const [i, ip] of (this.def.infoPoints ?? []).entries()) {
      const pos = new THREE.Vector3(...ip.pos);
      this.interactables.add({
        id: `info:${i}`,
        pos, radius: 2.6,
        label: ip.label ?? this.s.strings.get('prompt.talk'),
        onInteract: () => void this.s.dialogue.sayText(ip.speaker, this.s.strings.get(ip.textKey)),
      });
    }
  }

  private buildGarden(): void {
    if (!this.def.garden) return;
    this.gardenGroup = new THREE.Group();
    this.gardenGroup.position.set(...this.def.garden.pos);
    this.build.group.add(this.gardenGroup);
    this.renderGarden();
  }

  protected renderGarden(): void {
    if (!this.gardenGroup) return;
    this.gardenGroup.clear();
    const n = this.s.session.masteredTopicCount;
    for (let i = 0; i < Math.max(6, n); i++) {
      const x = (i % 3 - 1) * 1.6;
      const z = (Math.floor(i / 3) - 0.5) * 1.6;
      if (i < n) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.9, 6), toonMat('#4E9A5E'));
        stem.position.set(x, 0.45, z);
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), toonMat(['#FF8AB0', '#FFD24A', '#7FB2FF', '#C780FA'][i % 4]));
        bloom.position.set(x, 1.0, z);
        this.gardenGroup.add(stem, bloom);
      } else {
        const mound = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 5), toonMat('#7A5A38'));
        mound.scale.y = 0.4;
        mound.position.set(x, 0.05, z);
        this.gardenGroup.add(mound);
      }
    }
  }

  // ---------------- P4: task stations, bank, sniffing ----------------
  private buildTaskStations(): void {
    for (const t of this.def.tasks ?? []) {
      const pos = new THREE.Vector3(...t.pos);
      const def = this.s.content.tasks[t.ref];
      if (!def) continue;
      // pedestal: a friendly little podium with a bouncing icon
      const podium = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.7, 12), toonMat('#8A78B8'));
      base.position.y = 0.35;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), toonMat('#FFE87F', { emissive: '#FFD24A' }));
      orb.position.y = 1.15;
      podium.add(base, orb);
      podium.position.copy(pos);
      podium.traverse((o) => { o.castShadow = true; });
      this.build.group.add(podium);
      const label = makeTextSprite(def.title, 360);
      label.position.set(pos.x, pos.y + 2.3, pos.z);
      this.build.group.add(label);

      const fossil = (this.def.fossils ?? []).find((f) => f.taskId === t.ref);
      const isDone = fossil ? this.s.session.hasFossil(fossil.id) : false;
      this.interactables.add({
        id: `task:${t.ref}`,
        pos, radius: 2.4,
        label: this.s.strings.get(fossil && !isDone ? 'prompt.start' : 'prompt.practice'),
        enabled: () => !this.runner.isActive && !this.s.dialogue.cutsceneActive,
        onInteract: () => {
          const practice = !fossil || this.s.session.hasFossil(fossil.id);
          this.runner.start(t.ref, pos, t.yaw ?? 0, { practice });
        },
      });
    }
  }

  private onTaskChainComplete(headId: string, practice: boolean): void {
    const headDef = this.s.content.tasks[headId];
    if (headDef?.flagOnComplete) this.s.session.setFlag(headDef.flagOnComplete);
    const fossil = (this.def.fossils ?? []).find((f) => f.taskId === headId);
    if (fossil && !practice && !this.s.session.hasFossil(fossil.id)) {
      // the fossil pops out right where the work was done
      const t = (this.def.tasks ?? []).find((x) => x.ref === headId);
      const pos = t ? new THREE.Vector3(t.pos[0], t.pos[1] + 1.6, t.pos[2]) : this.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
      this.fossilPickups.push(new FossilPickup(this.build.group, fossil.id, pos));
      this.particles.burst(pos, '#FFE87F', 24, 4);
      this.s.audio.sfx('secret');
    } else {
      this.s.hud.toast(this.s.strings.get('task.practiceDone'));
    }
  }

  private buildBank(): void {
    if (!this.def.bank) return;
    const pos = new THREE.Vector3(...this.def.bank.pos);
    const kiosk = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.6, 8), toonMat('#C8952B'));
    body.position.y = 0.8;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.2), toonMat('#5A4A1A'));
    slot.position.set(0, 1.62, 0.5);
    kiosk.add(body, slot);
    kiosk.position.copy(pos);
    kiosk.traverse((o) => { o.castShadow = true; });
    this.build.group.add(kiosk);
    const target = this.s.content.config.economy.bonusFossilChips;
    const label = makeTextSprite(this.bankLabel(), 380);
    label.position.set(pos.x, pos.y + 2.6, pos.z);
    this.build.group.add(label);

    this.interactables.add({
      id: 'bank',
      pos, radius: 2.6,
      label: this.s.strings.get('prompt.bank'),
      onInteract: () => {
        const before = this.s.session.banked(this.def.id);
        const carried = this.s.session.chipsCarried;
        if (carried === 0 && before < target) {
          void this.s.dialogue.sayText('digger', `Pockets are empty, mate! ${this.s.strings.get('bank.progress', { banked: before, target })}.`);
          return;
        }
        const after = this.s.session.bankChips(this.def.id);
        this.s.audio.sfx('chip');
        this.s.hud.toast(this.s.strings.get('toast.chipsBanked', { n: after - before }));
        updateTextSprite(label, this.bankLabel());
        const bonus = (this.def.fossils ?? []).find((f) => f.type === 'bonus');
        if (bonus && after >= target && !this.s.session.hasFossil(bonus.id)) {
          this.s.audio.sfx('secret');
          void this.s.dialogue.sayText('digger', this.s.strings.get('bank.reward'));
          this.fossilPickups.push(new FossilPickup(this.build.group, bonus.id, pos.clone().add(new THREE.Vector3(0, 2.2, 0))));
          this.particles.confetti(pos.clone().add(new THREE.Vector3(0, 2, 0)), 30);
        }
      },
    });
  }

  private bankLabel(): string {
    const target = this.s.content.config.economy.bonusFossilChips;
    return `${this.s.strings.get('bank.title')}\n${this.s.session.banked(this.def.id)} of ${target}`;
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

  /** Task items + chompable (stunned) enemies. */
  protected extraGrabTarget(pos: THREE.Vector3, fwd: THREE.Vector3, range: number): CarryTarget | null {
    return this.runner?.getGrabTarget(pos, fwd, range)
      ?? this.combat?.getGrabTarget(pos, fwd, range)
      ?? null;
  }

  private handleBossVictory(bossId: string, fossilId?: string): void {
    const fossil = (this.def.fossils ?? []).find((f) => f.id === fossilId);
    const pos = fossil?.pos
      ? new THREE.Vector3(...fossil.pos)
      : this.player.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    if (fossilId && !this.s.session.hasFossil(fossilId)) {
      this.fossilPickups.push(new FossilPickup(this.build.group, fossilId, pos.add(new THREE.Vector3(0, 1.2, 0))));
      this.particles.burst(pos, '#FFE87F', 26, 5);
      this.s.audio.sfx('secret');
    }
    void bossId;
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
    this.combat?.playerStomp(pos);
  }

  protected handleRoar(pos: THREE.Vector3): void {
    const r = this.s.content.config.player.roarRadius;
    this.particles.ring(pos, '#BFE3FF', r * 0.5, 32);
    for (const b of this.build.breakables) {
      if (b.broken || b.kind !== 'roarwall') continue;
      if (b.mesh.position.distanceTo(pos) < r + Math.max(b.half.x, b.half.z)) this.breakBlock(b);
    }
    this.combat?.playerRoar(pos);
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
    setTimeout(() => {
      this.respawn(true);
      this.s.dialogue.bark('digger', 'revive', { priority: 2 });
    }, 1600);
  }

  protected respawn(fromDizzy: boolean): void {
    this.player.revive(this.checkpoint.clone().add(new THREE.Vector3(0, 0.5, 0)));
    if (!fromDizzy) this.s.renderer.shake(0.2);
    if (fromDizzy) this.combat?.onPlayerRetry();
  }

  private collectChip(): void {
    this.chipsCollected++;
    this.s.session.addChip();
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

    // spring pads (wake up once Kenji's Spring Boots are built — §4.6)
    const padsLive = this.def.kind === 'playground' || this.s.session.hasGadget('spring_boots');
    for (const sp of this.springPads) {
      sp.anim = Math.max(0, sp.anim - dt * 3);
      sp.mesh.scale.y = 1 - sp.anim * 0.4;
      const coil = sp.mesh.children[1] as THREE.Mesh | undefined;
      if (coil) coil.material = padsLive ? toonMat('#7FE0A0', { emissive: '#3ECB70' }) : toonMat('#8A9A8E');
      if (!padsLive) continue;
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
        } else if (pr.carried.kind === 'item') {
          // task item: settle it and let the active task judge the landing spot
          if (hit) pr.mesh.position.copy(hit.point);
          this.build.group.attach(pr.mesh);
          this.runner.notifyItemReleased(pr.carried, pr.mesh.position.clone());
        } else {
          pr.mesh.parent?.remove(pr.mesh);
        }
        this.projectiles.splice(this.projectiles.indexOf(pr), 1);
      }
    }

    this.updateExtras(dt);
    this.particles.update(dt);
  }

  /** NPCs, tasks, enemies, hazards, ambient voice. */
  protected updateExtras(rawDt: number): void {
    const dt = this.combat ? this.combat.consumeHitPause(rawDt) : rawDt;
    this.combat?.update(dt);
    // companions + ambient voice
    this.party.update(dt, this.player.pos, this.player.facing, this.build.staticWorld,
      this.s.content.config.companions.catchUpTeleport);

    // interaction prompts + presses
    this.interactables.update(this.player.pos, this.s.isUiBlocked() || this.s.dialogue.cutsceneActive);

    // fossil pickups (platforming/secret types sitting in the world)
    for (const fp of this.fossilPickups) {
      if (fp.update(this.time, this.player.pos)) this.awardFossil(fp.fossilId);
    }
    // condition-gated fossils appearing live (garden mastery, arena flag)
    if (this.lockedFossils.length) {
      const ready = this.lockedFossils.filter((f) => this.fossilUnlocked(f));
      for (const f of ready) {
        this.lockedFossils.splice(this.lockedFossils.indexOf(f), 1);
        this.spawnFossilPickup(f);
        this.particles.burst(new THREE.Vector3(...(f.pos ?? [0, 0, 0])), '#FFE87F', 20, 4);
        this.s.audio.sfx('secret');
      }
    }
    if (this.focusBeacon) this.focusBeacon.rotation.y += dt * 0.5;

    // learning tasks
    this.runner.update(dt);

    // Digger's nose: passive pings near undiscovered secrets, plus the T key
    this.sniffCooldown = Math.max(0, this.sniffCooldown - dt);
    const secrets = (this.def.fossils ?? []).filter((f) => f.type === 'secret' && f.pos && !this.s.session.hasFossil(f.id));
    if (secrets.length) {
      const near = secrets.find((f) => new THREE.Vector3(...f.pos!).distanceTo(this.player.pos) < this.s.content.config.companions.sniffRadius);
      if (near && this.sniffCooldown === 0) {
        this.sniffCooldown = 14;
        this.s.dialogue.bark('digger', 'sniff', { priority: 1 });
      }
      if (this.s.input.pressed('sniff') && !this.s.dialogue.cutsceneActive) {
        const digger = this.party.byId('digger');
        const nearest = secrets.reduce((a, b) =>
          new THREE.Vector3(...a.pos!).distanceToSquared(this.player.pos) < new THREE.Vector3(...b.pos!).distanceToSquared(this.player.pos) ? a : b);
        const target = new THREE.Vector3(...nearest.pos!);
        this.s.dialogue.bark('digger', 'sniff', { priority: 2 });
        const from = (digger?.pos ?? this.player.pos).clone().add(new THREE.Vector3(0, 0.6, 0));
        for (let i = 0; i < 10; i++) {
          const p = from.clone().lerp(target, i / 10);
          this.particles.sparkle(p, '#9FC2EA', 1);
        }
      }
    }

    // hazards (steam vents lift; bumpers bonk)
    for (const h of this.def.hazards ?? []) {
      const period = h.period ?? 4;
      const onTime = h.onTime ?? 1.4;
      const phase = this.time % period;
      const pos = new THREE.Vector3(...h.pos);
      if (h.kind === 'steam') {
        if (phase < onTime) {
          this.particles.steam(pos, 2);
          if (this.player.pos.distanceTo(pos) < 1.4 && this.player.pos.y < pos.y + (h.height ?? 5)) {
            if (this.player.vel.y < 7) this.player.launch(11);
          }
        }
      } else if (h.kind === 'bumper') {
        if (this.player.pos.distanceTo(pos) < 1.2) {
          this.player.takeDamage(h.damage ?? 0.5, pos);
        }
      }
    }

    // brain power sync into the save
    if (this.player.brainSegments !== this.s.session.brain) {
      this.s.session.setBrain(this.player.brainSegments);
    }

    // cutscenes freeze the player and can be advanced with interact/jump
    if (this.s.dialogue.cutsceneActive) {
      if (this.player.state !== 'dizzy') this.player.state = 'locked';
      if (this.s.input.pressed('interact') || this.s.input.pressed('jump')) this.s.dialogue.skip();
    } else if (this.player.state === 'locked') {
      this.player.state = 'normal';
    }

    // idle nudges + quiet banter
    const moving = this.s.input.moveVector().x !== 0 || this.s.input.moveVector().y !== 0;
    this.idleTimer = moving || this.s.dialogue.speaking ? 0 : this.idleTimer + dt;
    if (this.idleTimer > 22) {
      this.idleTimer = 0;
      this.s.dialogue.idleNudge(this.party.ids());
    }
    if (moving && !this.s.dialogue.cutsceneActive) this.s.dialogue.maybeBanter(this.party.ids());
  }
  protected projectileLanded(_pr: { mesh: THREE.Object3D; carried: CarryTarget }, _hit: THREE.Intersection | null): void { /* combat uses this */ }

  dispose(): void {
    this.combat?.dispose();
    this.runner.cancel();
    this.s.panel.hide();
    this.s.renderer.scene.remove(this.build.group);
    this.s.renderer.scene.remove(this.player.rig.root);
    for (const c of this.party.actors) this.s.renderer.scene.remove(c.rig.root);
    this.s.dialogue.setSpeakerHooks({});
    this.interactables.clear();
    this.s.hud.hidePrompt();
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
