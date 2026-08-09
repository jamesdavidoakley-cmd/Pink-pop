import * as THREE from 'three';
import { toonMat } from '../../../engine/renderer';
import { makeTextSprite } from '../../world/textSprite';
import type { TaskContext, TaskInstance } from '../runner';

/**
 * NUMBER-PATH (§5.3.4): a stepping-stone path where only true-value tiles are
 * safe. Wrong tiles harmlessly boing Max back. Rule scales with tier.
 */

interface Tile {
  mesh: THREE.Mesh;
  sprite: THREE.Sprite;
  pos: THREE.Vector3;
  correct: boolean;
  row: number;
  state: 'idle' | 'good' | 'naughty';
}

export function numberpath(ctx: TaskContext): TaskInstance {
  const def = ctx.def;
  const tier = def.topicId ? ctx.education.tierFor(def.topicId) : 1;
  const rule = (def.tierRules?.[String(tier)] ?? def.rule)!;
  const length = def.length ?? 5;
  const width = def.width ?? 3;
  const fwd = new THREE.Vector3(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);

  ctx.panel.show(ruleText(rule), ctx.strings.get('task.numberpath.help'));
  void ctx.voice.sayText(ctx.speaker, ruleText(rule));

  const tiles: Tile[] = [];
  const usedValues = new Set<number>();
  for (let row = 0; row < length; row++) {
    const correctCol = Math.floor(Math.random() * width);
    const correctValue = correctValueFor(rule, row, usedValues);
    for (let col = 0; col < width; col++) {
      const correct = col === correctCol;
      const value = correct ? correctValue : distractorFor(rule, correctValue, usedValues);
      const pos = ctx.origin.clone()
        .addScaledVector(fwd, 2.6 + row * 2.5)
        .addScaledVector(side, (col - (width - 1) / 2) * 2.5);
      pos.y = ctx.origin.y + 0.1 + row * 0.02;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 1.9), toonMat('#B8A888'));
      mesh.position.copy(pos);
      mesh.castShadow = true; mesh.receiveShadow = true;
      ctx.kit.group.add(mesh);
      const sprite = makeTextSprite(fmt(value), 240);
      sprite.position.copy(pos).add(new THREE.Vector3(0, 1.0, 0));
      ctx.kit.group.add(sprite);
      ctx.kit.addCollider(pos.clone(), new THREE.Vector3(0.95, 0.2, 0.95), `tile:${row}:${col}`);
      tiles.push({ mesh, sprite, pos, correct, row, state: 'idle' });
    }
  }
  // goal platform past the last row
  const goalPos = ctx.origin.clone().addScaledVector(fwd, 2.6 + length * 2.5 + 1.2);
  goalPos.y = ctx.origin.y + 0.1;
  const goal = ctx.kit.makePad(goalPos, '★', '#E8C878');
  let reachedRow = -1;
  let done = false;

  return {
    update: () => {
      if (done) return;
      const p = ctx.player.pos;
      for (const t of tiles) {
        if (t.state !== 'idle') continue;
        const dx = p.x - t.pos.x, dz = p.z - t.pos.z;
        if (dx * dx + dz * dz < 0.95 && Math.abs(p.y - (t.pos.y + 0.18)) < 0.5 && ctx.player.grounded) {
          if (t.correct) {
            t.state = 'good';
            t.mesh.material = toonMat('#6BCB77', { emissive: '#3E8B47' });
            ctx.kit.audio.sfx('correct');
            ctx.kit.particles.sparkle(t.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), '#9FE8A8', 4);
            if (t.row > reachedRow) {
              reachedRow = t.row;
              if (reachedRow % 2 === 1) ctx.player.addBrain(1);
              ctx.education.recordAnswer(def.topicId ?? 'place-value', true, tier, true);
            }
          } else {
            t.state = 'naughty';
            t.mesh.material = toonMat('#D88A7A');
            ctx.kit.audio.sfx('boing');
            ctx.education.recordAnswer(def.topicId ?? 'place-value', false, tier, false);
            // harmless boing back toward the start
            ctx.player.launch(8);
            const back = fwd.clone().multiplyScalar(-6);
            ctx.player.vel.x = back.x; ctx.player.vel.z = back.z;
            ctx.dialogue.bark(ctx.speaker, 'hint_numberpath', { vars: { hint: ruleText(rule) }, priority: 2 });
            setTimeout(() => {
              t.state = 'idle';
              t.mesh.material = toonMat('#B8A888');
            }, 2600);
          }
          break;
        }
      }
      if (ctx.kit.padTriggered(goal) && reachedRow >= 0) {
        done = true;
        ctx.panel.hide();
        ctx.complete();
      }
    },
    dispose: () => ctx.panel.hide(),
  };
}

