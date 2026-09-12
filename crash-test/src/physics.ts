// A small Verlet physics world: point masses, distance links, and circle-vs-segment collisions.
// Units are grid cells. Everything a child builds is nodes + links; loads and blocks are bodies of the same.

export interface Node {
  id: number;
  x: number; y: number;
  px: number; py: number;
  invMass: number;
  r: number;
  fixed: boolean;
  /** Set true during a frame when the node touched something (used to drive wheels). */
  contact: boolean;
  /** Set when the node touched a link (not the ground) this frame. */
  hitLink: boolean;
  /** How much tangential velocity a contact strips (0 = rolls freely, 1 = sticks). */
  friction: number;
  /** Collision group: nodes only collide with links/ground of *other* groups. */
  group: number;
  baseX: number; baseY: number;
  /** Steady push applied every substep (cleared by the caller). */
  forceX: number; forceY: number;
}

export type LinkRole = 'axial' | 'bend' | 'body';

export interface Link {
  id: number;
  a: Node; b: Node;
  /** Bend links pull this middle node toward the midpoint of a and b. */
  m: Node | null;
  rest: number;
  /** XPBD compliance: 0 = rigid, bigger = stretchier. */
  compliance: number;
  lambda: number;
  /** Force carried right now (mass·cells/s²). */
  force: number;
  /** Ropes only resist stretching; they go slack when pushed together. */
  ropeLike: boolean;
  /** Smoothed stress (0..1 = safe, 1 = snap). */
  stress: number;
  /** Force at which it snaps. Infinity = unbreakable. */
  breakForce: number;
  broken: boolean;
  /** Which placed part this link belongs to (null for loads/ground/blocks). */
  partId: number | null;
  role: LinkRole;
  /** Loads roll over this link. */
  collide: boolean;
  group: number;
  /** +1 stretched, -1 squashed, last measured. */
  sign: number;
  thickness: number;
}

export interface Ground { a: Node; b: Node }

export interface BreakEvent { link: Link; time: number }

let nextId = 1;

export const GRAVITY = 24;
export const SUBSTEPS = 6;
export const ITERATIONS = 8;
/** Per-substep velocity keep. Structures settle instead of ringing forever. */
export const DAMPING = 0.992;
/** Per-substep blend toward the current force. Brief impact spikes wash out; a sustained overload snaps in ~0.2 s. */
export const STRESS_SMOOTHING = 0.02;

export class World {
  nodes: Node[] = [];
  links: Link[] = [];
  ground: Ground[] = [];
  time = 0;
  /** Horizontal shake applied to fixed nodes (earthquake). */
  shakeAmp = 0;
  shakeFreq = 3;
  breaks: BreakEvent[] = [];
  onBreak: ((e: BreakEvent) => void) | null = null;
  /** Nodes below this y are lost (fell off the world). */
  floorY = 40;

  addNode(x: number, y: number, mass: number, r = 0.18, fixed = false, group = 0): Node {
    const n: Node = { id: nextId++, x, y, px: x, py: y, invMass: fixed || mass <= 0 ? 0 : 1 / mass, r, fixed, contact: false, hitLink: false, friction: 0.6, group, baseX: x, baseY: y, forceX: 0, forceY: 0 };
    this.nodes.push(n);
    return n;
  }

  addLink(a: Node, b: Node, o: Partial<Pick<Link, 'compliance' | 'ropeLike' | 'breakForce' | 'partId' | 'role' | 'collide' | 'group' | 'thickness'>> = {}): Link {
    const rest = Math.hypot(b.x - a.x, b.y - a.y);
    const l: Link = {
      id: nextId++, a, b, m: null, rest, compliance: o.compliance ?? 0, lambda: 0, force: 0, ropeLike: o.ropeLike ?? false, stress: 0,
      breakForce: o.breakForce ?? Infinity, broken: false, partId: o.partId ?? null, role: o.role ?? 'axial',
      collide: o.collide ?? false, group: o.group ?? 0, sign: 0, thickness: o.thickness ?? 0.12,
    };
    this.links.push(l);
    return l;
  }

  addGround(x1: number, y1: number, x2: number, y2: number): Ground {
    const g = { a: this.addNode(x1, y1, 0, 0.05, true, -1), b: this.addNode(x2, y2, 0, 0.05, true, -1) };
    this.ground.push(g);
    return g;
  }

  removeLink(l: Link): void {
    this.links = this.links.filter((x) => x !== l);
  }

  removeNode(n: Node): void {
    this.nodes = this.nodes.filter((x) => x !== n);
  }

