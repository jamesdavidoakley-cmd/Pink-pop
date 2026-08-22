import { PALETTE, shade, withAlpha } from './palette';
import { clamp, lerp } from '../game/math';
import type { FrameGuest, Palette, Pose } from '../game/types';

/** Limb angles are measured from straight down, positive = swung outward. */
interface Rig {
  leanX: number;
  headTilt: number;
  headDrop: number;
  armL: [number, number];
  armR: [number, number];
  bounce: number;
  stiff: number;
}

const IDLE: Rig = { leanX: 0, headTilt: 0, headDrop: 0, armL: [0.13, 0.06], armR: [0.13, 0.06], bounce: 0, stiff: 0 };

const POSES: Record<Pose, Rig> = {
  idle: IDLE,
  seated: { ...IDLE, armL: [0.3, 0.9], armR: [0.3, 0.9] },
  armRaise: { ...IDLE, armR: [2.25, 0.35], armL: [0.2, 0.1] },
  shoulderTurn: { ...IDLE, leanX: 0.075, headTilt: 0.18, armL: [0.28, 0.2] },
  clap: { ...IDLE, armL: [1.15, 1.25], armR: [1.15, 1.25], bounce: 0.012 },
  laugh: { ...IDLE, headTilt: -0.3, armR: [1.45, 2.0], bounce: 0.02 },
  wipeEye: { ...IDLE, headTilt: 0.22, armR: [1.75, 2.35] },
  lean: { ...IDLE, leanX: 0.12, headTilt: 0.1 },
  point: { ...IDLE, armR: [1.5, 0.08], headTilt: 0.08 },
  kiss: { ...IDLE, leanX: 0.1, headTilt: 0.28, armR: [0.6, 0.9] },
  ring: { ...IDLE, armL: [1.0, 1.1], armR: [1.0, 1.1], headTilt: 0.24 },
  toast: { ...IDLE, armR: [2.45, 0.25], headTilt: -0.12 },
  throw: { ...IDLE, armR: [2.6, 0.3], armL: [2.2, 0.45], bounce: 0.024 },
  reach: { ...IDLE, armR: [1.4, 0.6], armL: [1.2, 0.5], leanX: 0.06 },
  headDown: { ...IDLE, headTilt: 0.42, headDrop: 0.05, armL: [0.35, 1.0], armR: [0.35, 1.0] },
  posed: { ...IDLE, armL: [0.07, 0.02], armR: [0.07, 0.02], stiff: 1 },
};

function blendRig(pose: Pose, amount: number): Rig {
  const target = POSES[pose] ?? IDLE;
  const t = clamp(amount);
  return {
    leanX: lerp(IDLE.leanX, target.leanX, t),
    headTilt: lerp(IDLE.headTilt, target.headTilt, t),
    headDrop: lerp(IDLE.headDrop, target.headDrop, t),
    armL: [lerp(IDLE.armL[0], target.armL[0], t), lerp(IDLE.armL[1], target.armL[1], t)],
    armR: [lerp(IDLE.armR[0], target.armR[0], t), lerp(IDLE.armR[1], target.armR[1], t)],
    bounce: target.bounce * t,
    stiff: target.stiff * t,
  };
}

export interface BodyTones {
  body: string;
  head: string;
  hair: string;
  accent: string;
}

const BASE_TONES: Record<Palette, BodyTones> = {
  guest: { body: PALETTE.guestBody, head: PALETTE.guestHead, hair: PALETTE.hair, accent: PALETTE.guestBody },
  child: { body: PALETTE.childBody, head: PALETTE.guestHead, hair: PALETTE.hair, accent: PALETTE.childBody },
  bride: { body: PALETTE.brideBody, head: PALETTE.guestHead, hair: PALETTE.hair, accent: PALETTE.accent },
  groom: { body: PALETTE.groomBody, head: PALETTE.guestHead, hair: PALETTE.hair, accent: PALETTE.accent },
  officiant: { body: PALETTE.officiantBody, head: PALETTE.guestHead, hair: PALETTE.hair, accent: PALETTE.officiantBody },
  speaker: { body: PALETTE.speakerBody, head: PALETTE.guestHead, hair: PALETTE.hair, accent: PALETTE.accent },
};

