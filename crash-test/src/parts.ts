// The kit. Every part has one honest property a child can discover by testing.

export type SegmentKind = 'beam' | 'long' | 'pillar' | 'brace' | 'rope';
export type BlockKind = 'block' | 'wide';
export type ToolKind = SegmentKind | BlockKind | 'pivot' | 'eraser';

export interface SegmentDef {
  kind: SegmentKind;
  name: string;
  icon: string;
  cost: number;
  minLen: number;
  maxLen: number;
  breakForce: number;
  compliance: number;
  ropeLike: boolean;
  vertical: boolean;
  thickness: number;
  color: string;
  /** Long beams get a middle node and a soft end-to-end link that sags and snaps. */
  bend?: { breakForce: number; compliance: number };
  tip: string;
}

export interface BlockDef {
  kind: BlockKind;
  name: string;
  icon: string;
  cost: number;
  w: number;
  h: number;
  mass: number;
  color: string;
  tip: string;
}

export const SEGMENTS: Record<SegmentKind, SegmentDef> = {
  beam: { kind: 'beam', name: 'Beam', icon: '▬', cost: 2, minLen: 1, maxLen: 3, breakForce: 480, compliance: 1e-4, ropeLike: false, vertical: false, thickness: 0.14, color: '#ffb347', tip: 'Strong and short. Good for decks and frames.' },
  long: { kind: 'long', name: 'Long beam', icon: '▬▬', cost: 3, minLen: 4, maxLen: 6, breakForce: 700, compliance: 1e-4, ropeLike: false, vertical: false, thickness: 0.14, color: '#ffd27a', bend: { breakForce: 105, compliance: 4e-3 }, tip: 'Spans a gap, but it sags in the middle. Hold the middle up!' },
  pillar: { kind: 'pillar', name: 'Pillar', icon: '▮', cost: 2, minLen: 1, maxLen: 5, breakForce: 1000, compliance: 5e-5, ropeLike: false, vertical: true, thickness: 0.22, color: '#8fc4ff', tip: 'Holds weight straight down. Only stands up and down.' },
  brace: { kind: 'brace', name: 'Brace', icon: '╱', cost: 1, minLen: 1, maxLen: 6, breakForce: 650, compliance: 1e-4, ropeLike: false, vertical: false, thickness: 0.08, color: '#3ee6c7', tip: 'Thin and cheap. Corner to corner turns a wobbly square into two triangles.' },
  rope: { kind: 'rope', name: 'Rope', icon: '〰', cost: 1, minLen: 1, maxLen: 8, breakForce: 300, compliance: 3e-4, ropeLike: true, vertical: false, thickness: 0.06, color: '#d76cff', tip: 'Only pulls. Push a rope and it just goes floppy.' },
};

export const BLOCKS: Record<BlockKind, BlockDef> = {
  block: { kind: 'block', name: 'Block', icon: '■', cost: 1, w: 1, h: 1, mass: 3, color: '#ffb347', tip: 'Small and stackable.' },
  wide: { kind: 'wide', name: 'Wide block', icon: '▬', cost: 2, w: 3, h: 1, mass: 8, color: '#8fc4ff', tip: 'Heavy and wide. Great at the bottom.' },
};

export const TOOL_INFO: Record<'pivot' | 'eraser', { name: string; icon: string; cost: number; tip: string }> = {
  pivot: { name: 'Pivot', icon: '▲', cost: 0, tip: 'The point the plank tips on. Where you put it changes everything.' },
  eraser: { name: 'Remove', icon: '✕', cost: 0, tip: 'Tap a part to take it away.' },
};

export function isSegment(k: ToolKind): k is SegmentKind {
  return k in SEGMENTS;
}

export function isBlock(k: ToolKind): k is BlockKind {
  return k in BLOCKS;
}
