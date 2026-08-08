import * as THREE from 'three';
import { toonMat } from '../../engine/renderer';
import type { CharacterDef } from '../../engine/types';

/**
 * Primitive-built character rigs (§2.4): hierarchies of Object3D "bones" with
 * code-driven animation. No external art. Every character gets eye expressions,
 * squash-and-stretch, and a talk gesture. Rig root sits at the feet.
 */

export type Expression = 'neutral' | 'happy' | 'surprised' | 'angry';
export type AnimMode = 'idle' | 'run' | 'air' | 'spin' | 'stomp' | 'talk' | 'attack' | 'block' | 'dizzy' | 'carry' | 'hang' | 'flee';

export interface AnimState {
  mode: AnimMode;
  speed01: number;
  attackT?: number;     // 0..1 through an attack (0..teleFrac = windup)
  teleFrac?: number;
}

export interface Rig {
  root: THREE.Group;
  visual: THREE.Group;   // squash-and-stretch target
  parts: Record<string, THREE.Object3D>;
  height: number;
  setExpression(e: Expression): void;
  update(state: AnimState, t: number, dt: number): void;
  setProp(hand: 'L' | 'R', prop: PropKind): void;
}

export type PropKind = 'none' | 'sword' | 'shield' | 'spanner' | 'dagger' | 'hammer' | 'sceptre';

function box(w: number, h: number, d: number, color: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(color));
  m.castShadow = true;
  return m;
}
function sphere(r: number, color: string, wSeg = 12, hSeg = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), toonMat(color));
  m.castShadow = true;
  return m;
}
function cyl(rt: number, rb: number, h: number, color: string, seg = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), toonMat(color));
  m.castShadow = true;
  return m;
}

interface Eyes { group: THREE.Group; lidL: THREE.Mesh; lidR: THREE.Mesh; pupilL: THREE.Mesh; pupilR: THREE.Mesh; blink: number }

function makeEyes(spacing: number, r: number, eyeColor: string, skinColor: string): Eyes {
  const group = new THREE.Group();
  const mk = (side: number) => {
    const white = sphere(r, '#FFFFFF', 10, 8);
    white.position.x = side * spacing;
    const pupil = sphere(r * 0.45, eyeColor, 8, 6);
    pupil.position.set(side * spacing, 0.02, r * 0.72);
    const lid = box(r * 2.3, r * 1.1, r * 1.6, skinColor);
    lid.position.set(side * spacing, r * 0.95, 0);
    group.add(white, pupil, lid);
    return { pupil, lid };
  };
  const L = mk(-1), R = mk(1);
  return { group, lidL: L.lid, lidR: R.lid, pupilL: L.pupil, pupilR: R.pupil, blink: 0 };
}

function applyExpression(eyes: Eyes, e: Expression): void {
  const set = (lidY: number, rotZ: number, pupilScale: number) => {
    eyes.lidL.position.y = lidY; eyes.lidR.position.y = lidY;
    eyes.lidL.rotation.z = rotZ; eyes.lidR.rotation.z = -rotZ;
    eyes.pupilL.scale.setScalar(pupilScale); eyes.pupilR.scale.setScalar(pupilScale);
  };
  const r = 0.06;
  switch (e) {
    case 'neutral': set(r * 0.95 / 0.06 * 0.06, 0, 1); break;
    case 'happy': set(r * 0.75, 0.25, 1); break;
    case 'surprised': set(r * 1.3, 0, 1.4); break;
    case 'angry': set(r * 0.62, -0.4, 0.85); break;
  }
}

