import * as THREE from 'three';
import { toonMat } from '../../../engine/renderer';
import { makeTextSprite, updateTextSprite } from '../../world/textSprite';
import type { TaskContext, TaskInstance } from '../runner';
import type { BuildSlot } from '../../../engine/types';

/**
 * BUILD-IT (§5.3.1): choose parts on pedestals, stomp TEST, watch the result.
 * The design loop (plan→build→test→improve) is the explicit mechanic. Goal
 * kinds: gearSpeed/gearForce (ratios), leverBalance, springLaunch, matchSlots.
 */
export function buildit(ctx: TaskContext): TaskInstance {
  const def = ctx.def;
  const slots = def.slots ?? [];
  const goal = def.goal!;
  const fwd = new THREE.Vector3(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);

  ctx.panel.show(def.goalText ?? def.title, ctx.strings.get('task.buildit.help'));
  const chosen = new Map<string, number>(); // slot id → option index
  let attempts = 0;
  let testing = false;
  let done = false;
  let spinT = 0;

  interface SlotRig { def: BuildSlot; group: THREE.Group; partHolder: THREE.Group; label: THREE.Sprite; pos: THREE.Vector3 }
  const rigs: SlotRig[] = slots.map((slot, i) => {
    const pos = ctx.origin.clone()
      .addScaledVector(fwd, 3.6)
      .addScaledVector(side, (i - (slots.length - 1) / 2) * 3.0);
    const group = new THREE.Group();
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 10), toonMat('#7A7A88'));
    pedestal.position.y = 0.45;
    const partHolder = new THREE.Group();
    partHolder.position.y = 1.35;
    const label = makeTextSprite('', 300);
    label.position.y = 2.6;
    group.add(pedestal, partHolder, label);
    group.position.copy(pos);
    group.traverse((o) => { o.castShadow = true; });
    ctx.kit.group.add(group);
    chosen.set(slot.id, 0);
    const rig = { def: slot, group, partHolder, label, pos };
    renderSlot(rig);
    ctx.kit.addInteractable({
      id: `buildit:${def.id}:${slot.id}`,
      pos, radius: 2.0,
      label: ctx.strings.get('task.buildit.tryPart'),
      onInteract: () => {
        if (testing || done) return;
        chosen.set(slot.id, (chosen.get(slot.id)! + 1) % slot.options.length);
        renderSlot(rig);
        ctx.kit.audio.sfx('gear');
      },
    });
    return rig;
  });

  const testPad = ctx.kit.makePad(ctx.origin.clone().addScaledVector(fwd, 0.8), ctx.strings.get('task.buildit.test'), '#6BCB77');

  function renderSlot(rig: SlotRig): void {
    const idx = chosen.get(rig.def.id)!;
    const opt = rig.def.options[idx];
    updateTextSprite(rig.label, `${rig.def.label}\n${opt.label}`);
    rig.partHolder.clear();
    rig.partHolder.add(partMesh(def.variant ?? 'gears', opt.value, opt.id));
  }

  function evaluate(): { pass: boolean; report: string } {
    const val = (id: string): number => {
      const slot = slots.find((s) => s.id === id)!;
      return slot.options[chosen.get(id)!].value;
    };
    switch (goal.kind) {
      case 'gearSpeed': {
        const driver = val(slots[0].id), output = val(slots[slots.length - 1].id);
        const ratio = driver / output;
        const pass = ratio >= (goal.min ?? 1) && (goal.max === undefined || ratio <= goal.max);
        return { pass, report: `The drive gear has ${driver} teeth and the output has ${output} — the output spins ${round1(ratio)} turns per crank.` };
      }
      case 'gearForce': {
        const driver = val(slots[0].id), output = val(slots[slots.length - 1].id);
        const ratio = output / driver;
        const pass = ratio >= (goal.min ?? 1);
        return { pass, report: `${output} teeth driven by ${driver} — ${round1(ratio)}× the turning force.` };
      }
      case 'leverBalance': {
        const weight = val('weight');
        const arm = val('arm');
        const need = (goal.loadValue ?? 1) * (goal.loadArm ?? 1);
        const have = weight * arm;
        return { pass: have === need, report: `${weight} × ${arm} = ${have}, and the load is ${goal.loadValue} × ${goal.loadArm} = ${need}.` };
      }
      case 'springLaunch': {
        const k = val('spring');
        const lever = val('lever');
        const power = k * lever;
        const pass = power >= (goal.min ?? 0) && power <= (goal.max ?? Infinity);
        return { pass, report: `Spring ${k} × lever ${lever} = bounce power ${power}.` };
      }
      case 'matchSlots': {
        const wrong = Object.entries(goal.solution ?? {}).filter(([slotId, optId]) => {
          const slot = slots.find((s) => s.id === slotId)!;
          return slot.options[chosen.get(slotId)!].id !== optId;
        });
        return { pass: wrong.length === 0, report: wrong.length ? `${wrong.length} part${wrong.length > 1 ? 's are' : ' is'} in the wrong place.` : 'Every part in its place!' };
      }
      default: return { pass: false, report: '?' };
    }
  }

  return {
    update: (dt) => {
      if (done) return;
      if (spinT > 0) {
        spinT -= dt;
        for (const [i, rig] of rigs.entries()) {
          rig.partHolder.rotation.z += dt * (i === 0 ? 4 : 4 * (i % 2 === 0 ? 1 : -1)) * 0.8;
        }
        if (spinT <= 0 && !done) testing = false;
      }
      if (!testing && ctx.kit.padTriggered(testPad)) {
        testing = true;
        attempts++;
        testPad.pulse();
        const { pass, report } = evaluate();
        spinT = 1.6;
        ctx.kit.audio.sfx('gear');
        setTimeout(() => {
          if (pass) {
            done = true;
            ctx.kit.audio.sfx('correct');
            ctx.kit.particles.confetti(ctx.origin.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, 2, 0)), 26);
            ctx.education.recordAnswer(def.topicId ?? 'gears-levers', true, 1, attempts === 1);
            ctx.player.addBrain(1);
            ctx.panel.hide();
            void ctx.voice.sayText(ctx.speaker, report).then(() => ctx.complete());
          } else {
            ctx.kit.audio.sfx('incorrect');
            ctx.panel.flash(false);
            ctx.education.recordAnswer(def.topicId ?? 'gears-levers', false, 1, attempts === 1);
            const fail = def.failText ?? 'Not quite — the design loop says: test, learn, improve!';
            void (async () => {
              await ctx.voice.sayText(ctx.speaker, report);
              await ctx.voice.sayText(ctx.speaker, fail);
              if (attempts >= 2) await ctx.voice.say(ctx.speaker, 'hint_buildit', { hint: def.goalText ?? '' });
              testing = false;
            })();
          }
        }, 1650);
      }
    },
    dispose: () => ctx.panel.hide(),
  };
}

