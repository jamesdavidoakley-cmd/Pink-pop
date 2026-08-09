import * as THREE from 'three';
import type { TaskContext, TaskInstance } from '../runner';
import type { CarryTarget } from '../../player/player';

/**
 * SORT-IT (§5.3.3): chomp items, carry them to the right labelled platform.
 * Wrong drops boing the item home with a warm line; no penalties.
 */
export function sortit(ctx: TaskContext): TaskInstance {
  const def = ctx.def;
  const bins = def.bins ?? [];
  const items = def.items ?? [];
  const fwd = new THREE.Vector3(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);

  ctx.panel.show(def.title, ctx.strings.get('task.sortit.help'));

  // bins: labelled platforms in a row ahead
  const binPads = bins.map((b, i) => {
    const pos = ctx.origin.clone()
      .addScaledVector(fwd, 4.4)
      .addScaledVector(side, (i - (bins.length - 1) / 2) * 3.2);
    const pad = ctx.kit.makePad(pos, b.label, '#7A88A8');
    return { def: b, pad, count: 0 };
  });

  // items: scattered chompables between player and bins
  const itemEntries = items.map((it, i) => {
    const pos = ctx.origin.clone()
      .addScaledVector(fwd, 1.6 + (i % 3) * 0.9)
      .addScaledVector(side, ((i % 4) - 1.5) * 1.5);
    const entry = ctx.kit.makeItem(pos, it.label, it.shape ?? 'ball', it.color ?? '#C8A868');
    return { def: it, entry, sorted: false };
  });

  let remaining = itemEntries.length;
  let missCount = 0;

  const instance: TaskInstance = {
    update: () => { /* carried logic handled via onItemReleased */ },
    onItemReleased: (target: CarryTarget, at: THREE.Vector3) => {
      const item = itemEntries.find((e) => e.entry.target === target);
      if (!item || item.sorted) return;
      // which bin (if any) did it land near?
      const bin = binPads.find((b) => {
        const d = b.pad.pos.clone().setY(0).distanceTo(at.clone().setY(0));
        return d < 2.1;
      });
      if (!bin) {
        // dropped in the open — just walk it home
        item.entry.root.position.copy(item.entry.home);
        ctx.kit.markItemReturned(item.entry.root);
        return;
      }
      if (bin.def.id === item.def.bin) {
        item.sorted = true;
        remaining--;
        bin.count++;
        item.entry.root.position.copy(bin.pad.pos).add(new THREE.Vector3((bin.count - 1) * 0.35 - 0.5, 0.42, 0));
        const sprite = item.entry.root.children.find((c) => (c as THREE.Sprite).isSprite);
        if (sprite) sprite.visible = false;
        bin.pad.pulse();
        ctx.kit.audio.sfx('correct');
        ctx.kit.particles.burst(bin.pad.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), '#6BCB77', 10, 3);
        ctx.player.addBrain(remaining === 0 ? 1 : 0);
        ctx.education.recordAnswer(def.topicId ?? 'rocks-soils', true, 1, missCount === 0);
        if (item.def.fact && remaining % 2 === 0) {
          void ctx.voice.sayText(ctx.speaker, item.def.fact);
        }
        if (remaining === 0) {
          ctx.panel.hide();
          setTimeout(() => ctx.complete(), 700);
        }
      } else {
        missCount++;
        ctx.kit.audio.sfx('boing');
        ctx.education.recordAnswer(def.topicId ?? 'rocks-soils', false, 1, false);
        item.entry.root.position.copy(item.entry.home);
        ctx.kit.markItemReturned(item.entry.root);
        void (async () => {
          await ctx.voice.say(ctx.speaker, 'incorrect_gentle');
          const hint = item.def.fact ?? `Think about what "${item.def.label}" really is.`;
          await ctx.voice.say(ctx.speaker, 'hint_sortit', { hint });
        })();
      }
    },
    dispose: () => ctx.panel.hide(),
  };
  return instance;
}