function makeProp(kind: PropKind, accent: string): THREE.Object3D | null {
  switch (kind) {
    case 'sword': {
      const g = new THREE.Group();
      const blade = box(0.07, 0.75, 0.14, '#C8CDD8'); blade.position.y = 0.45;
      const guard = box(0.24, 0.05, 0.16, accent); guard.position.y = 0.08;
      const grip = box(0.06, 0.16, 0.08, '#5A4632');
      g.add(blade, guard, grip);
      return g;
    }
    case 'shield': {
      const g = new THREE.Group();
      const body = cyl(0.34, 0.34, 0.07, accent, 14); body.rotation.x = Math.PI / 2;
      const boss = sphere(0.09, '#C8CDD8'); boss.position.z = 0.06;
      g.add(body, boss);
      return g;
    }
    case 'spanner': {
      const g = new THREE.Group();
      const shaft = box(0.07, 0.85, 0.07, '#B8B8C8'); shaft.position.y = 0.42;
      const head = box(0.24, 0.16, 0.1, '#B8B8C8'); head.position.y = 0.9;
      g.add(shaft, head);
      return g;
    }
    case 'dagger': {
      const g = new THREE.Group();
      const blade = box(0.05, 0.4, 0.1, '#D8D8E8'); blade.position.y = 0.26;
      const grip = box(0.05, 0.12, 0.06, '#302848');
      g.add(blade, grip);
      return g;
    }
    case 'hammer': {
      const g = new THREE.Group();
      const shaft = cyl(0.05, 0.05, 0.8, '#7A6248'); shaft.position.y = 0.4;
      const head = box(0.34, 0.2, 0.2, '#8A8A96'); head.position.y = 0.78;
      g.add(shaft, head);
      return g;
    }
    case 'sceptre': {
      const g = new THREE.Group();
      const shaft = cyl(0.04, 0.04, 0.9, accent); shaft.position.y = 0.45;
      const orb = sphere(0.12, '#FFE28C'); orb.position.y = 0.95;
      g.add(shaft, orb);
      return g;
    }
    default: return null;
  }
}

/** Build a rig from a character definition (rig kind + colours + scale). */
export function buildRig(def: CharacterDef): Rig {
  switch (def.rig) {
    case 'trex': return trexRig(def);
    case 'dog': return dogRig(def);
    case 'cogling': return coglingRig(def);
    case 'drone': return droneRig(def);
    default: return humanRig(def);
  }
}