function partMesh(variant: string, value: number, optId: string): THREE.Object3D {
  switch (variant) {
    case 'gears': case 'cogpuzzle': {
      const r = 0.25 + (value / 40) * 0.65;
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.18, 14), toonMat('#C89A3B'));
      disc.rotation.x = Math.PI / 2;
      g.add(disc);
      const teeth = Math.max(6, Math.round(value / 2));
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.18), toonMat('#C89A3B'));
        tooth.position.set(Math.cos(a) * (r + 0.04), Math.sin(a) * (r + 0.04), 0);
        g.add(tooth);
      }
      return g;
    }
    case 'lever': {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3 + value / 800, 0.3 + value / 800, 0.3 + value / 800), toonMat('#8A8A96'));
      g.add(box);
      return g;
    }
    case 'spring': {
      const g = new THREE.Group();
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3 + value / 12, 8), toonMat('#7FE0A0'));
      g.add(coil);
      return g;
    }
    case 'bones': {
      const g = new THREE.Group();
      const skull = optId.includes('skull');
      const tail = optId.includes('tail');
      if (skull) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.5), toonMat('#EDE3CE'));
        g.add(m);
      } else if (tail) {
        for (let i = 0; i < 3; i++) {
          const seg = new THREE.Mesh(new THREE.BoxGeometry(0.28 - i * 0.06, 0.16, 0.2), toonMat('#EDE3CE'));
          seg.position.x = i * 0.26;
          g.add(seg);
        }
      } else {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8), toonMat('#EDE3CE'));
        m.rotation.z = Math.PI / 2;
        const k1 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), toonMat('#EDE3CE'));
        k1.position.x = 0.32;
        const k2 = k1.clone(); k2.position.x = -0.32;
        m.add(k1, k2);
        g.add(m);
      }
      return g;
    }
    default: {
      return new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), toonMat('#A0A0B0'));
    }
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