/** Body colours for one guest under one scene's light. */
export function bodyTones(p: Palette, brightness: number, tintHex: string, tintAmt: number): BodyTones {
  const base = BASE_TONES[p];
  return {
    body: shade(base.body, brightness, tintHex, tintAmt),
    head: shade(base.head, brightness, tintHex, tintAmt),
    hair: shade(base.hair, brightness * 1.05, tintHex, tintAmt * 0.5),
    accent: shade(base.accent, brightness, tintHex, tintAmt),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function limb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  side: number,
  shoulder: number,
  elbow: number,
  len: number,
  thick: number,
  tone: string,
) {
  const a1 = side * shoulder;
  const x1 = x + Math.sin(a1) * len;
  const y1 = y + Math.cos(a1) * len;
  const a2 = a1 + side * elbow;
  const x2 = x1 + Math.sin(a2) * len;
  const y2 = y1 + Math.cos(a2) * len;
  ctx.strokeStyle = tone;
  ctx.lineWidth = thick;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export interface BillboardOpts {
  sx: number;
  feetY: number;
  headY: number;
  halfW: number;
  tones: BodyTones;
  /** 1 = looking straight at the lens, -1 = the back of a head. */
  facingness: number;
  time: number;
  /** Rim light strength when the subject is backlit. */
  rim?: number;
  detail?: boolean;
}

/**
 * One stylised body, drawn front-on into the viewfinder. The same routine
 * draws the live frame, the thumbnails on the contact sheet, and nothing else.
 */
export function drawGuestBillboard(ctx: CanvasRenderingContext2D, g: FrameGuest, o: BillboardOpts) {
  const H = o.feetY - o.headY;
  if (H < 4) {
    ctx.fillStyle = o.tones.body;
    ctx.fillRect(o.sx - 1, o.headY, 2, Math.max(2, H));
    return;
  }
  const rig = blendRig(g.pose, g.poseAmount);
  const sway = g.pose === 'posed' ? 0 : Math.sin(o.time * 1.1 + g.swayPhase) * 0.008 * (1 - rig.stiff);
  const bounce = rig.bounce * Math.sin(o.time * 9 + g.swayPhase) * H;
  const lean = (rig.leanX + sway) * H;

  const rh = H * (g.kind === 'child' ? 0.115 : 0.097);
  const bodyW = Math.min(o.halfW * 2, H * 0.32);
  const legH = g.seated ? H * 0.26 : H * 0.44;
  const torsoTop = o.headY + rh * 2.05 + rig.headDrop * H;
  const torsoBot = o.feetY - legH;
  const torsoH = Math.max(torsoBot - torsoTop, H * 0.12);

  ctx.save();

  // legs
  ctx.fillStyle = shade(o.tones.body, 0.82);
  if (g.seated) {
    roundRect(ctx, o.sx - bodyW * 0.5, torsoBot - bounce, bodyW, legH, bodyW * 0.3);
  } else {
    const lw = bodyW * 0.34;
    roundRect(ctx, o.sx - bodyW * 0.42, torsoBot - bounce, lw, legH, lw * 0.45);
    roundRect(ctx, o.sx + bodyW * 0.42 - lw, torsoBot - bounce, lw, legH, lw * 0.45);
  }

  // torso: a tapered rounded slab, leaning from the hips
  ctx.fillStyle = o.tones.body;
  ctx.beginPath();
  const tx = o.sx + lean;
  ctx.moveTo(o.sx - bodyW * 0.5, torsoBot - bounce);
  ctx.lineTo(tx - bodyW * 0.42, torsoTop - bounce + torsoH * 0.1);
  ctx.quadraticCurveTo(tx, torsoTop - bounce - torsoH * 0.06, tx + bodyW * 0.42, torsoTop - bounce + torsoH * 0.1);
  ctx.lineTo(o.sx + bodyW * 0.5, torsoBot - bounce);
  ctx.closePath();
  ctx.fill();

  // arms
  const shoulderY = torsoTop - bounce + torsoH * 0.16;
  const armLen = H * 0.19;
  const thick = Math.max(1.2, bodyW * 0.21);
  limb(ctx, tx - bodyW * 0.38, shoulderY, -1, rig.armL[0], rig.armL[1], armLen, thick, o.tones.body);
  limb(ctx, tx + bodyW * 0.38, shoulderY, 1, rig.armR[0], rig.armR[1], armLen, thick, o.tones.body);

  // head
  const hx = o.sx + lean * 1.5 + Math.sin(rig.headTilt) * rh * 0.6;
  const hy = o.headY + rh * 1.05 + rig.headDrop * H - bounce;
  ctx.fillStyle = o.tones.head;
  ctx.beginPath();
  ctx.arc(hx, hy, rh, 0, Math.PI * 2);
  ctx.fill();

  // hair sits on the crown and wraps further round when we see the back
  const back = clamp((-o.facingness + 1) / 2);
  ctx.fillStyle = o.tones.hair;
  ctx.beginPath();
  ctx.arc(hx, hy, rh, Math.PI * (1 + 0.14 - back * 0.62), Math.PI * (2 - 0.14 + back * 0.62));
  ctx.fill();

  if (o.detail !== false && rh > 2.6 && o.facingness > 0.05) {
    const a = clamp(o.facingness * 1.4);
    ctx.fillStyle = withAlpha('#241f19', a * 0.85);
    const ex = rh * 0.36;
    const ey = hy + rh * 0.06;
    const r = Math.max(0.6, rh * 0.11);
    ctx.beginPath();
    ctx.arc(hx - ex, ey, r, 0, Math.PI * 2);
    ctx.arc(hx + ex, ey, r, 0, Math.PI * 2);
    ctx.fill();
    if (g.pose === 'laugh' && g.poseAmount > 0.4) {
      ctx.strokeStyle = withAlpha('#241f19', a * 0.7);
      ctx.lineWidth = Math.max(0.7, rh * 0.09);
      ctx.beginPath();
      ctx.arc(hx, hy + rh * 0.3, rh * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  }

  if (o.rim && o.rim > 0.02) {
    ctx.strokeStyle = withAlpha(PALETTE.glass, clamp(o.rim) * 0.8);
    ctx.lineWidth = Math.max(0.8, H * 0.012);
    ctx.beginPath();
    ctx.arc(hx, hy, rh * 1.02, -Math.PI * 0.95, -Math.PI * 0.15);
    ctx.stroke();
  }

  // the couple carry one accent each so they read instantly at distance
  if (g.palette === 'bride' && rh > 2) {
    ctx.fillStyle = o.tones.accent;
    ctx.beginPath();
    ctx.arc(tx - bodyW * 0.1, torsoTop + torsoH * 0.62 - bounce, bodyW * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (g.palette === 'groom' && rh > 2 && o.facingness > 0) {
    ctx.fillStyle = o.tones.accent;
    ctx.fillRect(tx - bodyW * 0.07, torsoTop + torsoH * 0.14 - bounce, bodyW * 0.14, torsoH * 0.45);
  }

  ctx.restore();
}

export interface TopdownOpts {
  px: number;
  py: number;
  /** Pixels per metre. */
  s: number;
  tones: BodyTones;
  time: number;
  awareness: number;
  posed: boolean;
  telling: number;
}

/** The same body seen from above: shoulders, head, two arm nubs. */
export function drawGuestTop(ctx: CanvasRenderingContext2D, g: FrameGuest, o: TopdownOpts) {
  const r = (g.width / 2) * o.s * 1.15;
  const sway = g.pose === 'posed' ? 0 : Math.sin(o.time * 1.1 + g.swayPhase) * 0.09;
  const f = g.facing + sway;
  ctx.save();
  ctx.translate(o.px, o.py);

  if (o.awareness > 0.04) {
    ctx.strokeStyle = withAlpha(o.posed ? PALETTE.accent : PALETTE.ink, clamp(o.awareness) * 0.75);
    ctx.lineWidth = Math.max(1, r * 0.24);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.65, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.rotate(f);
  // shoulders
  ctx.fillStyle = o.tones.body;
  ctx.strokeStyle = 'rgba(20,17,13,0.45)';
  ctx.lineWidth = Math.max(0.6, r * 0.14);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.82, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // arms
  const rig = blendRig(g.pose, g.poseAmount);
  ctx.fillStyle = shade(o.tones.body, 0.88);
  for (const [side, arm] of [[-1, rig.armL], [1, rig.armR]] as const) {
    const reach = 0.55 + Math.sin(arm[0]) * 0.55;
    ctx.beginPath();
    ctx.arc(r * reach * 0.8, side * r * 0.88, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
  // head, pushed towards the way they face
  ctx.fillStyle = o.tones.head;
  ctx.beginPath();
  ctx.arc(r * 0.3, 0, r * 0.56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = o.tones.hair;
  ctx.beginPath();
  ctx.arc(r * 0.3, 0, r * 0.56, Math.PI * 0.42, Math.PI * 1.58);
  ctx.fill();

  if (o.telling > 0.02) {
    ctx.strokeStyle = withAlpha(PALETTE.ink, o.telling * 0.5);
    ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.4, -0.7, 0.7);
    ctx.stroke();
  }
  ctx.restore();
}