// ---------------------------------------------------------------- T-REX (Max)
function trexRig(def: CharacterDef): Rig {
  const c = def.colors;
  const scale = def.scale ?? 1;
  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);

  const hip = new THREE.Group(); hip.position.y = 0.62; visual.add(hip);
  const torso = box(0.62, 0.62, 0.5, c.body); torso.position.y = 0.28; hip.add(torso);
  const belly = box(0.44, 0.44, 0.18, c.belly); belly.position.set(0, 0.24, 0.21); hip.add(belly);

  const head = new THREE.Group(); head.position.set(0, 0.72, 0.08); hip.add(head);
  const skull = box(0.56, 0.44, 0.56, c.body); skull.position.set(0, 0.16, 0.1); head.add(skull);
  const jaw = box(0.5, 0.16, 0.5, c.body); jaw.position.set(0, -0.08, 0.16); head.add(jaw);
  const teeth = box(0.44, 0.05, 0.44, '#FFFFFF'); teeth.position.set(0, 0.015, 0.16); jaw.add(teeth);
  const eyes = makeEyes(0.17, 0.085, c.eye ?? '#1B1B2F', c.body);
  eyes.group.position.set(0, 0.24, 0.36); head.add(eyes.group);
  const nostrils = box(0.2, 0.06, 0.06, c.belly); nostrils.position.set(0, 0.1, 0.4); head.add(nostrils);

  const armL = new THREE.Group(); armL.position.set(-0.32, 0.32, 0.18); hip.add(armL);
  const armLa = box(0.1, 0.2, 0.1, c.body); armLa.position.y = -0.08; armL.add(armLa);
  const clawL = box(0.08, 0.1, 0.08, c.accent); clawL.position.set(0, -0.2, 0.02); armL.add(clawL);
  const armR = armL.clone(); armR.position.x = 0.32; hip.add(armR);

  const legL = new THREE.Group(); legL.position.set(-0.2, 0.05, 0); hip.add(legL);
  const thighL = box(0.2, 0.34, 0.28, c.body); thighL.position.y = -0.16; legL.add(thighL);
  const shinL = box(0.14, 0.3, 0.16, c.body); shinL.position.y = -0.44; legL.add(shinL);
  const footL = box(0.18, 0.1, 0.3, c.accent); footL.position.set(0, -0.6, 0.06); legL.add(footL);
  const legR = legL.clone(); legR.position.x = 0.2; hip.add(legR);

  const tail = new THREE.Group(); tail.position.set(0, 0.18, -0.26); hip.add(tail);
  const t1 = box(0.3, 0.26, 0.4, c.body); t1.position.z = -0.16; tail.add(t1);
  const t2g = new THREE.Group(); t2g.position.z = -0.38; tail.add(t2g);
  const t2 = box(0.22, 0.2, 0.36, c.body); t2.position.z = -0.12; t2g.add(t2);
  const t3g = new THREE.Group(); t3g.position.z = -0.3; t2g.add(t3g);
  const t3 = box(0.14, 0.14, 0.32, c.body); t3.position.z = -0.12; t3g.add(t3);

  visual.scale.setScalar(scale);
  root.traverse((o) => { o.castShadow = true; });

  const parts = { hip, head, jaw, armL, armR, legL, legR, tail, t2g, t3g };
  const rig: Rig = {
    root, visual, parts, height: 1.5 * scale,
    setExpression: (e) => applyExpression(eyes, e),
    setProp: () => { /* Max fights with tail and heart */ },
    update: (s, t, dt) => {
      const run = s.speed01;
      // blink
      eyes.blink -= dt;
      if (eyes.blink < 0) eyes.blink = 2.4 + Math.random() * 3;
      const blinkNow = eyes.blink < 0.1;
      eyes.lidL.scale.y = blinkNow ? 3 : 1; eyes.lidR.scale.y = blinkNow ? 3 : 1;

      switch (s.mode) {
        case 'run': {
          const f = t * 11;
          legL.rotation.x = Math.sin(f) * 0.9 * run;
          legR.rotation.x = Math.sin(f + Math.PI) * 0.9 * run;
          armL.rotation.x = Math.sin(f + Math.PI) * 0.5 * run - 0.2;
          armR.rotation.x = Math.sin(f) * 0.5 * run - 0.2;
          hip.position.y = 0.62 + Math.abs(Math.sin(f)) * 0.06 * run;
          hip.rotation.x = 0.12 * run;
          head.rotation.x = -0.08 * run;
          tail.rotation.y = Math.sin(f * 0.5) * 0.2;
          break;
        }
        case 'air':
          legL.rotation.x = 0.5; legR.rotation.x = -0.3;
          armL.rotation.x = -0.9; armR.rotation.x = -0.9;
          hip.rotation.x = -0.1;
          break;
        case 'spin':
          armL.rotation.x = -1.2; armR.rotation.x = -1.2;
          tail.rotation.y = 0;
          break;
        case 'stomp':
          legL.rotation.x = 0.9; legR.rotation.x = 0.9;
          armL.rotation.x = -1.4; armR.rotation.x = -1.4;
          break;
        case 'talk': {
          jaw.rotation.x = Math.max(0, Math.sin(t * 16)) * 0.35;
          armL.rotation.x = Math.sin(t * 5) * 0.3 - 0.3;
          armR.rotation.x = Math.cos(t * 4.4) * 0.3 - 0.3;
          idlePose(t);
          break;
        }
        case 'carry':
          armL.rotation.x = -2.4; armR.rotation.x = -2.4;
          idlePose(t);
          break;
        case 'dizzy':
          head.rotation.z = Math.sin(t * 7) * 0.3;
          hip.rotation.z = Math.sin(t * 5) * 0.12;
          break;
        default: idlePose(t); break;
      }
      // tail follow-through lag always
      t2g.rotation.y = Math.sin(t * 2.2) * 0.14;
      t3g.rotation.y = Math.sin(t * 2.2 - 0.7) * 0.2;
      if (s.mode !== 'talk') jaw.rotation.x = THREE.MathUtils.lerp(jaw.rotation.x, 0, dt * 8);
      if (s.mode !== 'dizzy') { head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, 0, dt * 6); hip.rotation.z = 0; }
      if (s.mode !== 'run') hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, 0, dt * 6);

      function idlePose(tt: number): void {
        const b = Math.sin(tt * 2.2) * 0.02;
        hip.position.y = 0.62 + b;
        legL.rotation.x = THREE.MathUtils.lerp(legL.rotation.x, 0, dt * 8);
        legR.rotation.x = THREE.MathUtils.lerp(legR.rotation.x, 0, dt * 8);
        if (s.mode === 'idle') {
          armL.rotation.x = Math.sin(tt * 2.2) * 0.08 - 0.15;
          armR.rotation.x = Math.sin(tt * 2.2 + 0.4) * 0.08 - 0.15;
          head.rotation.y = Math.sin(tt * 0.7) * 0.12;
        }
        tail.rotation.y = Math.sin(tt * 1.4) * 0.18;
      }
    },
  };
  rig.setExpression('neutral');
  return rig;
}

