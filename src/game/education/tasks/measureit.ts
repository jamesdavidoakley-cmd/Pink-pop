import * as THREE from 'three';
import { toonMat } from '../../../engine/renderer';
import type { TaskContext, TaskInstance } from '../runner';

/**
 * MEASURE-IT (§5.3.2): in-world jug/scale — nudge the amount with +/− pads,
 * stomp the big green ✓. Tier picks harder targets. Warm loop on misses.
 */
export function measureit(ctx: TaskContext): TaskInstance {
  const def = ctx.def;
  const unit = def.unit ?? 'ml';
  const step = def.step ?? 50;
  const max = def.max ?? 500;
  const tier = def.topicId ? ctx.education.tierFor(def.topicId) : 1;
  const targets = def.targets?.[String(tier)] ?? def.targets?.['1'] ?? [Math.round(max / 2)];
  let target = targets[Math.floor(Math.random() * targets.length)];
  let current = 0;
  let misses = 0;
  let done = false;

  const fwd = new THREE.Vector3(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);

  // the vessel: a big jug with a rising fill column
  const jugPos = ctx.origin.clone().addScaledVector(fwd, 3.4);
  const jug = new THREE.Group();
  const glassMat = new THREE.MeshToonMaterial({ color: '#B8D8E8', transparent: true, opacity: 0.4 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.75, 2.2, 14, 1, true), glassMat);
  glass.position.y = 1.1;
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.15, 14), toonMat('#8AA8B8'));
  bottom.position.y = 0.07;
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.68, 1, 14), toonMat('#5AB8E8', { emissive: '#2A88C8' }));
  fill.position.y = 0.2;
  fill.scale.y = 0.01;
  jug.add(bottom, glass, fill);
  jug.position.copy(jugPos);
  ctx.kit.group.add(jug);

  const readout = ctx.kit.makeFloatingLabel(jugPos.clone().add(new THREE.Vector3(0, 3.0, 0)), `0 ${unit}`, 320, '#9FDCFF');
  const showTarget = (): void => ctx.panel.show(`${def.title}: make exactly ${target} ${unit}`, ctx.strings.get('task.measureit.help'));
  showTarget();
  void ctx.voice.sayText(ctx.speaker, `We need exactly ${target} ${unit}. Use the pads!`);

  const minus = ctx.kit.makePad(ctx.origin.clone().addScaledVector(side, -2.4).addScaledVector(fwd, 1.6), `− ${step}`, '#B87A6A');
  const plus = ctx.kit.makePad(ctx.origin.clone().addScaledVector(side, 2.4).addScaledVector(fwd, 1.6), `+ ${step}`, '#6A9AB8');
  const confirm = ctx.kit.makePad(ctx.origin.clone().addScaledVector(fwd, 0.6), '✓', '#6BCB77');
  let cooldown = 0;
  // ✓ is edge-triggered: standing on it must not re-submit over and over
  let confirmWasOn = true;

  const setAmount = (v: number): void => {
    current = THREE.MathUtils.clamp(v, 0, max);
    const frac = current / max;
    fill.scale.y = Math.max(0.01, frac * 2.0);
    fill.position.y = 0.2 + frac;
    (readout as THREE.Sprite & { userData: { canvas?: HTMLCanvasElement } }); // sprite update below
    import('../../world/textSprite').then(({ updateTextSprite }) => updateTextSprite(readout, `${current} ${unit}`));
  };

  return {
    update: (dt) => {
      if (done) return;
      cooldown = Math.max(0, cooldown - dt);
      const confirmOn = ctx.kit.padTriggered(confirm);
      const confirmEntered = confirmOn && !confirmWasOn;
      confirmWasOn = confirmOn;
      if (cooldown === 0) {
        if (ctx.kit.padTriggered(plus)) { setAmount(current + step); plus.pulse(); ctx.kit.audio.sfx('pop'); cooldown = 0.34; }
        else if (ctx.kit.padTriggered(minus)) { setAmount(current - step); minus.pulse(); ctx.kit.audio.sfx('pop'); cooldown = 0.34; }
        else if (confirmEntered) {
          cooldown = 0.8;
          confirm.pulse();
          if (current === target) {
            done = true;
            ctx.kit.audio.sfx('correct');
            ctx.kit.particles.burst(jugPos.clone().add(new THREE.Vector3(0, 2, 0)), '#5AB8E8', 20, 4);
            ctx.education.recordAnswer(def.topicId ?? 'measurement', true, tier, misses === 0);
            ctx.player.addBrain(1);
            ctx.panel.hide();
            void ctx.voice.say(ctx.speaker, misses === 0 ? 'correct_first_try' : 'correct_after_hint')
              .then(() => ctx.complete());
          } else {
            misses++;
            ctx.kit.audio.sfx('incorrect');
            ctx.panel.flash(false);
            ctx.education.recordAnswer(def.topicId ?? 'measurement', false, tier, misses === 1);
            const diff = target - current;
            const hint = diff > 0
              ? `We have ${current} ${unit} — we need ${Math.abs(diff)} ${unit} more.`
              : `We have ${current} ${unit} — that's ${Math.abs(diff)} ${unit} too much.`;
            if (misses === 1) {
              void (async () => {
                await ctx.voice.say(ctx.speaker, 'incorrect_gentle');
                await ctx.voice.say(ctx.speaker, 'hint_measureit', { hint });
              })();
            } else {
              // teach: show the exact amount, then a fresh target to earn it
              void (async () => {
                await ctx.voice.say(ctx.speaker, 'teach', { explain: `Watch the jug — ${target} ${unit} looks like this.` });
                setAmount(target);
                await sleep(1500);
                setAmount(0);
                target = targets[Math.floor(Math.random() * targets.length)];
                misses = 0;
                showTarget();
                await ctx.voice.sayText(ctx.speaker, `Fresh try: ${target} ${unit}. You have this!`);
              })();
            }
          }
        }
      }
    },
    dispose: () => ctx.panel.hide(),
  };
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
