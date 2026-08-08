import * as THREE from 'three';

/** Pooled GPU point particles: dust, sparks, sparkles, steam, confetti (§2.4). */

const MAX_PARTICLES = 1400;

interface Particle {
  life: number; maxLife: number;
  vx: number; vy: number; vz: number;
  gravity: number; size: number; drag: number;
}

export class ParticleSystem {
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private parts: Particle[] = [];
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.parts.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, gravity: 0, size: 1, drag: 0 });
      this.positions[i * 3 + 1] = -1000;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.sizes, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true,
      uniforms: {},
      vertexShader: `
        attribute float psize; varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (180.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          if (dot(c, c) > 0.25) discard;
          gl_FragColor = vec4(vColor, 1.0);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private spawn(x: number, y: number, z: number, opts: {
    color: THREE.Color; life: number; vel: [number, number, number];
    gravity?: number; size?: number; drag?: number;
  }): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    const p = this.parts[i];
    p.life = opts.life; p.maxLife = opts.life;
    p.vx = opts.vel[0]; p.vy = opts.vel[1]; p.vz = opts.vel[2];
    p.gravity = opts.gravity ?? 0; p.size = opts.size ?? 1; p.drag = opts.drag ?? 0;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.colors[i * 3] = opts.color.r; this.colors[i * 3 + 1] = opts.color.g; this.colors[i * 3 + 2] = opts.color.b;
    this.sizes[i] = p.size;
  }

  private static tmpColor = new THREE.Color();

  dust(pos: THREE.Vector3, n = 3): void {
    const c = ParticleSystem.tmpColor.set('#D8C0A0');
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(pos.x + Math.cos(a) * 0.2, pos.y + 0.06, pos.z + Math.sin(a) * 0.2, {
        color: c, life: 0.35 + Math.random() * 0.25,
        vel: [Math.cos(a) * 0.8, 0.6 + Math.random(), Math.sin(a) * 0.8],
        gravity: 1.2, size: 0.5 + Math.random() * 0.4, drag: 2,
      });
    }
  }

  burst(pos: THREE.Vector3, colorHex: string, n = 12, speed = 4): void {
    const c = ParticleSystem.tmpColor.set(colorHex);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      this.spawn(pos.x, pos.y, pos.z, {
        color: c, life: 0.4 + Math.random() * 0.4,
        vel: [Math.cos(a) * Math.cos(b) * speed, Math.sin(b) * speed + 2, Math.sin(a) * Math.cos(b) * speed],
        gravity: 8, size: 0.5 + Math.random() * 0.5, drag: 1,
      });
    }
  }

  sparkle(pos: THREE.Vector3, colorHex = '#FFE87F', n = 2): void {
    const c = ParticleSystem.tmpColor.set(colorHex);
    for (let i = 0; i < n; i++) {
      this.spawn(pos.x + (Math.random() - 0.5) * 0.6, pos.y + Math.random() * 0.8, pos.z + (Math.random() - 0.5) * 0.6, {
        color: c, life: 0.5 + Math.random() * 0.5,
        vel: [0, 0.5 + Math.random() * 0.6, 0],
        size: 0.35 + Math.random() * 0.3,
      });
    }
  }

  steam(pos: THREE.Vector3, n = 2): void {
    const c = ParticleSystem.tmpColor.set('#E8E8F0');
    for (let i = 0; i < n; i++) {
      this.spawn(pos.x + (Math.random() - 0.5) * 0.5, pos.y, pos.z + (Math.random() - 0.5) * 0.5, {
        color: c, life: 0.7 + Math.random() * 0.5,
        vel: [(Math.random() - 0.5) * 0.6, 3 + Math.random() * 2, (Math.random() - 0.5) * 0.6],
        size: 0.9 + Math.random() * 0.7, drag: 0.6,
      });
    }
  }

  confetti(pos: THREE.Vector3, n = 40): void {
    const palette = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#C780FA'];
    for (let i = 0; i < n; i++) {
      const c = ParticleSystem.tmpColor.set(palette[i % palette.length]);
      const a = Math.random() * Math.PI * 2;
      this.spawn(pos.x, pos.y, pos.z, {
        color: c, life: 0.9 + Math.random() * 0.8,
        vel: [Math.cos(a) * (2 + Math.random() * 3), 5 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 3)],
        gravity: 9, size: 0.5 + Math.random() * 0.4, drag: 0.8,
      });
    }
  }

  ring(pos: THREE.Vector3, colorHex: string, radius: number, n = 24): void {
    const c = ParticleSystem.tmpColor.set(colorHex);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(pos.x + Math.cos(a) * radius * 0.3, pos.y + 0.1, pos.z + Math.sin(a) * radius * 0.3, {
        color: c, life: 0.45,
        vel: [Math.cos(a) * radius * 2.2, 0.6, Math.sin(a) * radius * 2.2],
        drag: 1.5, size: 0.6,
      });
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { this.positions[i * 3 + 1] = -1000; this.sizes[i] = 0; continue; }
      p.vy -= p.gravity * dt;
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag; p.vz *= drag;
      this.positions[i * 3] += p.vx * dt;
      this.positions[i * 3 + 1] += p.vy * dt;
      this.positions[i * 3 + 2] += p.vz * dt;
      this.sizes[i] = p.size * Math.min(1, p.life / (p.maxLife * 0.4));
    }
    const geo = this.points.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
  }
}