// ---------------------------------------------------------------- HUMAN
function humanRig(def: CharacterDef): Rig {
  const c = def.colors;
  const scale = def.scale ?? 1;
  const skin = c.skin ?? '#E8B98A';
  const root = new THREE.Group();
  const visual = new THREE.Group(); root.add(visual);

  const hip = new THREE.Group(); hip.position.y = 0.78; visual.add(hip);
  const torso = box(0.5, 0.56, 0.32, c.body); torso.position.y = 0.3; hip.add(torso);
  const chest = box(0.52, 0.2, 0.34, c.belly); chest.position.y = 0.46; hip.add(chest);
  const belt = box(0.52, 0.08, 0.34, c.accent); belt.position.y = 0.06; hip.add(belt);

  const head = new THREE.Group(); head.position.y = 0.72; hip.add(head);
  const skull = box(0.36, 0.38, 0.36, skin); skull.position.y = 0.18; head.add(skull);
  const hair = box(0.4, 0.14, 0.4, c.hair ?? '#333333'); hair.position.y = 0.38; head.add(hair);
  const eyes = makeEyes(0.09, 0.05, c.eye ?? '#22221E', skin);
  eyes.group.position.set(0, 0.2, 0.16); head.add(eyes.group);

  const mkArm = (side: number) => {
    const g = new THREE.Group(); g.position.set(side * 0.32, 0.5, 0); hip.add(g);
    const upper = box(0.12, 0.3, 0.12, c.body); upper.position.y = -0.14; g.add(upper);
    const fore = new THREE.Group(); fore.position.y = -0.3; g.add(fore);
    const lower = box(0.1, 0.28, 0.1, skin); lower.position.y = -0.12; fore.add(lower);
    const hand = new THREE.Group(); hand.position.y = -0.3; fore.add(hand);
    return { g, fore, hand };
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const mkLeg = (side: number) => {
    const g = new THREE.Group(); g.position.set(side * 0.14, 0.05, 0); hip.add(g);
    const thigh = box(0.16, 0.36, 0.18, c.body); thigh.position.y = -0.18; g.add(thigh);
    const shin = box(0.13, 0.34, 0.15, c.accent); shin.position.y = -0.52; g.add(shin);
    const foot = box(0.15, 0.09, 0.26, c.hair ?? '#333333'); foot.position.set(0, -0.72, 0.05); g.add(foot);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  visual.scale.setScalar(scale);
  root.traverse((o) => { o.castShadow = true; });

  let propL: THREE.Object3D | null = null;
  let propR: THREE.Object3D | null = null;

  const parts = { hip, head, armL: armL.g, armR: armR.g, foreL: armL.fore, foreR: armR.fore, handL: armL.hand, handR: armR.hand, legL, legR };
  const rig: Rig = {
    root, visual, parts, height: 1.85 * scale,
    setExpression: (e) => applyExpression(eyes, e),
    setProp: (hand, prop) => {
      const target = hand === 'L' ? armL.hand : armR.hand;
      const old = hand === 'L' ? propL : propR;
      if (old) target.remove(old);
      const mesh = makeProp(prop, c.accent);
      if (mesh) target.add(mesh);
      if (hand === 'L') propL = mesh; else propR = mesh;
    },
    update: (s, t, dt) => {
      eyes.blink -= dt;
      if (eyes.blink < 0) eyes.blink = 2.2 + Math.random() * 3.4;
      const blinkNow = eyes.blink < 0.1;
      eyes.lidL.scale.y = blinkNow ? 3.4 : 1; eyes.lidR.scale.y = blinkNow ? 3.4 : 1;
      const run = s.speed01;
      switch (s.mode) {
        case 'run': {
          const f = t * 10;
          legL.rotation.x = Math.sin(f) * 0.85 * run;
          legR.rotation.x = Math.sin(f + Math.PI) * 0.85 * run;
          armL.g.rotation.x = Math.sin(f + Math.PI) * 0.7 * run;
          armR.g.rotation.x = Math.sin(f) * 0.7 * run;
          hip.position.y = 0.78 + Math.abs(Math.sin(f)) * 0.05 * run;
          hip.rotation.x = 0.1 * run;
          break;
        }
        case 'talk': {
          armR.g.rotation.x = Math.sin(t * 4.5) * 0.45 - 0.5;
          armR.fore.rotation.x = Math.sin(t * 6) * 0.3 - 0.4;
          armL.g.rotation.x = Math.cos(t * 3.8) * 0.25 - 0.2;
          head.rotation.y = Math.sin(t * 1.8) * 0.1;
          settleLegs();
          break;
        }
        case 'attack': {
          const a = s.attackT ?? 0;
          const tele = s.teleFrac ?? 0.4;
          if (a < tele) { // windup
            const w = a / tele;
            armR.g.rotation.x = -2.2 * w;
            armR.g.rotation.z = -0.4 * w;
            hip.rotation.y = -0.4 * w;
          } else { // swing
            const w = (a - tele) / Math.max(0.001, 1 - tele);
            armR.g.rotation.x = -2.2 + 3.1 * Math.min(1, w * 1.6);
            hip.rotation.y = -0.4 + 0.9 * Math.min(1, w * 1.4);
          }
          settleLegs();
          break;
        }
        case 'block':
          armL.g.rotation.x = -1.5; armL.fore.rotation.x = -0.5;
          armR.g.rotation.x = -0.3;
          hip.rotation.y = 0.3;
          settleLegs();
          break;
        case 'dizzy':
          head.rotation.z = Math.sin(t * 7) * 0.35;
          hip.rotation.z = Math.sin(t * 5) * 0.1;
          settleLegs();
          break;
        case 'flee': {
          const f = t * 13;
          legL.rotation.x = Math.sin(f) * 1; legR.rotation.x = Math.sin(f + Math.PI) * 1;
          armL.g.rotation.x = -2.6; armR.g.rotation.x = -2.6; // arms up, panicking
          break;
        }
        default: {
          hip.position.y = 0.78 + Math.sin(t * 2) * 0.015;
          armL.g.rotation.x = THREE.MathUtils.lerp(armL.g.rotation.x, Math.sin(t * 2) * 0.06, dt * 6);
          armR.g.rotation.x = THREE.MathUtils.lerp(armR.g.rotation.x, Math.sin(t * 2 + 0.5) * 0.06, dt * 6);
          armR.fore.rotation.x = THREE.MathUtils.lerp(armR.fore.rotation.x, 0, dt * 6);
          head.rotation.y = Math.sin(t * 0.6) * 0.08;
          settleLegs();
          break;
        }
      }
      if (s.mode !== 'attack' && s.mode !== 'block') {
        hip.rotation.y = THREE.MathUtils.lerp(hip.rotation.y, 0, dt * 7);
      }
      if (s.mode !== 'dizzy') { head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, 0, dt * 6); hip.rotation.z = 0; }
      function settleLegs(): void {
        legL.rotation.x = THREE.MathUtils.lerp(legL.rotation.x, 0, dt * 8);
        legR.rotation.x = THREE.MathUtils.lerp(legR.rotation.x, 0, dt * 8);
        if (s.mode !== 'run') hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, 0, dt * 6);
      }
    },
  };
  rig.setExpression('neutral');
  return rig;
}

