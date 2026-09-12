// Runs one test: builds the physics world from level + build, then plays each load in turn.
import { World, addBox, type Node, type Link, type BreakEvent } from './physics';
import { SEGMENTS, BLOCKS, type SegmentKind } from './parts';
import type { LevelDef, LoadDef } from './levels';
import type { Build } from './build';

export interface SimPart { id: number; kind: SegmentKind; links: Link[] }
export interface SimBlock { id: number; kind: 'block' | 'wide'; corners: Node[] }
export interface Cart { nodes: Node[]; wheels: Node[]; crates: number; max: boolean; travelled: number }
export interface Goat { node: Node; max: boolean; running: boolean; speed: number }
export interface Drop { corners: Node[]; max: boolean }
export interface Lever { plank: Node[]; boulder: Node; pivot: Node | null }

export type Reason = 'held' | 'snapped' | 'fell' | 'stuck' | 'wobbled' | 'toppled' | 'rock' | 'roofFell' | 'notLifted' | 'tooShort' | 'noPivot' | 'collapsed';
export interface Outcome { ok: boolean; reason: Reason; link?: Link; at?: { x: number; y: number } }
export type LoadStatus = { state: 'running' } | { state: 'done'; outcome: Outcome };

const GROUP_STRUCTURE = 0;
const GROUP_CART = 100;
const GROUP_GOAT = 110;
const GROUP_ROCKS = 200;
const GROUP_DROP = 300;

export class Sim {
  world = new World();
  parts: SimPart[] = [];
  blocks: SimBlock[] = [];
  structureNodes: Node[] = [];
  cart: Cart | null = null;
  goats: Goat[] = [];
  rocks: Node[] = [];
  drop: Drop | null = null;
  lever: Lever | null = null;
  firstBreak: BreakEvent | null = null;
  /** Anchors drawn as bolts. */
  anchors: Node[] = [];
  private load: LoadDef | null = null;
  private loadTime = 0;
  private spawned = 0;
  private lastSpawn = 0;
  private topBefore = 0;
  private lowFrames = 0;

  constructor(public level: LevelDef, public build: Build) {
    const w = this.world;
    for (const [x1, y1, x2, y2] of level.ground) w.addGround(x1, y1, x2, y2);
    const nodeAt = new Map<string, Node>();
    const key = (x: number, y: number) => `${x},${y}`;
    for (const [x, y] of level.anchors) {
      const n = w.addNode(x, y, 0, 0.16, true, GROUP_STRUCTURE);
      nodeAt.set(key(x, y), n);
      this.anchors.push(n);
    }
    const getNode = (x: number, y: number): Node => {
      let n = nodeAt.get(key(x, y));
      if (!n) {
        n = w.addNode(x, y, 1.0, 0.15, false, GROUP_STRUCTURE);
        nodeAt.set(key(x, y), n);
        this.structureNodes.push(n);
      }
      return n;
    };
    for (const p of build.parts) {
      const def = SEGMENTS[p.kind];
      const a = getNode(p.ax, p.ay);
      const b = getNode(p.bx, p.by);
      const links: Link[] = [];
      // Braces and ropes are thin and sit beside the road: loads pass them. Beams, long beams and pillars are solid.
      const common = { breakForce: def.breakForce, compliance: def.compliance, ropeLike: def.ropeLike, partId: p.id, collide: !def.ropeLike && p.kind !== 'brace', thickness: def.thickness, group: GROUP_STRUCTURE };
      if (def.bend) {
        const mx = (p.ax + p.bx) / 2; const my = (p.ay + p.by) / 2;
        let mid: Node;
        if (Number.isInteger(mx) && Number.isInteger(my)) mid = getNode(mx, my);
        else { mid = w.addNode(mx, my, 1.0, 0.15, false, GROUP_STRUCTURE); this.structureNodes.push(mid); }
        links.push(w.addLink(a, mid, common), w.addLink(mid, b, common));
        links.push(w.addBend(a, mid, b, { breakForce: def.bend.breakForce, compliance: def.bend.compliance, partId: p.id, group: GROUP_STRUCTURE }));
      } else {
        links.push(w.addLink(a, b, common));
      }
      for (const l of links) tagLinkKind(l, p.kind);
      this.parts.push({ id: p.id, kind: p.kind, links });
    }
    build.blocks.forEach((blk, i) => {
      const def = BLOCKS[blk.kind];
      const lift = 0.1 * (Math.max(0, 11 - blk.y) + 1); // one contact gap per layer so nothing starts overlapping
      const corners = addBox(w, blk.x + def.w / 2, blk.y - def.h / 2 - lift, def.w, def.h, def.mass, 1 + i);
      this.blocks.push({ id: blk.id, kind: blk.kind, corners });
    });
    if (level.lever) {
      const lv = level.lever;
      const plank: Node[] = [];
      for (let x = lv.x1; x <= lv.x2; x++) plank.push(w.addNode(x, lv.y, 0.2, 0.12, false, GROUP_STRUCTURE));
      for (let i = 0; i < plank.length; i++) for (let j = i + 1; j < plank.length; j++) {
        w.addLink(plank[i], plank[j], { collide: j === i + 1, thickness: 0.16, group: GROUP_STRUCTURE });
      }
      const boulder = w.addNode(lv.x1 + 0.3, lv.y + 0.85, lv.boulderMass, 0.75, false, GROUP_STRUCTURE);
      w.addLink(boulder, plank[0], { group: GROUP_STRUCTURE });
      w.addLink(boulder, plank[1], { group: GROUP_STRUCTURE });
      let pivot: Node | null = null;
      if (build.pivotX !== null) {
        pivot = w.addNode(build.pivotX, lv.y, 0, 0.1, true, -2);
        const under = plank[build.pivotX - lv.x1];
        const pin = w.addLink(pivot, under, { group: GROUP_STRUCTURE });
        pin.rest = 0;
      }
      this.lever = { plank, boulder, pivot };
    }
    w.warmStart();
    w.onBreak = (e) => { if (!this.firstBreak) this.firstBreak = e; };
    w.floorY = 40;
  }

