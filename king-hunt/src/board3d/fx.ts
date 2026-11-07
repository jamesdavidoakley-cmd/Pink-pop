import * as THREE from 'three';
import type { BoardScene } from './scene';
import { PALETTE } from './palette';

/**
 * Particle and light effects for the cinematic moments: shattering captures,
 * shockwaves, lightning, storm clouds over a king under pressure, ambient
 * dust. Everything is cheap instanced geometry or sprites; nothing is loaded.
 */
interface Shard {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

export class Fx {
  private shards: Shard[] = [];
  private shardGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  private rings: { mesh: THREE.Mesh; t: number }[] = [];
  private bolt: THREE.Line | null = null;
  private boltLife = 0;
  private flashLight: THREE.PointLight;
  private clouds: THREE.Sprite[] = [];
  private cloudTarget = new THREE.Vector3();
  private cloudLevel = 0;
  private cloudGoal = 0;
  private rumbleNext = 0;
  private dust: THREE.Points;
  private puffs: { s: THREE.Sprite; t: number; vx: number; vz: number }[] = [];
  private beams: { m: THREE.Mesh; t: number; life: number }[] = [];
  private torches: { light: THREE.PointLight; flame: THREE.Sprite; seed: number }[] = [];
  private disc: THREE.Texture;
  onLightning: (() => void) | null = null;