// ---------------------------------------------------------------- DOG (Digger)
function dogRig(def: CharacterDef): Rig {
  const c = def.colors;
  const scale = def.scale ?? 1;
  const root = new THREE.Group();
  const visual = new THREE.Group(); root.add(visual);

  const body = new THREE.Group(); body.position.y = 0.42; visual.add(body);
  const torso = box(0.34, 0.32, 0.68, c.body); body.add(torso);
  const chest = box(0.3, 0.2, 0.24, c.belly); chest.position.set(0, -0.08, 0.26); body.add(chest);

  const head = new THREE.Group(); head.position.set(0, 0.22, 0.4); body.add(head);
  const skull = box(0.3, 0.26, 0.3, c.body); head.add(skull);
  const snout = box(0.16, 0.14, 0.2, c.belly); snout.position.set(0, -0.05, 0.22); head.add(snout);
  const nose = box(0.08, 0.07, 0.06, '#1B1B2F'); nose.position.set(0, 0.02, 0.32); head.add(nose);
  const earL = box(0.1, 0.18, 0.06, c.accent); earL.position.set(-0.11, 0.2, -0.02); earL.rotation.z = 0.2; head.add(earL);
  const earR = earL.clone(); earR.position.x = 0.11; earR.rotation.z = -0.2; head.add(earR);
  const eyes = makeEyes(0.08, 0.05, c.eye ?? '#1B1B2F', c.body);
  eyes.group.position.set(0, 0.06, 0.14); head.add(eyes.group);

  const mkLeg = (x: number, z: number) => {
    const g = new THREE.Group(); g.position.set(x, -0.14, z); body.add(g);
    const leg = box(0.1, 0.3, 0.1, c.body); leg.position.y = -0.12; g.add(leg);
    const paw = box(0.11, 0.08, 0.14, c.belly); paw.position.set(0, -0.26, 0.02); g.add(paw);
    return g;
  };
  const legFL = mkLeg(-0.12, 0.24), legFR = mkLeg(0.12, 0.24), legBL = mkLeg(-0.12, -0.24), legBR = mkLeg(0.12, -0.24);
  const tail = box(0.08, 0.08, 0.3, c.accent); tail.position.set(0, 0.12, -0.42); body.add(tail);

  visual.scale.setScalar(scale);
  root.traverse((o) => { o.castShadow = true; });

  const rig: Rig = {
    root, visual, parts: { body, head, tail }, height: 0.9 * scale,
    setExpression: (e) => applyExpression(eyes, e),
    setProp: () => { /* dogs hold things in their hearts */ },
    update: (s, t, dt) => {
      eyes.blink -= dt;
      if (eyes.blink < 0) eyes.blink = 2 + Math.random() * 3;
      const blinkNow = eyes.blink < 0.1;
      eyes.lidL.scale.y = blinkNow ? 3 : 1; eyes.lidR.scale.y = blinkNow ? 3 : 1;
      tail.rotation.y = Math.sin(t * (s.mode === 'idle' ? 6 : 10)) * 0.5;
      switch (s.mode) {
        case 'run': {
          const f = t * 13;
          legFL.rotation.x = Math.sin(f) * 0.9; legBR.rotation.x = Math.sin(f) * 0.9;
          legFR.rotation.x = Math.sin(f + Math.PI) * 0.9; legBL.rotation.x = Math.sin(f + Math.PI) * 0.9;
          body.position.y = 0.42 + Math.abs(Math.sin(f)) * 0.05;
          break;
        }
        case 'talk':
          head.rotation.z = Math.sin(t * 3) * 0.12;
          head.rotation.x = Math.max(0, Math.sin(t * 14)) * 0.12;
          break;
        case 'dizzy':
          head.rotation.z = Math.sin(t * 7) * 0.4;
          break;
        default: {
          body.position.y = 0.42 + Math.sin(t * 2.4) * 0.015;
          [legFL, legFR, legBL, legBR].forEach((l) => { l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, 0, dt * 8); });
          head.rotation.y = Math.sin(t * 0.9) * 0.15;
          if (s.mode === 'idle' && Math.sin(t * 0.5) > 0.85) head.rotation.x = -0.3; // sniffing the air
          else head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, 0, dt * 5);
          break;
        }
      }
    },
  };
  rig.setExpression('happy');
  return rig;
}

