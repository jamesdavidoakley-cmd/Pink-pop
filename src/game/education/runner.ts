import * as THREE from 'three';
import type { Content, Strings } from '../../engine/loader';
import type { TaskDef } from '../../engine/types';
import type { DialogueEngine } from '../dialogue/engine';
import type { EducationEngine, AskVoice } from './engine';
import type { QuestionPanel } from './panel';
import type { TaskKit } from './taskKit';
import type { CarryTarget, Player } from '../player/player';
import { bus } from '../../engine/events';

/**
 * Runs learning tasks in the world: one active task, chain sequencing,
 * fossil award on chain completion, practice mode for the café/arena/hub.
 * Task archetypes are self-registered modules (§5.3) — see registry.ts.
 */

export interface TaskContext {
  def: TaskDef;
  origin: THREE.Vector3;
  yaw: number;
  kit: TaskKit;
  content: Content;
  strings: Strings;
  dialogue: DialogueEngine;
  education: EducationEngine;
  panel: QuestionPanel;
  player: Player;
  voice: AskVoice;
  speaker: string;
  practice: boolean;
  complete(): void;
}

export interface TaskInstance {
  update(dt: number): void;
  /** Called when the player drops/spits a carried task item. */
  onItemReleased?(target: CarryTarget, at: THREE.Vector3): void;
  dispose(): void;
}

export type TaskModule = (ctx: TaskContext) => TaskInstance;

export interface RunnerHost {
  content: Content;
  strings: Strings;
  dialogue: DialogueEngine;
  education: EducationEngine;
  panel: QuestionPanel;
  player: Player;
  makeKit(): TaskKit;
  onTaskChainComplete(headTaskId: string, practice: boolean): void;
}

export class TaskRunner {
  private modules = new Map<string, TaskModule>();
  private active: {
    headId: string;
    def: TaskDef;
    instance: TaskInstance;
    kit: TaskKit;
    chainRemaining: string[];
    origin: THREE.Vector3;
    yaw: number;
    practice: boolean;
  } | null = null;

  constructor(private host: RunnerHost) {}

  register(type: string, module: TaskModule): void {
    this.modules.set(type, module);
  }

  get isActive(): boolean { return this.active !== null; }
  get activeHeadId(): string | null { return this.active?.headId ?? null; }

  start(taskId: string, origin: THREE.Vector3, yaw: number, opts: { practice?: boolean; headId?: string } = {}): boolean {
    const def = this.host.content.tasks[taskId];
    if (!def) { console.error(`unknown task ${taskId}`); return false; }
    const module = this.modules.get(def.type);
    if (!module) { console.warn(`task archetype '${def.type}' not yet shipped`); return false; }
    this.cancel();
    const kit = this.host.makeKit();
    const speaker = def.speaker ?? 'kenji';
    const voice: AskVoice = {
      say: (c, pool, vars) => this.host.dialogue.say(c, pool, { vars, priority: 2 }),
      sayText: (c, t) => this.host.dialogue.sayText(c, t, { priority: 2 }),
      pickAskSpeaker: (styles) => this.host.dialogue.pickAskSpeaker(styles),
    };
    const headId = opts.headId ?? taskId;
    const chainRemaining = [...(def.chain ?? [])];
    const ctx: TaskContext = {
      def, origin: origin.clone(), yaw, kit,
      content: this.host.content, strings: this.host.strings,
      dialogue: this.host.dialogue, education: this.host.education,
      panel: this.host.panel, player: this.host.player,
      voice, speaker, practice: opts.practice ?? false,
      complete: () => this.completeStep(),
    };
    if (def.intro) void this.host.dialogue.sayText(speaker, def.intro, { priority: 2 });
    const instance = module(ctx);
    this.active = { headId, def, instance, kit, chainRemaining, origin: origin.clone(), yaw, practice: opts.practice ?? false };
    bus.emit('TaskStarted', { taskId });
    return true;
  }

  private completeStep(): void {
    if (!this.active) return;
    const { def, chainRemaining, origin, yaw, practice, headId } = this.active;
    if (def.success) void this.host.dialogue.sayText(def.speaker ?? 'kenji', def.success, { priority: 2 });
    bus.emit('TaskCompleted', { taskId: def.id });
    if (def.topicId) this.host.education.awardTaughtXp(def.topicId);
    const next = chainRemaining.shift();
    const kit = this.active.kit;
    if (next) {
      // brief beat between chain steps, then continue at the same site
      const remaining = [...chainRemaining];
      setTimeout(() => {
        this.disposeActive();
        this.startChained(next, remaining, origin, yaw, practice, headId);
      }, 900);
      kit.audio.sfx('correct');
    } else {
      kit.audio.sfx('fossil');
      this.disposeActive();
      this.host.onTaskChainComplete(headId, practice);
    }
  }

  private startChained(taskId: string, remaining: string[], origin: THREE.Vector3, yaw: number, practice: boolean, headId: string): void {
    this.start(taskId, origin, yaw, { practice, headId });
    if (this.active) this.active.chainRemaining = remaining;
  }

  private disposeActive(): void {
    if (!this.active) return;
    this.active.instance.dispose();
    this.active.kit.dispose();
    this.host.panel.hide();
    this.active = null;
  }

  cancel(): void { this.disposeActive(); }

  update(dt: number): void {
    if (!this.active) return;
    this.active.kit.update(dt);
    this.active.instance.update(dt);
  }

  getGrabTarget(pos: THREE.Vector3, fwd: THREE.Vector3, range: number): CarryTarget | null {
    return this.active?.kit.getGrabTarget(pos, fwd, range) ?? null;
  }

  /** The scene tells us when a carried task item was released (spit/dropped). */
  notifyItemReleased(target: CarryTarget, at: THREE.Vector3): void {
    this.active?.instance.onItemReleased?.(target, at);
  }

  get colliders(): { center: THREE.Vector3; half: THREE.Vector3 }[] {
    return this.active?.kit.colliders ?? [];
  }
}