  constructor(private scene: BoardScene) {
    this.flashLight = new THREE.PointLight(0xbfe4ff, 0, 18, 1.5);
    this.flashLight.position.set(0, 6, 0);
    scene.scene.add(this.flashLight);
    const tex = Fx.softDisc();
    this.disc = tex;
    // Four torches at the arena corners: a warm flicker against the cold key light.
    let torchIndex = 0;
    for (const [x, z] of [[-5.3, -5.3], [5.3, -5.3], [-5.3, 5.3], [5.3, 5.3]] as const) {
      const light = new THREE.PointLight(0xffa24a, torchIndex++ < scene.quality.torchLights ? 6 : 0, 9, 1.8);
      light.position.set(x, 1.4, z);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb060, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.set(x, 1.45, z);
      flame.scale.set(0.5, 0.8, 1);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.9 }));
      post.position.set(x, 0.35, z);
      light.userData.off = light.intensity === 0;
      scene.scene.add(light, flame, post);
      this.torches.push({ light, flame, seed: Math.random() * 10 });
    }
    for (let i = 0; i < scene.quality.clouds; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0x1a2236, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(1.6 + Math.random() * 1.4);
      s.userData = { seed: Math.random() * 100 };
      scene.fxGroup.add(s);
      this.clouds.push(s);
    }
    this.dust = Fx.makeDust(scene.quality.dust);
    scene.fxGroup.add(this.dust);
    scene.onTick((dt, t) => this.tick(dt, t));
  }

  /** A piece explodes into shards that fly out and fade. */
  shatter(at: THREE.Vector3, color: number, count = 18, push: THREE.Vector3 | null = null) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, transparent: true });
      const m = new THREE.Mesh(this.shardGeo, mat);
      const sc = 0.6 + Math.random() * 1.1;
      m.scale.set(sc, sc * (0.6 + Math.random()), sc);
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3));
      m.castShadow = true;
      this.scene.fxGroup.add(m);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 4);
      if (push) vel.addScaledVector(push, 2.5 + Math.random() * 2); // rubble flies away from the blow
      this.shards.push({
        mesh: m,
        vel,
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        life: 0.9 + Math.random() * 0.5,
      });
    }
  }

  /** A thick glowing beam from one square to another, fading over `life` seconds. */
  beam(from: THREE.Vector3, to: THREE.Vector3, color = 0xff6a1a, life = 1.2) {
    const a = from.clone().setY(0.6);
    const b = to.clone().setY(0.12);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.06, 0.03, len, 8, 1, true);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.scene.fxGroup.add(m);
    this.beams.push({ m, t: 0, life });
  }

  /** A puff of stone dust: sprites that spread and fade. */
  puff(at: THREE.Vector3, count = 6, color = 0xcfc3a8) {
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.disc, color, transparent: true, opacity: 0.55, depthWrite: false }));
      sp.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.15, (Math.random() - 0.5) * 0.3));
      sp.scale.setScalar(0.3 + Math.random() * 0.3);
      this.scene.fxGroup.add(sp);
      this.puffs.push({ s: sp, t: 0, vx: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2 });
    }
  }

  /** Expanding ring on the board surface. */
  shockwave(at: THREE.Vector3, color: number = PALETTE.heatHot as number) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(at).setY(0.03);
    this.scene.fxGroup.add(mesh);
    this.rings.push({ mesh, t: 0 });
  }

  /** A jagged bolt from the sky to `at`, with a light flash. */
  lightning(at: THREE.Vector3) {
    this.clearBolt();
    const pts: THREE.Vector3[] = [];
    const top = at.clone().setY(9).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
    const segs = 9;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const p = top.clone().lerp(at.clone().setY(0.2), k);
      if (i > 0 && i < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7));
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
    this.bolt = new THREE.Line(geo, mat);
    this.scene.fxGroup.add(this.bolt);
    this.boltLife = 0.28;
    this.flashLight.position.copy(at).setY(4);
    this.flashLight.intensity = 60;
    this.onLightning?.();
  }

  /** Storm intensity 0..1 over a square (clouds gather, lightning strikes now and then). */
  storm(level: number, at: THREE.Vector3 | null) {
    this.cloudGoal = Math.max(0, Math.min(1, level));
    if (at) this.cloudTarget.copy(at);
  }

  private clearBolt() {
    if (this.bolt) {
      this.scene.fxGroup.remove(this.bolt);
      this.bolt.geometry.dispose();
      this.bolt = null;
    }
  }

  private tick(dt: number, t: number) {
    // shards
    for (const s of [...this.shards]) {
      s.life -= dt;
      s.vel.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.mesh.position.y < 0.05) {
        s.mesh.position.y = 0.05;
        s.vel.y *= -0.35;
        s.vel.x *= 0.7;
        s.vel.z *= 0.7;
      }
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      (s.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(1, s.life * 2);
      if (s.life <= 0) {
        this.scene.fxGroup.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.shards.splice(this.shards.indexOf(s), 1);
      }
    }
    // rings
    for (const r of [...this.rings]) {
      r.t += dt;
      const k = r.t / 0.6;
      r.mesh.scale.setScalar(1 + k * 6);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) {
        this.scene.fxGroup.remove(r.mesh);
        this.rings.splice(this.rings.indexOf(r), 1);
      }
    }
    // bolt + flash
    if (this.bolt) {
      this.boltLife -= dt;
      (this.bolt.material as THREE.LineBasicMaterial).opacity = Math.max(0, this.boltLife / 0.28) * (0.6 + 0.4 * Math.random());
      if (this.boltLife <= 0) this.clearBolt();
    }
    if (this.flashLight.intensity > 0) this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 160);
    // clouds
    this.cloudLevel += (this.cloudGoal - this.cloudLevel) * Math.min(1, dt * 1.5);
    this.clouds.forEach((c, i) => {
      const seed = c.userData.seed as number;
      const a = seed + t * 0.25;
      const r = 0.6 + (i % 5) * 0.35;
      c.position.set(this.cloudTarget.x + Math.cos(a) * r, 2.4 + Math.sin(t * 0.7 + seed) * 0.15 + (i % 3) * 0.25, this.cloudTarget.z + Math.sin(a * 1.3) * r);
      (c.material as THREE.SpriteMaterial).opacity = this.cloudLevel * 0.75;
    });
    if (this.cloudLevel > 0.55 && t > this.rumbleNext) {
      this.rumbleNext = t + 2.5 + Math.random() * 4;
      if (Math.random() < this.cloudLevel) this.lightning(this.cloudTarget.clone());
    }
    // beams
    for (const b of [...this.beams]) {
      b.t += dt;
      const k = b.t / b.life;
      (b.m.material as THREE.MeshBasicMaterial).opacity = k < 0.7 ? 0.95 : 0.95 * (1 - (k - 0.7) / 0.3);
      if (k >= 1) {
        this.scene.fxGroup.remove(b.m);
        b.m.geometry.dispose();
        this.beams.splice(this.beams.indexOf(b), 1);
      }
    }
    // puffs
    for (const p of [...this.puffs]) {
      p.t += dt;
      const k = p.t / 0.8;
      p.s.position.x += p.vx * dt;
      p.s.position.z += p.vz * dt;
      p.s.position.y += dt * 0.5;
      p.s.scale.addScalar(dt * 1.6);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.55 * (1 - k));
      if (k >= 1) {
        this.scene.fxGroup.remove(p.s);
        (p.s.material as THREE.Material).dispose();
        this.puffs.splice(this.puffs.indexOf(p), 1);
      }
    }
    // torches flicker
    for (const tc of this.torches) {
      const f = 0.75 + 0.25 * Math.sin(t * 11 + tc.seed) * Math.sin(t * 7.3 + tc.seed * 2) + 0.08 * Math.random();
      if (tc.light.userData.off) continue;
      tc.light.intensity = 5 * f;
      tc.flame.scale.set(0.45 + 0.1 * f, 0.7 + 0.25 * f, 1);
      (tc.flame.material as THREE.SpriteMaterial).opacity = 0.6 + 0.35 * f;
    }
    // dust drifts
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * 0.12;
      if (y > 5) y = 0.2;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(t + i) * dt * 0.05);
    }
    pos.needsUpdate = true;
  }

  private static softDisc(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  private static makeDust(n: number): THREE.Points {
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 1] = Math.random() * 5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffe9c9, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true });
    return new THREE.Points(geo, mat);
  }
}
