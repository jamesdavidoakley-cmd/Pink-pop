// What the child has placed. Pure data, so the physics world can be rebuilt from it for every test.
import { SEGMENTS, BLOCKS, type SegmentKind, type BlockKind } from './parts';
import type { LevelDef } from './levels';

export interface PlacedSegment { id: number; kind: SegmentKind; ax: number; ay: number; bx: number; by: number }
/** x,y is the bottom-left grid point; the block fills [x, x+w] × [y-h, y]. */
export interface PlacedBlock { id: number; kind: BlockKind; x: number; y: number }

export interface Build {
  parts: PlacedSegment[];
  blocks: PlacedBlock[];
  pivotX: number | null;
}

export function emptyBuild(): Build {
  return { parts: [], blocks: [], pivotX: null };
}

export function cloneBuild(b: Build): Build {
  return { parts: b.parts.map((p) => ({ ...p })), blocks: b.blocks.map((p) => ({ ...p })), pivotX: b.pivotX };
}

export function buildCost(b: Build): number {
  return b.parts.reduce((s, p) => s + SEGMENTS[p.kind].cost, 0) + b.blocks.reduce((s, p) => s + BLOCKS[p.kind].cost, 0);
}

let nextId = 1;

export type PlaceResult = { ok: true } | { ok: false; why: string };

export function canPlaceSegment(level: LevelDef, b: Build, kind: SegmentKind, ax: number, ay: number, bx: number, by: number): PlaceResult {
  const def = SEGMENTS[kind];
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 0.5) return { ok: false, why: 'Drag to a second point.' };
  if (def.vertical && ax !== bx) return { ok: false, why: 'Pillars only stand straight up.' };
  if (len > def.maxLen + 0.01) return { ok: false, why: `Too long for a ${def.name.toLowerCase()} (max ${def.maxLen}).` };
  if (len < def.minLen - 0.01) return { ok: false, why: `A ${def.name.toLowerCase()} needs to be at least ${def.minLen} long.` };
  const inBox = (x: number, y: number) => x >= level.build.x1 && x <= level.build.x2 && y >= level.build.y1 && y <= level.build.y2;
  if (!inBox(ax, ay) || !inBox(bx, by)) return { ok: false, why: 'Build inside the chalk box.' };
  const dup = b.parts.some((p) => (p.ax === ax && p.ay === ay && p.bx === bx && p.by === by) || (p.ax === bx && p.ay === by && p.bx === ax && p.by === ay));
  if (dup) return { ok: false, why: 'There is already a part there.' };
  if (buildCost(b) + def.cost > level.budget) return { ok: false, why: 'Not enough coins. Remove something first.' };
  return { ok: true };
}

export function placeSegment(b: Build, kind: SegmentKind, ax: number, ay: number, bx: number, by: number): PlacedSegment {
  const p = { id: nextId++, kind, ax, ay, bx, by };
  b.parts.push(p);
  return p;
}

export function canPlaceBlock(level: LevelDef, b: Build, kind: BlockKind, x: number, y: number): PlaceResult {
  const def = BLOCKS[kind];
  if (x < level.build.x1 || x + def.w > level.build.x2 || y - def.h < level.build.y1 || y > level.build.y2) return { ok: false, why: 'Build inside the chalk box.' };
  for (const o of b.blocks) {
    const od = BLOCKS[o.kind];
    const overlap = x < o.x + od.w && x + def.w > o.x && y - def.h < o.y && y > o.y - od.h;
    if (overlap) return { ok: false, why: 'Something is already there.' };
  }
  if (buildCost(b) + def.cost > level.budget) return { ok: false, why: 'Not enough coins. Remove something first.' };
  return { ok: true };
}

export function placeBlock(b: Build, kind: BlockKind, x: number, y: number): PlacedBlock {
  const p = { id: nextId++, kind, x, y };
  b.blocks.push(p);
  return p;
}

/** Distance from a point to a segment, for tapping on parts. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax; const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1e-9;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

export function eraseAt(b: Build, x: number, y: number): boolean {
  let best: PlacedSegment | null = null;
  let bestD = 0.35;
  for (const p of b.parts) {
    const d = distToSegment(x, y, p.ax, p.ay, p.bx, p.by);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) { b.parts = b.parts.filter((p) => p !== best); return true; }
  for (const blk of b.blocks) {
    const d = BLOCKS[blk.kind];
    if (x >= blk.x && x <= blk.x + d.w && y >= blk.y - d.h && y <= blk.y) { b.blocks = b.blocks.filter((p) => p !== blk); return true; }
  }
  return false;
}