interface Rule { kind: string; of?: number; step?: number; from?: number; digit?: number; place?: string }

function ruleText(rule: Rule): string {
  switch (rule.kind) {
    case 'multiples': return `Step only on multiples of ${rule.of}!`;
    case 'count-by': return `Count up in ${rule.step}s from ${rule.from}!`;
    case 'digit-in-place': return `Step only on numbers with ${rule.digit} in the ${rule.place} place!`;
    default: return 'Follow the number path!';
  }
}

function correctValueFor(rule: Rule, row: number, used: Set<number>): number {
  let v: number;
  switch (rule.kind) {
    case 'multiples': v = (rule.of ?? 2) * (row + 1 + Math.floor(Math.random() * 3)); break;
    case 'count-by': v = (rule.from ?? 0) + (rule.step ?? 10) * (row + 1); break;
    case 'digit-in-place': {
      const placeVal = rule.place === 'hundreds' ? 100 : rule.place === 'tens' ? 10 : 1;
      const others = Math.floor(Math.random() * 9) + 1;
      const rest = Math.floor(Math.random() * placeVal);
      v = others * placeVal * 10 + (rule.digit ?? 5) * placeVal + rest;
      if (placeVal === 100) v = (rule.digit ?? 5) * 100 + Math.floor(Math.random() * 100);
      break;
    }
    default: v = row + 1;
  }
  while (used.has(v)) v += rule.kind === 'multiples' ? (rule.of ?? 2) : 1;
  used.add(v);
  return v;
}

function distractorFor(rule: Rule, correct: number, used: Set<number>): number {
  for (let attempt = 0; attempt < 24; attempt++) {
    let d: number;
    switch (rule.kind) {
      case 'multiples': {
        const off = 1 + Math.floor(Math.random() * ((rule.of ?? 2) - 1));
        d = correct + (Math.random() < 0.5 ? off : -off);
        break;
      }
      case 'count-by': d = correct + (Math.random() < 0.5 ? (rule.step ?? 10) / 2 : (Math.random() < 0.5 ? 1 : -1) * (1 + Math.floor(Math.random() * 4))); break;
      case 'digit-in-place': {
        const placeVal = rule.place === 'hundreds' ? 100 : rule.place === 'tens' ? 10 : 1;
        const wrongDigit = ((rule.digit ?? 5) + 1 + Math.floor(Math.random() * 8)) % 10;
        d = Math.floor(correct / (placeVal * 10)) * placeVal * 10 + wrongDigit * placeVal + correct % placeVal;
        break;
      }
      default: d = correct + 1;
    }
    d = Math.round(d);
    if (d !== correct && d > 0 && !used.has(d) && !isCorrectValue(rule, d)) { used.add(d); return d; }
  }
  used.add(correct + 1);
  return correct + 1;
}

function isCorrectValue(rule: Rule, v: number): boolean {
  switch (rule.kind) {
    case 'multiples': return v % (rule.of ?? 2) === 0;
    case 'count-by': return (v - (rule.from ?? 0)) % (rule.step ?? 10) === 0 && v > (rule.from ?? 0);
    case 'digit-in-place': {
      const placeVal = rule.place === 'hundreds' ? 100 : rule.place === 'tens' ? 10 : 1;
      return Math.floor(v / placeVal) % 10 === (rule.digit ?? 5);
    }
    default: return false;
  }
}

function fmt(n: number): string { return n.toLocaleString('en-GB'); }
