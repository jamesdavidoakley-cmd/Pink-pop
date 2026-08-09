import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticWorld } from '../../engine/physics';
import { toonMat, vertexToonMat } from '../../engine/renderer';
import type { GeoItem, LevelDef, Vec3 } from '../../engine/types';
import { MoverRuntime } from './movers';

/**
 * Turns a level manifest's geometry recipe into merged toon meshes (one draw
 * call for all static world geometry per §2.5) + a BVH collider, and spawns
 * movers, props, and breakables.
 */

export interface Breakable {
  id: number;
  kind: 'cracked' | 'roarwall';
  mesh: THREE.Mesh;
  half: THREE.Vector3;
  contains?: string;
  broken: boolean;
}

export interface LevelBuild {
  group: THREE.Group;
  staticWorld: StaticWorld;
  movers: MoverRuntime[];
  breakables: Breakable[];
  spawn: THREE.Vector3;
  spawnYaw: number;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

function geoToGeometry(g: GeoItem): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  if (g.type === 'cyl') {
    geo = new THREE.CylinderGeometry(g.r ?? 1, g.r2 ?? g.r ?? 1, g.h ?? 1, g.seg ?? 14);
  } else {
    const size = g.size ?? [1, 1, 1];
    geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  }
  const rot = g.rot ?? [0, 0, 0];
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(...g.pos), _q, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(_m);
  return geo;
}

function paintVertexColors(geo: THREE.BufferGeometry, hex: string): void {
  const color = new THREE.Color(hex);
  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // subtle per-vertex variation gives the flat colours life
    const v = 1 + (Math.sin(i * 12.9898) * 0.5) * 0.06;
    colors[i * 3] = Math.min(1, color.r * v);
    colors[i * 3 + 1] = Math.min(1, color.g * v);
    colors[i * 3 + 2] = Math.min(1, color.b * v);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function buildLevel(def: LevelDef): LevelBuild {
  const group = new THREE.Group();
  const visualGeos: THREE.BufferGeometry[] = [];
  const collisionGeos: THREE.BufferGeometry[] = [];
  const breakables: Breakable[] = [];
  let breakId = 0;

  for (const g of def.geometry) {
    if (g.type === 'ring') {
      // hollow wall ring built from box chords (solid cylinders would put a
      // false ceiling over the whole arena — raycasts and capsules agree here)
      const seg = g.seg ?? 16;
      const r = g.r ?? 10;
      const h = g.h ?? 3;
      const thick = g.thick ?? 1;
      const chord = 2 * r * Math.tan(Math.PI / seg) + 0.35;
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const geo = new THREE.BoxGeometry(chord, h, thick);
        _e.set(0, -a, 0);
        _q.setFromEuler(_e);
        _m.compose(
          new THREE.Vector3(g.pos[0] + Math.sin(a) * r, g.pos[1], g.pos[2] + Math.cos(a) * r),
          _q, new THREE.Vector3(1, 1, 1),
        );
        geo.applyMatrix4(_m);
        paintVertexColors(geo, g.color ?? '#A0A0A0');
        visualGeos.push(geo);
        if (g.collide !== false) collisionGeos.push(geo.clone());
      }
      continue;
    }
    if (g.special) {
      const size = g.size ?? [1, 1, 1];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size[0], size[1], size[2]),
        toonMat(g.color ?? (g.special === 'cracked' ? '#B89A6A' : '#7A4A8A')),
      );
      mesh.position.set(...g.pos);
      if (g.rot) mesh.rotation.set(...g.rot);
      mesh.castShadow = true; mesh.receiveShadow = true;
      // crack lines
      const lines = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 1.01, size[1] * 0.12, size[2] * 1.01), toonMat('#6A5030'));
      if (g.special === 'roarwall') lines.material = toonMat('#B080D0');
      mesh.add(lines);
      group.add(mesh);
      breakables.push({
        id: breakId++, kind: g.special, mesh,
        half: new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2),
        contains: g.contains, broken: false,
      });
      continue;
    }
    const geo = geoToGeometry(g);
    paintVertexColors(geo, g.color ?? '#A0A0A0');
    visualGeos.push(geo);
    if (g.collide !== false) collisionGeos.push(geo.clone());
  }

  // props: decorative prefabs; some contribute simple box colliders
  for (const p of def.props ?? []) {
    if (p.type === 'crate') continue; // crates are live entities, spawned by the scene
    const built = buildProp(p.type, p.color);
    if (!built) continue;
    built.group.position.set(...p.pos);
    built.group.rotation.y = p.rot ?? 0;
    built.group.scale.setScalar(p.scale ?? 1);
    group.add(built.group);
    if (built.colliderSize) {
      const s = p.scale ?? 1;
      const cgeo = new THREE.BoxGeometry(built.colliderSize[0] * s, built.colliderSize[1] * s, built.colliderSize[2] * s);
      cgeo.translate(p.pos[0], p.pos[1] + (built.colliderSize[1] * s) / 2, p.pos[2]);
      collisionGeos.push(cgeo);
    }
  }

  if (visualGeos.length) {
    const merged = mergeGeometries(visualGeos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    const mesh = new THREE.Mesh(merged, vertexToonMat());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // perf-test field (playground): 1000 instanced cubes
  if (def.instancedField) {
    const f = def.instancedField;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), toonMat('#7FB2FF'), f.count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < f.count; i++) {
      m.setPosition(
        f.center[0] + (Math.sin(i * 127.3) * 0.5 + 0.5) * f.spread * 2 - f.spread,
        f.center[1] + (i % 17) * 0.55,
        f.center[2] + (Math.sin(i * 311.7) * 0.5 + 0.5) * f.spread * 2 - f.spread,
      );
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = false;
    group.add(inst);
  }

  const movers = (def.movers ?? []).map((m, i) => new MoverRuntime(i, m));
  for (const m of movers) group.add(m.mesh);

  const staticWorld = new StaticWorld(collisionGeos);

  return {
    group, staticWorld, movers, breakables,
    spawn: new THREE.Vector3(...def.spawn),
    spawnYaw: def.spawnYaw ?? 0,
  };
}

