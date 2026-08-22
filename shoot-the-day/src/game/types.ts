import type { Vec2 } from './math';

export type GuestKind = 'guest' | 'child' | 'bride' | 'groom' | 'officiant' | 'speaker';

/** Body poses. Each one is a different arrangement of the same procedural sprite. */
export type Pose =
  | 'idle'
  | 'seated'
  | 'armRaise'
  | 'shoulderTurn'
  | 'clap'
  | 'laugh'
  | 'wipeEye'
  | 'lean'
  | 'point'
  | 'kiss'
  | 'ring'
  | 'toast'
  | 'throw'
  | 'reach'
  | 'headDown'
  | 'posed';

export type Palette = 'guest' | 'child' | 'bride' | 'groom' | 'officiant' | 'speaker';

export interface Guest {
  id: string;
  kind: GuestKind;
  palette: Palette;
  x: number;
  y: number;
  /** Where they belong; they drift back to it. */
  homeX: number;
  homeY: number;
  facing: number;
  baseFacing: number;
  /** Top of head above the floor, metres. */
  height: number;
  seated: boolean;
  width: number;
  awareness: number;
  posed: boolean;
  swayPhase: number;
  swaySpeed: number;
  pose: Pose;
  /** 0..1 blend into `pose`. */
  poseAmount: number;
  /** Set by the director when a moment wants this body somewhere else. */
  walkTo: Vec2 | null;
  walkSpeed: number;
  facingTo: number | null;
}

export type MomentPhase = 'dormant' | 'tell' | 'build' | 'peak' | 'decay' | 'gone';

export interface MomentDef {
  id: string;
  /** Plain English, used in the debrief. */
  label: string;
  /** Seconds into the scene that the tell begins. */
  at: number;
  /** Guest ids. The first one is the subject the frame is judged against. */
  subjects: string[];
  mustGet?: boolean;
  /** A wide beat: the frame has to show the room, not a face. */
  wide?: boolean;
  tellPose: Pose;
  peakPose: Pose;
  /** Optional choreography, fired when the tell starts. */
  moves?: { id: string; to: Vec2; speed?: number; face?: number }[];
  /** Fires when the moment is gone: usually "go home". */
  after?: { id: string; to: Vec2; speed?: number; face?: number }[];
}

export interface Moment extends MomentDef {
  phase: MomentPhase;
  /** Seconds elapsed inside the current phase run. */
  elapsed: number;
  bestScore: number;
  value: number;
}

export interface WallDef {
  a: Vec2;
  b: Vec2;
  height: number;
  tone?: string;
}

export interface WindowDef {
  /** A sub-segment of a wall. */
  a: Vec2;
  b: Vec2;
  /** Sill and head height, metres. */
  h0: number;
  h1: number;
  /** How hard the light through it falls into the room. */
  strength: number;
}

export type FurnitureShape = 'chair' | 'table' | 'roundTable' | 'altar' | 'lamp' | 'arch';

export interface Furniture {
  shape: FurnitureShape;
  x: number;
  y: number;
  w: number;
  d: number;
  height: number;
  facing?: number;
}

export interface ForbiddenZone {
  poly: Vec2[];
  rebuke: string;
  /** Shown on the top-down plan so it is learnable, not a gotcha. */
  label: string;
}

export interface SceneDef {
  id: 'ceremony' | 'confetti' | 'speeches';
  title: string;
  subtitle: string;
  duration: number;
  frames: number;
  /** Room brightness, 0..1. Speeches is dim on purpose. */
  ambient: number;
  floor: string;
  wall: string;
  /** Direction the light travels, unit vector. Null when a lamp drives it. */
  lightDir: Vec2 | null;
  /** Point light (the practical lamp). Light travels away from it. */
  lightPoint: Vec2 | null;
  walls: WallDef[];
  windows: WindowDef[];
  furniture: Furniture[];
  guests: Guest[];
  moments: MomentDef[];
  forbidden: ForbiddenZone[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
  start: { x: number; y: number; heading: number };
  tutorial?: { at: number; text: string }[];
  confetti?: { from: number; to: number; at: Vec2; spread: number };
}

/** A frozen snapshot of one body at the instant the shutter fired. */
export interface FrameGuest {
  id: string;
  kind: GuestKind;
  palette: Palette;
  x: number;
  y: number;
  facing: number;
  height: number;
  width: number;
  seated: boolean;
  pose: Pose;
  poseAmount: number;
  posed: boolean;
  swayPhase: number;
}

export interface ScoreParts {
  moment: number;
  framing: number;
  clarity: number;
  light: number;
  angle: number;
  layers: number;
}

export interface Shot {
  id: number;
  sceneId: SceneDef['id'];
  t: number;
  cam: { x: number; y: number; heading: number; crouched: boolean };
  guests: FrameGuest[];
  particles: { x: number; y: number; z: number; r: number; tone: string }[];
  momentId: string | null;
  momentLabel: string | null;
  phase: MomentPhase | null;
  subjectId: string | null;
  parts: ScoreParts;
  score: number;
  critique: string;
  posed: boolean;
  inForbidden: string | null;
}

export interface SceneResult {
  sceneId: SceneDef['id'];
  title: string;
  framesUsed: number;
  framesTotal: number;
  keepers: number;
  beats: { id: string; label: string; hit: boolean; best: number }[];
}