  /** Highest point of anything the child built (smaller y = higher). */
  topY(): number {
    let top = Infinity;
    for (const n of this.structureNodes) top = Math.min(top, n.y);
    for (const b of this.blocks) for (const c of b.corners) top = Math.min(top, c.y);
    return top;
  }

  /** Checks that happen the moment TEST is pressed. */
  precheck(): Outcome | null {
    const lv = this.level;
    if (lv.lever && this.build.pivotX === null) return { ok: false, reason: 'noPivot' };
    if (lv.starY !== undefined) {
      let top = Infinity;
      for (const p of this.build.parts) top = Math.min(top, p.ay, p.by);
      for (const b of this.build.blocks) top = Math.min(top, b.y - BLOCKS[b.kind].h);
      if (top > lv.starY + 0.05) return { ok: false, reason: 'tooShort' };
    }
    return null;
  }

  startLoad(load: LoadDef): void {
    this.load = load;
    this.loadTime = 0;
    this.spawned = 0;
    this.lastSpawn = -10;
    this.topBefore = this.topY();
    this.lowFrames = 0;
    const w = this.world;
    const lv = this.level;
    switch (load.type) {
      case 'cart': {
        const deck = lv.ground[0][1];
        const x = 2.4;
        const y = deck - 0.42;
        const m = load.mass;
        const wl = w.addNode(x - 0.75, y, m * 0.3, 0.4, false, GROUP_CART);
        const wr = w.addNode(x + 0.75, y, m * 0.3, 0.4, false, GROUP_CART);
        wl.friction = 0.005; wr.friction = 0.005;
        const tl = w.addNode(x - 0.9, y - 1.0, m * 0.2, 0.06, false, GROUP_CART);
        const tr = w.addNode(x + 0.9, y - 1.0, m * 0.2, 0.06, false, GROUP_CART);
        const ns = [wl, wr, tl, tr];
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) w.addLink(ns[i], ns[j], { role: 'body', group: GROUP_CART });
        this.cart = { nodes: ns, wheels: [wl, wr], crates: load.crates, max: !!load.max, travelled: 0 };
        break;
      }
      case 'goat':
        this.spawnGoat(load.mass, load.speed, !!load.max);
        this.spawned = 1;
        this.lastSpawn = 0;
        break;
      case 'quake':
        w.shakeAmp = load.amp;
        w.shakeFreq = load.freq;
        break;
      case 'rocks':
        break;
      case 'drop': {
        let x = 12;
        if (lv.lever) x = lv.lever.x2 - 1.1;
        else if (lv.zone) x = (lv.zone.x1 + lv.zone.x2) / 2;
        else if (this.blocks.length) {
          const top = this.blocks.reduce((best, b) => (this.center(b.corners).y < this.center(best.corners).y ? b : best), this.blocks[0]);
          x = this.center(top.corners).x;
        }
        const corners = addBox(w, x, -1.5, 1.8, 1.4, load.mass, GROUP_DROP, true);
        for (const c of corners) c.friction = 0.9;
        this.drop = { corners, max: true };
        break;
      }
    }
  }

  private spawnGoat(mass: number, speed: number, max: boolean): void {
    const g = this.world.addNode(0.8, 11 - 0.6, mass, 0.55, false, GROUP_GOAT + this.goats.length);
    g.friction = 0.02;
    this.world.kick(g, speed, 0);
    this.goats.push({ node: g, max, running: true, speed });
  }

  /** True once the top of the build has sat well below where it started for a third of a second. */
  private sunk(): boolean {
    if (this.topY() > this.topBefore + 0.8) this.lowFrames++; else this.lowFrames = 0;
    return this.lowFrames > 20;
  }

  center(ns: Node[]): { x: number; y: number } {
    return { x: ns.reduce((s, n) => s + n.x, 0) / ns.length, y: ns.reduce((s, n) => s + n.y, 0) / ns.length };
  }

  private inZone(x: number, y: number): boolean {
    const z = this.level.zone;
    return !!z && x > z.x1 && x < z.x2 && y > z.y1 && y < z.y2;
  }

  update(dt: number): LoadStatus {
    const w = this.world;
    const lv = this.level;
    const load = this.load;
    // Drive the cart.
    // Drives are steady forces, so a blocked wheel or goat leans rather than hammers.
    if (this.cart) {
      for (const wheel of this.cart.wheels) {
        const v = w.velocity(wheel, dt);
        wheel.forceX = wheel.contact && v.vx < 3.4 ? (1 / wheel.invMass) * 14 : 0;
      }
    }
    for (const g of this.goats) {
      if (g.node.hitLink) g.running = false;
      const v = w.velocity(g.node, dt);
      g.node.forceX = g.node.contact && v.vx < g.speed ? (1 / g.node.invMass) * (g.running ? 30 : 22) : 0;
    }
    w.step(dt);
    this.loadTime += dt;
    if (!load) return { state: 'running' };

    // Structure failures that apply to every load.
    if (this.firstBreak && this.firstBreak.link.partId !== null) {
      const l = this.firstBreak.link;
      return { state: 'done', outcome: { ok: false, reason: 'snapped', link: l, at: { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 } } };
    }
    if (lv.failY !== undefined) {
      for (const n of this.structureNodes) if (n.y > lv.failY + 1.5) return { state: 'done', outcome: { ok: false, reason: 'collapsed', at: { x: n.x, y: lv.failY } } };
    }

    switch (load.type) {
      case 'cart': {
        const c = this.cart!;
        const ctr = this.center(c.nodes);
        if (c.nodes.some((n) => n.y > (lv.failY ?? 20))) return { state: 'done', outcome: { ok: false, reason: 'fell', at: ctr } };
        if (ctr.x > (lv.goalX ?? 22)) return { state: 'done', outcome: { ok: true, reason: 'held' } };
        if (this.loadTime > 16) return { state: 'done', outcome: { ok: false, reason: 'stuck', at: ctr } };
        return { state: 'running' };
      }
      case 'goat': {
        if (this.spawned < load.count && this.loadTime - this.lastSpawn > 1.4) {
          this.spawnGoat(load.mass, load.speed, !!load.max);
          this.spawned++;
          this.lastSpawn = this.loadTime;
        }
        if (this.sunk()) return { state: 'done', outcome: { ok: false, reason: 'wobbled', at: { x: 12, y: this.topY() } } };
        if (this.spawned >= load.count && this.loadTime - this.lastSpawn > 6.5) return { state: 'done', outcome: { ok: true, reason: 'held' } };
        return { state: 'running' };
      }
      case 'quake': {
        const top = this.topY();
        if (this.sunk()) { w.shakeAmp = 0; return { state: 'done', outcome: { ok: false, reason: 'toppled', at: { x: 12, y: top } } }; }
        if (this.loadTime > load.seconds) { w.shakeAmp = 0; return { state: 'done', outcome: { ok: true, reason: 'held' } }; }
        return { state: 'running' };
      }
      case 'rocks': {
        if (this.spawned < load.count && this.loadTime - this.lastSpawn > 0.8) {
          const z = lv.zone!;
          const x = z.x1 + 0.4 + Math.random() * (z.x2 - z.x1 - 0.8);
          const r = this.world.addNode(x, 1.5 - Math.random(), load.mass, 0.3 + load.mass * 0.05, false, GROUP_ROCKS);
          r.friction = 0.5;
          this.rocks.push(r);
          this.spawned++;
          this.lastSpawn = this.loadTime;
        }
        for (const r of this.rocks) if (this.inZone(r.x, r.y)) return { state: 'done', outcome: { ok: false, reason: 'rock', at: { x: r.x, y: r.y } } };
        for (const n of this.structureNodes) if (this.inZone(n.x, n.y)) return { state: 'done', outcome: { ok: false, reason: 'roofFell', at: { x: n.x, y: n.y } } };
        if (this.spawned >= load.count && this.loadTime - this.lastSpawn > 3) return { state: 'done', outcome: { ok: true, reason: 'held' } };
        return { state: 'running' };
      }
      case 'drop': {
        const d = this.drop!;
        const ctr = this.center(d.corners);
        if (lv.lever) {
          const pl = this.lever!.plank;
          const tilt = pl[pl.length - 1].y - pl[0].y; // positive = Max's end is lower = boulder is up
          if (tilt > 0.6 && this.loadTime > 1) this.lowFrames++; else this.lowFrames = 0;
          if (this.lowFrames > 30) return { state: 'done', outcome: { ok: true, reason: 'held' } };
          if (this.loadTime > 6) return { state: 'done', outcome: { ok: false, reason: 'notLifted', at: { x: this.lever!.boulder.x, y: this.lever!.boulder.y } } };
          return { state: 'running' };
        }
        if (lv.zone) {
          if (d.corners.some((n) => this.inZone(n.x, n.y))) return { state: 'done', outcome: { ok: false, reason: 'rock', at: ctr } };
          for (const n of this.structureNodes) if (this.inZone(n.x, n.y)) return { state: 'done', outcome: { ok: false, reason: 'roofFell', at: { x: n.x, y: n.y } } };
          if (this.loadTime > 5) return { state: 'done', outcome: { ok: true, reason: 'held' } };
          return { state: 'running' };
        }
        if (this.sunk()) return { state: 'done', outcome: { ok: false, reason: 'toppled', at: { x: ctr.x, y: this.topY() } } };
        if (this.loadTime > 5) return { state: 'done', outcome: { ok: true, reason: 'held' } };
        return { state: 'running' };
      }
    }
  }

  /** Remove the load's bodies so the next load starts clean (the structure stays as it is). */
  clearLoad(): void {
    const w = this.world;
    const gone = new Set<Node>();
    if (this.cart) { this.cart.nodes.forEach((n) => gone.add(n)); this.cart = null; }
    for (const g of this.goats) gone.add(g.node);
    this.goats = [];
    for (const r of this.rocks) gone.add(r);
    this.rocks = [];
    if (this.drop) { this.drop.corners.forEach((n) => gone.add(n)); this.drop = null; }
    w.links = w.links.filter((l) => !gone.has(l.a) && !gone.has(l.b));
    w.nodes = w.nodes.filter((n) => !gone.has(n));
    w.shakeAmp = 0;
    this.load = null;
  }
}