// ---------------------------------------------------------------- COGLING
function coglingRig(def: CharacterDef): Rig {
  const c = def.colors;
  const scale = def.scale ?? 1;
  const root = new THREE.Group();
  const visual = new THREE.Group(); root.add(visual);
  const body = new THREE.Group(); body.position.y = 0.45; visual.add(body);
  const shell = sphere(0.34, c.body, 12, 10); body.add(shell);
  const plate = box(0.3, 0.22, 0.1, c.belly); plate.position.set(0, 0, 0.3); body.add(plate);
  const eye = sphere(0.12, '#FFFFFF', 10, 8); eye.position.set(0, 0.12, 0.28); body.add(eye);
  const pupil = sphere(0.06, c.eye ?? '#FFD24A', 8, 6); pupil.position.set(0, 0.12, 0.38); body.add(pupil);
  const gear = cyl(0.12, 0.12, 0.06, c.accent, 8); gear.position.y = 0.42; body.add(gear);
  const mkLeg = (side: number) => {
    const g = new THREE.Group(); g.position.set(side * 0.16, -0.28, 0); body.add(g);
    const leg = box(0.1, 0.22, 0.1, c.accent); leg.position.y = -0.08; g.add(leg);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  const armL = new THREE.Group(); armL.position.set(-0.32, 0.05, 0); body.add(armL);
  const armLm = box(0.09, 0.26, 0.09, c.accent); armLm.position.y = -0.1; armL.add(armLm);
  const handL = new THREE.Group(); handL.position.y = -0.26; armL.add(handL);
  const armR = new THREE.Group(); armR.position.set(0.32, 0.05, 0); body.add(armR);
  const armRm = armLm.clone(); armR.add(armRm);
  const handR = new THREE.Group(); handR.position.y = -0.26; armR.add(handR);

  visual.scale.setScalar(scale);
  root.traverse((o) => { o.castShadow = true; });

  let propR: THREE.Object3D | null = null;
  const rig: Rig = {
    root, visual, parts: { body, gear, armL, armR, handL, handR }, height: 0.9 * scale,
    setExpression: () => { /* single-eye bot */ },
    setProp: (hand, prop) => {
      const target = hand === 'L' ? handL : handR;
      if (propR) target.remove(propR);
      const mesh = makeProp(prop, c.accent);
      if (mesh) target.add(mesh);
      propR = mesh;
    },
    update: (s, t, dt) => {
      gear.rotation.y += dt * (s.mode === 'run' || s.mode === 'flee' ? 9 : 2);
      switch (s.mode) {
        case 'run': case 'flee': {
          const f = t * 14;
          legL.rotation.x = Math.sin(f) * 0.9; legR.rotation.x = Math.sin(f + Math.PI) * 0.9;
          body.position.y = 0.45 + Math.abs(Math.sin(f)) * 0.05;
          break;
        }
        case 'attack': {
          const a = s.attackT ?? 0;
          const tele = s.teleFrac ?? 0.5;
          armR.rotation.x = a < tele ? -2 * (a / tele) : -2 + 3 * ((a - tele) / (1 - tele));
          break;
        }
        case 'dizzy':
          body.rotation.z = Math.sin(t * 8) * 0.25;
          break;
        default:
          body.position.y = 0.45 + Math.sin(t * 3) * 0.02;
          body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, 0, dt * 6);
          armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, Math.sin(t * 2.5) * 0.1, dt * 6);
          legL.rotation.x = THREE.MathUtils.lerp(legL.rotation.x, 0, dt * 8);
          legR.rotation.x = THREE.MathUtils.lerp(legR.rotation.x, 0, dt * 8);
          break;
      }
    },
  };
  return rig;
}

// ---------------------------------------------------------------- DRONE (Botto)
function droneRig(def: CharacterDef): Rig {
  const c = def.colors;
  const scale = def.scale ?? 1;
  const root = new THREE.Group();
  const visual = new THREE.Group(); root.add(visual);
  const body = box(0.4, 0.3, 0.4, c.body); body.position.y = 0.5; visual.add(body);
  const face = box(0.26, 0.16, 0.05, c.belly); face.position.set(0, 0.52, 0.21); visual.add(face);
  const rotor = box(0.5, 0.03, 0.08, c.accent); rotor.position.y = 0.72; visual.add(rotor);
  visual.scale.setScalar(scale);
  root.traverse((o) => { o.castShadow = true; });
  return {
    root, visual, parts: { body, rotor }, height: 0.8 * scale,
    setExpression: () => { /* screen face */ },
    setProp: () => { /* no hands */ },
    update: (_s, t, dt) => {
      rotor.rotation.y += dt * 20;
      visual.position.y = Math.sin(t * 3) * 0.08;
    },
  };
}