  /** Give a node an instant velocity (cells/second). */
  kick(n: Node, vx: number, vy: number, dt = 1 / 60): void {
    n.px = n.x - vx * dt;
    n.py = n.y - vy * dt;
  }

  velocity(n: Node, dt = 1 / 60): { vx: number; vy: number } {
    return { vx: (n.x - n.px) / dt, vy: (n.y - n.py) / dt };
  }

  /** Resolve any spawn overlaps without turning them into velocity. Call after adding bodies. */
  warmStart(): void {
    const dt = 1 / (60 * SUBSTEPS);
    for (let k = 0; k < 3; k++) {
      for (const l of this.links) l.lambda = 0;
      for (let it = 0; it < ITERATIONS; it++) {
        for (const l of this.links) if (!l.broken) this.solve(l, dt);
        this.collide(false);
      }
    }
    for (const n of this.nodes) { n.px = n.x; n.py = n.y; }
    for (const l of this.links) { l.lambda = 0; l.force = 0; l.stress = 0; }
  }

  step(frameDt: number): void {
    const dt = frameDt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.time += dt;
      this.integrate(dt);
      for (const l of this.links) l.lambda = 0;
      for (let it = 0; it < ITERATIONS; it++) {
        for (const l of this.links) if (!l.broken) this.solve(l, dt);
        this.collide(it === ITERATIONS - 1);
      }
      for (const l of this.links) {
        if (l.broken) continue;
        l.force = Math.abs(l.lambda) / (dt * dt);
        l.sign = l.lambda < 0 ? 1 : l.lambda > 0 ? -1 : 0; // negative λ = it was pulled apart
        if (l.breakForce !== Infinity) {
          // Smooth so a single jolt reads as a flash and a sustained overload climbs to a snap.
          l.stress += (l.force / l.breakForce - l.stress) * STRESS_SMOOTHING;
          if (l.stress >= 1) {
            l.broken = true;
            const e = { link: l, time: this.time };
            this.breaks.push(e);
            this.onBreak?.(e);
          }
        }
      }
    }
  }

  private integrate(dt: number): void {
    const shake = this.shakeAmp ? Math.sin(this.time * this.shakeFreq * Math.PI * 2) * this.shakeAmp : 0;
    for (const n of this.nodes) {
      n.contact = false;
      n.hitLink = false;
      if (n.fixed) {
        n.px = n.x;
        n.py = n.y;
        n.x = n.baseX + (n.group === -1 || n.group === 0 ? shake : 0);
        n.y = n.baseY;
        continue;
      }
      const vx = (n.x - n.px) * DAMPING;
      const vy = (n.y - n.py) * DAMPING;
      n.px = n.x;
      n.py = n.y;
      n.x += vx + n.forceX * n.invMass * dt * dt;
      n.y += vy + (GRAVITY + n.forceY * n.invMass) * dt * dt;
    }
  }

  /** A beam's stiffness against sagging: keeps m on the straight line between a and b. */
  addBend(a: Node, m: Node, b: Node, o: { compliance: number; breakForce: number; partId: number | null; group?: number }): Link {
    const l = this.addLink(a, b, { compliance: o.compliance, breakForce: o.breakForce, partId: o.partId, role: 'bend', group: o.group ?? 0 });
    l.m = m;
    l.rest = 0;
    return l;
  }

  private solveBend(l: Link, dt: number): void {
    const a = l.a; const b = l.b; const m = l.m!;
    const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
    const dx = m.x - mx; const dy = m.y - my;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    const w = m.invMass + 0.25 * (a.invMass + b.invMass);
    if (w === 0) return;
    const alpha = l.compliance / (dt * dt);
    const dLambda = (-d - alpha * l.lambda) / (w + alpha);
    l.lambda += dLambda;
    const nx = dx / d; const ny = dy / d;
    m.x += m.invMass * dLambda * nx;
    m.y += m.invMass * dLambda * ny;
    a.x -= 0.5 * a.invMass * dLambda * nx;
    a.y -= 0.5 * a.invMass * dLambda * ny;
    b.x -= 0.5 * b.invMass * dLambda * nx;
    b.y -= 0.5 * b.invMass * dLambda * ny;
  }

  /** XPBD distance constraint. λ accumulates over the substep's iterations and gives the real force. */
  private solve(l: Link, dt: number): void {
    if (l.m) { this.solveBend(l, dt); return; }
    const a = l.a; const b = l.b;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const C = d - l.rest;
    if (l.ropeLike && C < 0) return;
    const w = a.invMass + b.invMass;
    if (w === 0) return;
    const alpha = l.compliance / (dt * dt);
    const dLambda = (-C - alpha * l.lambda) / (w + alpha);
    l.lambda += dLambda;
    const nx = dx / d; const ny = dy / d;
    a.x -= a.invMass * dLambda * nx;
    a.y -= a.invMass * dLambda * ny;
    b.x += b.invMass * dLambda * nx;
    b.y += b.invMass * dLambda * ny;
  }

  private collide(applyFriction: boolean): void {
    for (const n of this.nodes) {
      if (n.fixed || n.group < 0) continue;
      const f = applyFriction ? n.friction : 0;
      for (const g of this.ground) this.circleSegment(n, g.a, g.b, n.group === 0 ? -n.r : 0.05, f);
      for (const l of this.links) {
        if (!l.collide || l.broken || l.group === n.group) continue;
        if (l.a === n || l.b === n) continue;
        if (this.circleSegment(n, l.a, l.b, l.thickness, f)) n.hitLink = true;
      }
    }
  }

  private circleSegment(p: Node, a: Node, b: Node, segR: number, friction: number): boolean {
    const abx = b.x - a.x; const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1e-9;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a.x + abx * t; const cy = a.y + aby * t;
    let nx = p.x - cx; let ny = p.y - cy;
    let dist: number;
    const minDist = p.r + segR;
    if (t > 0 && t < 1) {
      // Along the face: signed distance on the side the particle came from, so a particle that starts on the
      // line (or crossed it this step) is still pushed back to its own side.
      const m = Math.sqrt(len2);
      let fx = -aby / m; let fy = abx / m;
      const side = (p.px - a.x) * fx + (p.py - a.y) * fy;
      const sideNow = (p.x - a.x) * fx + (p.y - a.y) * fy;
      // No history (started exactly on the line): take the side that faces up, which is what a floor wants.
      const sgn = side !== 0 ? Math.sign(side) : (fy < 0 ? 1 : -1);
      void sideNow;
      fx *= sgn; fy *= sgn;
      dist = (p.x - cx) * fx + (p.y - cy) * fy;
      if (dist >= minDist) return false;
      nx = fx; ny = fy;
    } else {
      dist = Math.hypot(nx, ny);
      if (dist >= minDist) return false;
      if (dist < 1e-6) { nx = -aby; ny = abx; const mm = Math.hypot(nx, ny) || 1; nx /= mm; ny /= mm; }
      else { nx /= dist; ny /= dist; }
    }
    const pen = minDist - dist;
    const segInv = (1 - t) * a.invMass + t * b.invMass;
    const total = p.invMass + segInv;
    if (total === 0) return false;
    const wp = p.invMass / total;
    p.x += nx * pen * wp;
    p.y += ny * pen * wp;
    p.contact = true;
    if (segInv > 0) {
      const ws = (pen * (1 - wp)) / (((1 - t) * (1 - t)) * a.invMass + (t * t) * b.invMass || 1e-9);
      a.x -= nx * ws * (1 - t) * a.invMass;
      a.y -= ny * ws * (1 - t) * a.invMass;
      b.x -= nx * ws * t * b.invMass;
      b.y -= ny * ws * t * b.invMass;
    }
    // Friction: bleed off tangential velocity relative to the surface (which may itself be moving).
    const svx = (1 - t) * (a.x - a.px) + t * (b.x - b.px);
    const svy = (1 - t) * (a.y - a.py) + t * (b.y - b.py);
    const vx = p.x - p.px - svx; const vy = p.y - p.py - svy;
    const vn = vx * nx + vy * ny;
    const tx = vx - nx * vn; const ty = vy - ny * vn;
    if (friction) { p.px += tx * friction; p.py += ty * friction; }
    return true;
  }
}

/** A rigid rectangle made of four corners, four collidable edges and two diagonals. */
export function addBox(w: World, cx: number, cy: number, width: number, height: number, mass: number, group: number, collideEdges = true): Node[] {
  const hw = width / 2; const hh = height / 2;
  const m = mass / 4;
  const c = [
    w.addNode(cx - hw, cy - hh, m, 0.06, false, group),
    w.addNode(cx + hw, cy - hh, m, 0.06, false, group),
    w.addNode(cx + hw, cy + hh, m, 0.06, false, group),
    w.addNode(cx - hw, cy + hh, m, 0.06, false, group),
  ];
  for (let i = 0; i < 4; i++) w.addLink(c[i], c[(i + 1) % 4], { role: 'body', collide: collideEdges, group, thickness: 0.04 });
  w.addLink(c[0], c[2], { role: 'body', group });
  w.addLink(c[1], c[3], { role: 'body', group });
  return c;
}