// ---------------------------------------------------------------- prefabs
interface Prop { group: THREE.Group; colliderSize?: Vec3 }

export function buildProp(type: string, colorOverride?: string): Prop | null {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh, x = 0, y = 0, z = 0): THREE.Mesh => {
    m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  const B = (w: number, h: number, d: number, c: string) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c));
  const C = (rt: number, rb: number, h: number, c: string, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), toonMat(c));
  const S = (r: number, c: string) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), toonMat(c));

  switch (type) {
    case 'cactus': {
      const c = colorOverride ?? '#4E9A5E';
      add(C(0.22, 0.28, 1.4, c), 0, 0.7);
      add(C(0.12, 0.12, 0.6, c), -0.35, 1.0).rotation.z = 1.2;
      add(C(0.12, 0.12, 0.5, c), 0.33, 0.8).rotation.z = -1.2;
      return { group: g };
    }
    case 'boneArch': {
      const c = colorOverride ?? '#EDE3CE';
      const l = add(C(0.18, 0.22, 3.2, c), -1.5, 1.6); l.rotation.z = 0.35;
      const r = add(C(0.18, 0.22, 3.2, c), 1.5, 1.6); r.rotation.z = -0.35;
      add(B(2.6, 0.35, 0.4, c), 0, 3.1);
      add(S(0.3, c), -2.05, 0.15); add(S(0.3, c), 2.05, 0.15);
      return { group: g };
    }
    case 'ribcage': {
      const c = colorOverride ?? '#E8DCC0';
      for (let i = 0; i < 4; i++) {
        const rib = add(C(0.09, 0.11, 2.2 - i * 0.3, c), 0, 1, -i * 0.7);
        rib.rotation.x = 0.25;
        rib.rotation.z = i % 2 ? 0.5 : -0.5;
      }
      return { group: g };
    }
    case 'crystal': {
      const c = colorOverride ?? '#9FE8FF';
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.3, 5), toonMat(c, { emissive: c }));
      add(m, 0, 0.65);
      const m2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 5), toonMat(c, { emissive: c }));
      add(m2, 0.35, 0.4, 0.15).rotation.z = -0.4;
      return { group: g };
    }
    case 'gearDeco': {
      const c = colorOverride ?? '#B8863B';
      const disc = add(C(0.9, 0.9, 0.25, c, 12), 0, 0);
      disc.rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(B(0.3, 0.25, 0.32, c), Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0).rotation.y = -a;
      }
      return { group: g };
    }
    case 'pipe': {
      const c = colorOverride ?? '#8A6E4E';
      add(C(0.3, 0.3, 2.4, c), 0, 1.2);
      add(C(0.38, 0.38, 0.25, c), 0, 2.45);
      return { group: g, colliderSize: [0.8, 2.5, 0.8] };
    }
    case 'lamp': {
      add(C(0.08, 0.12, 2.2, '#4A4A58'), 0, 1.1);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), toonMat('#FFE28C', { emissive: '#FFD24A' }));
      add(glow, 0, 2.3);
      return { group: g };
    }
    case 'tree': {
      add(C(0.25, 0.35, 1.6, '#7A5230'), 0, 0.8);
      add(S(1.1, colorOverride ?? '#5EA95E'), 0, 2.2);
      add(S(0.7, colorOverride ?? '#6EBB6E'), 0.7, 1.8, 0.3);
      return { group: g, colliderSize: [0.6, 1.6, 0.6] };
    }
    case 'bush': {
      add(S(0.55, colorOverride ?? '#5EA95E'), 0, 0.4);
      add(S(0.4, colorOverride ?? '#6EBB6E'), 0.45, 0.3, 0.2);
      return { group: g };
    }
    case 'rock': {
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), toonMat(colorOverride ?? '#A08A6A')), 0, 0.35);
      m.scale.y = 0.7;
      return { group: g };
    }
    case 'sign': {
      add(C(0.06, 0.08, 1.1, '#7A5230'), 0, 0.55);
      add(B(0.9, 0.5, 0.08, '#C8A060'), 0, 1.2);
      return { group: g };
    }
    case 'table': {
      add(C(0.7, 0.7, 0.08, '#8A6E4E', 12), 0, 0.72);
      add(C(0.08, 0.1, 0.72, '#6E5236'), 0, 0.36);
      return { group: g, colliderSize: [1.2, 0.8, 1.2] };
    }
    case 'chair': {
      add(C(0.28, 0.28, 0.06, '#A08058', 10), 0, 0.45);
      add(C(0.05, 0.06, 0.45, '#6E5236'), 0, 0.22);
      return { group: g };
    }
    case 'awning': {
      add(B(2.2, 0.08, 1.2, colorOverride ?? '#D86A5A'), 0, 2.1, 0);
      add(C(0.05, 0.05, 2.1, '#5A4632'), -1, 1.05, 0.5);
      add(C(0.05, 0.05, 2.1, '#5A4632'), 1, 1.05, 0.5);
      return { group: g };
    }
    case 'fossilSpiral': {
      const c = colorOverride ?? '#D8C8A8';
      for (let i = 0; i < 10; i++) {
        const a = i * 0.7;
        const r = 0.15 + i * 0.09;
        add(S(0.1 + i * 0.015, c), Math.cos(a) * r, 0.1, Math.sin(a) * r);
      }
      return { group: g };
    }
    case 'vent': {
      add(C(0.5, 0.6, 0.5, colorOverride ?? '#6A6A78', 12), 0, 0.25);
      add(C(0.35, 0.35, 0.15, '#3A3A48', 12), 0, 0.55);
      return { group: g };
    }
    case 'flag': {
      add(C(0.05, 0.07, 2.4, '#5A4632'), 0, 1.2);
      add(B(0.9, 0.5, 0.04, colorOverride ?? '#D8B04A'), 0.5, 2.1);
      return { group: g };
    }
    case 'counter': {
      add(B(2.6, 1.0, 0.9, colorOverride ?? '#9A7048'), 0, 0.5);
      add(B(2.8, 0.12, 1.1, '#C8A060'), 0, 1.05);
      return { group: g, colliderSize: [2.8, 1.1, 1.0] };
    }
    default:
      console.warn(`[level] unknown prop type '${type}'`);
      return null;
  }
}