export function explain(outcome: Outcome, level: LevelDef): string {
  const l = outcome.link;
  switch (outcome.reason) {
    case 'held': return 'It held!';
    case 'snapped': {
      if (!l) return 'Something snapped.';
      const kind = level.mode === 'lift' ? 'beam' : ([...Object.keys(SEGMENTS)] as SegmentKind[]).find((k) => k === kindOfLink(l)) ?? 'beam';
      if (l.role === 'bend') return 'The long beam bent too much in the middle. Put a pillar under its middle, or brace it into triangles.';
      if (kind === 'rope') return 'The rope snapped. Share the pull with a second rope.';
      if (kind === 'brace') return 'The brace snapped, it was holding too much on its own. Add another brace.';
      if (kind === 'pillar') return 'Even the pillar gave way. Spread the weight over more pillars.';
      return l.sign > 0 ? 'This beam got pulled apart. Ropes love pulling, or make a triangle to share it.' : 'This beam got squashed. A pillar is stronger straight down.';
    }
    case 'fell': return 'The cart fell through. It needs a deck to roll on the whole way across.';
    case 'stuck': return 'The cart got stuck. Make the deck flat, with no steps.';
    case 'collapsed': return 'The bridge fell in. Every joint needs something holding it up.';
    case 'wobbled': return "The gate wobbled over. Squares wobble, triangles don't. Brace it corner to corner.";
    case 'toppled': return 'The tower toppled. Wide at the bottom, heavy at the bottom.';
    case 'rock': return 'A rock got through to the sheep. Cover the whole pen, edge to edge.';
    case 'roofFell': return 'The roof came down on the pen. Give the load a path to the ground.';
    case 'notLifted': return "Max wasn't heavy enough there. Move the pivot closer to the boulder for a longer arm.";
    case 'tooShort': return 'Build up to the star first.';
    case 'noPivot': return 'Tap under the plank to place the pivot first.';
  }
}

const linkKinds = new WeakMap<Link, SegmentKind>();
export function tagLinkKind(l: Link, k: SegmentKind): void { linkKinds.set(l, k); }
export function kindOfLink(l: Link): SegmentKind | undefined { return linkKinds.get(l); }
