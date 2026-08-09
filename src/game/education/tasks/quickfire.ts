import * as THREE from 'three';
import type { TaskContext, TaskInstance } from '../runner';
import type { AskPresenter, QuestionInstance } from '../engine';
import type { Pad } from '../taskKit';

/**
 * QUICK-FIRE (§5.3.8): spoken question, three physical answer platforms,
 * stomp (or stand on) one to answer. Adaptive topic selection when enabled.
 */
export function quickfire(ctx: TaskContext): TaskInstance {
  const count = ctx.def.count ?? 3;
  let pads: Pad[] = [];
  let resolvePick: ((i: number) => void) | null = null;
  let armed = false;
  let offPadSinceArm = false;
  let disposed = false;
  let current: QuestionInstance | null = null;

  const presenter: AskPresenter = {
    present: (q, attempt) => {
      current = q;
      ctx.panel.show(q.text, ctx.strings.get('task.quickfire.help'));
      if (pads.length === 0) {
        const fwd = new THREE.Vector3(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
        const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
        for (let i = 0; i < 3; i++) {
          const pos = ctx.origin.clone()
            .addScaledVector(fwd, 3.2)
            .addScaledVector(side, (i - 1) * 2.6);
          pads.push(ctx.kit.makePad(pos, q.choices[i] ?? '', '#8898B8'));
        }
      }
      pads.forEach((p, i) => { p.setLabel(q.choices[i] ?? ''); p.setColor('#8898B8'); });
      void attempt;
      armed = false;
      offPadSinceArm = false; // must step OFF, then onto an answer — no auto-answers
      setTimeout(() => { armed = true; }, 450);
      return new Promise<number>((resolve) => { resolvePick = resolve; });
    },
    onCorrect: () => {
      ctx.panel.flash(true);
      ctx.kit.audio.sfx('correct');
      if (current) {
        const pad = pads[current.correctIndex];
        if (pad) { pad.setColor('#6BCB77'); pad.pulse(); ctx.kit.particles.burst(pad.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), '#6BCB77', 14, 3); }
      }
      ctx.player.addBrain(1);
    },
    onIncorrect: () => {
      ctx.panel.flash(false);
      ctx.kit.audio.sfx('incorrect');
    },
    dispose: () => { /* pads cleaned by kit */ },
  };

  const run = async (): Promise<void> => {
    for (let i = 0; i < count && !disposed; i++) {
      const topic = ctx.def.adaptive !== false
        ? ctx.education.pickWeakTopic(ctx.def.topics ?? (ctx.def.topicId ? [ctx.def.topicId] : undefined))
        : ctx.def.topicId ?? 'place-value';
      await ctx.education.ask(topic, presenter, ctx.voice, { intro: i === 0 });
      await sleep(500);
    }
    if (!disposed) {
      ctx.panel.hide();
      ctx.complete();
    }
  };
  void run();

  return {
    update: () => {
      const onPad = pads.findIndex((p) => ctx.kit.padTriggered(p));
      // dev/test visibility into the answer gate
      (ctx.kit.group.userData as Record<string, unknown>).qf = {
        armed, off: offPadSinceArm, waiting: !!resolvePick, onPad,
      };
      if (!resolvePick || !armed) return;
      if (onPad === -1) { offPadSinceArm = true; return; }
      if (!offPadSinceArm) return;
      const r = resolvePick;
      resolvePick = null;
      r(onPad);
    },
    dispose: () => { disposed = true; pads = []; ctx.panel.hide(); },
  };
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
