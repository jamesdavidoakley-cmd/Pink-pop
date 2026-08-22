import type { Guest, GuestKind, MomentDef, Palette, SceneDef, Furniture } from './types';

type V = { x: number; y: number };

/** The venue. One room, three arrangements. */
const ROOM = { x0: 0, y0: 0, x1: 18, y1: 14 };
const WALL_H = 4.2;

const SIZES: Record<GuestKind, { stand: number; sit: number; width: number }> = {
  guest: { stand: 1.72, sit: 1.28, width: 0.52 },
  child: { stand: 1.14, sit: 0.92, width: 0.38 },
  bride: { stand: 1.68, sit: 1.26, width: 0.56 },
  groom: { stand: 1.78, sit: 1.32, width: 0.56 },
  officiant: { stand: 1.74, sit: 1.3, width: 0.54 },
  speaker: { stand: 1.76, sit: 1.3, width: 0.54 },
};

let swaySeed = 1;
function guest(
  id: string,
  x: number,
  y: number,
  facing: number,
  kind: GuestKind = 'guest',
  seated = false,
  palette?: Palette,
): Guest {
  const s = SIZES[kind];
  swaySeed = (swaySeed * 1103515245 + 12345) % 2147483648;
  const r = swaySeed / 2147483648;
  return {
    id,
    kind,
    palette: palette ?? (kind === 'guest' ? 'guest' : (kind as Palette)),
    x,
    y,
    homeX: x,
    homeY: y,
    facing,
    baseFacing: facing,
    height: seated ? s.sit : s.stand,
    seated,
    width: s.width,
    awareness: 0,
    posed: false,
    swayPhase: r * Math.PI * 2,
    swaySpeed: 0.8 + r * 0.5,
    pose: seated ? 'seated' : 'idle',
    poseAmount: seated ? 1 : 0,
    walkTo: null,
    walkSpeed: 1,
    facingTo: null,
  };
}

const chair = (x: number, y: number, facing: number): Furniture => ({
  shape: 'chair',
  x,
  y,
  w: 0.5,
  d: 0.5,
  height: 0.92,
  facing,
});

const outerWalls = () => [
  { a: { x: ROOM.x0, y: ROOM.y0 }, b: { x: ROOM.x1, y: ROOM.y0 }, height: WALL_H },
  { a: { x: ROOM.x1, y: ROOM.y0 }, b: { x: ROOM.x1, y: ROOM.y1 }, height: WALL_H },
  { a: { x: ROOM.x1, y: ROOM.y1 }, b: { x: ROOM.x0, y: ROOM.y1 }, height: WALL_H },
  { a: { x: ROOM.x0, y: ROOM.y1 }, b: { x: ROOM.x0, y: ROOM.y0 }, height: WALL_H },
];

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;

/* ------------------------------------------------------------------ *
 * SCENE 1 — CEREMONY
 * Window light from stage left (the east wall). The aisle is theirs,
 * not yours: stand in it and the whole room looks at you.
 * ------------------------------------------------------------------ */
function ceremony(): SceneDef {
  const guests: Guest[] = [];
  const furniture: Furniture[] = [];
  const rows = [4.7, 6.0, 7.3, 8.6];
  for (let r = 0; r < rows.length; r++) {
    for (let s = 0; s < 4; s++) {
      const y = rows[r]!;
      const lx = 7.4 - s * 1.05;
      const rx = 10.6 + s * 1.05;
      const kindL: GuestKind = r === 1 && s === 2 ? 'child' : 'guest';
      const kindR: GuestKind = r === 2 && s === 1 ? 'child' : 'guest';
      guests.push(guest(`L${r}${s}`, lx, y, UP, kindL, true));
      guests.push(guest(`R${r}${s}`, rx, y, UP, kindR, true));
      furniture.push(chair(lx, y + 0.18, UP), chair(rx, y + 0.18, UP));
    }
  }
  guests.push(guest('officiant', 9, 1.9, DOWN, 'officiant'));
  guests.push(guest('bride', 8.3, 3.0, 0, 'bride'));
  guests.push(guest('groom', 9.7, 3.0, Math.PI, 'groom'));

  const moments: MomentDef[] = [
    { id: 'c-whisper', label: 'A whispered aside, back row', at: 6, subjects: ['L20'], tellPose: 'shoulderTurn', peakPose: 'lean' },
    { id: 'c-tear', label: 'An early tear, third row', at: 13, subjects: ['R01'], tellPose: 'shoulderTurn', peakPose: 'wipeEye' },
    { id: 'c-bored', label: 'A bored child slides off the chair', at: 21, subjects: ['R21'], tellPose: 'lean', peakPose: 'headDown' },
    { id: 'c-laugh-early', label: 'A laugh at the vows', at: 30.5, subjects: ['R00'], tellPose: 'shoulderTurn', peakPose: 'laugh' },
    {
      id: 'c-reaction',
      label: 'The mother of the bride, during the vows',
      at: 31,
      subjects: ['L00'],
      mustGet: true,
      tellPose: 'shoulderTurn',
      peakPose: 'wipeEye',
    },
    { id: 'c-gesture', label: 'The officiant opens his hands', at: 41, subjects: ['officiant'], tellPose: 'lean', peakPose: 'point' },
    { id: 'c-phone', label: 'A phone goes up in row two', at: 49, subjects: ['L10'], tellPose: 'shoulderTurn', peakPose: 'armRaise' },
    {
      id: 'c-rings',
      label: 'The ring exchange',
      at: 50.5,
      subjects: ['bride', 'groom'],
      mustGet: true,
      tellPose: 'reach',
      peakPose: 'ring',
    },
    { id: 'c-clapgran', label: 'Grandmother claps too early', at: 61, subjects: ['R20'], tellPose: 'lean', peakPose: 'clap' },
    {
      id: 'c-childrun',
      label: 'A child breaks for the front',
      at: 68,
      subjects: ['L12'],
      tellPose: 'shoulderTurn',
      peakPose: 'reach',
      moves: [{ id: 'L12', to: { x: 7.7, y: 4.2 }, speed: 1.2, face: UP }],
      after: [{ id: 'L12', to: { x: 5.3, y: 6.0 }, speed: 1.0, face: UP }],
    },
    { id: 'c-clapfront', label: 'The front row starts clapping', at: 77, subjects: ['L01'], tellPose: 'lean', peakPose: 'clap' },
    { id: 'c-kiss', label: 'The kiss', at: 78, subjects: ['bride', 'groom'], mustGet: true, tellPose: 'lean', peakPose: 'kiss' },
    { id: 'c-cheer', label: 'A cheer from the back', at: 88, subjects: ['R30'], tellPose: 'shoulderTurn', peakPose: 'laugh' },
    { id: 'c-hug', label: 'Two friends hug in their seats', at: 93, subjects: ['L11'], tellPose: 'lean', peakPose: 'reach' },
  ];

  return {
    id: 'ceremony',
    title: 'Ceremony',
    subtitle: '100 seconds. 24 frames. Strong window light from stage left.',
    duration: 100,
    frames: 24,
    ambient: 0.92,
    floor: '#c9bda6',
    wall: '#e2d7c2',
    lightDir: { x: -1, y: 0 },
    lightPoint: null,
    walls: outerWalls(),
    windows: [
      { a: { x: 18, y: 2.2 }, b: { x: 18, y: 5.6 }, h0: 0.9, h1: 3.1, strength: 1 },
      { a: { x: 18, y: 6.6 }, b: { x: 18, y: 10 }, h0: 0.9, h1: 3.1, strength: 1 },
    ],
    furniture: [
      { shape: 'altar', x: 9, y: 1.4, w: 2.2, d: 0.7, height: 1.05 },
      { shape: 'arch', x: 9, y: 1.0, w: 3.6, d: 0.3, height: 3.2 },
      ...furniture,
    ],
    guests,
    moments,
    forbidden: [
      {
        poly: [
          { x: 8.05, y: 3.4 },
          { x: 9.95, y: 3.4 },
          { x: 9.95, y: 13.4 },
          { x: 8.05, y: 13.4 },
        ],
        label: 'aisle',
        rebuke: 'You stood in the aisle. Fifty people watched you instead of the wedding.',
      },
    ],
    bounds: { x0: 0.6, y0: 0.9, x1: 17.4, y1: 13.4 },
    start: { x: 6.0, y: 11.4, heading: -1.25 },
    tutorial: [
      { at: 1.5, text: 'Hold RIGHT MOUSE to raise the camera. LEFT MOUSE fires the shutter.' },
      { at: 7.5, text: 'Tells show in the plan. Only the viewfinder tells you what they are.' },
      { at: 13.5, text: 'C to crouch, SHIFT to walk quietly. Get too close and the moment dies.' },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * SCENE 2 — CONFETTI
 * Open backlight behind the couple's exit path. Get in front of them
 * and shoot into it, or go home with grey faces.
 * ------------------------------------------------------------------ */
function confetti(): SceneDef {
  const guests: Guest[] = [];
  const ys = [3.4, 4.7, 6.0, 7.3, 8.6, 9.9, 11.2];
  ys.forEach((y, i) => {
    const kindL: GuestKind = i === 3 ? 'child' : 'guest';
    const kindR: GuestKind = i === 5 ? 'child' : 'guest';
    guests.push(guest(`W${i}`, 7.05 - (i % 2) * 0.35, y, 0, kindL));
    guests.push(guest(`E${i}`, 10.95 + (i % 2) * 0.35, y, Math.PI, kindR));
  });
  guests.push(guest('W7', 6.4, 5.4, 0.4));
  guests.push(guest('E7', 11.7, 8.2, Math.PI - 0.4));
  guests.push(guest('bride', 8.5, 2.7, DOWN, 'bride'));
  guests.push(guest('groom', 9.6, 2.7, DOWN, 'groom'));

  const moments: MomentDef[] = [
    { id: 'f-cone', label: 'A confetti cone goes up', at: 5, subjects: ['E1'], tellPose: 'shoulderTurn', peakPose: 'armRaise' },
    { id: 'f-laugh1', label: 'Two friends laughing on the line', at: 11, subjects: ['W2'], tellPose: 'lean', peakPose: 'laugh' },
    {
      id: 'f-walk1',
      label: 'The couple step out',
      at: 14,
      subjects: ['bride', 'groom'],
      tellPose: 'lean',
      peakPose: 'reach',
      moves: [
        { id: 'bride', to: { x: 8.5, y: 6.2 }, speed: 0.4 },
        { id: 'groom', to: { x: 9.6, y: 6.2 }, speed: 0.4 },
      ],
    },
    { id: 'f-point', label: 'A child points at the confetti', at: 19, subjects: ['E5'], tellPose: 'shoulderTurn', peakPose: 'point' },
    { id: 'f-throw-near', label: 'A guest throws a fistful', at: 23.5, subjects: ['W4'], tellPose: 'reach', peakPose: 'throw' },
    {
      id: 'f-peak',
      label: 'The couple, mid-confetti',
      at: 24,
      subjects: ['bride', 'groom'],
      mustGet: true,
      tellPose: 'reach',
      peakPose: 'laugh',
      moves: [
        { id: 'bride', to: { x: 8.5, y: 8.6 }, speed: 0.32 },
        { id: 'groom', to: { x: 9.6, y: 8.6 }, speed: 0.32 },
      ],
    },
    { id: 'f-hair', label: 'Confetti in the bride’s hair', at: 30, subjects: ['bride'], tellPose: 'lean', peakPose: 'wipeEye' },
    { id: 'f-cheer', label: 'A cheer from the far side', at: 34.5, subjects: ['E6'], tellPose: 'shoulderTurn', peakPose: 'toast' },
    {
      id: 'f-child',
      label: 'A child in the confetti',
      at: 36,
      subjects: ['W3'],
      mustGet: true,
      tellPose: 'shoulderTurn',
      peakPose: 'throw',
      moves: [{ id: 'W3', to: { x: 7.7, y: 7.9 }, speed: 1.5, face: 0.9 }],
      after: [{ id: 'W3', to: { x: 7.05, y: 7.3 }, speed: 1.1, face: 0 }],
    },
    { id: 'f-hug', label: 'A hug on the line', at: 42, subjects: ['E3'], tellPose: 'lean', peakPose: 'reach' },
    {
      id: 'f-wide',
      label: 'The whole line, going up',
      at: 45,
      subjects: ['W5', 'E4', 'W6', 'E2'],
      mustGet: true,
      wide: true,
      tellPose: 'reach',
      peakPose: 'throw',
      moves: [
        { id: 'bride', to: { x: 8.5, y: 11.4 }, speed: 0.3 },
        { id: 'groom', to: { x: 9.6, y: 11.4 }, speed: 0.3 },
      ],
    },
    { id: 'f-kiss', label: 'A kiss at the end of the line', at: 51, subjects: ['bride', 'groom'], tellPose: 'lean', peakPose: 'kiss' },
    { id: 'f-wave', label: 'A grandmother waves them off', at: 55, subjects: ['W1'], tellPose: 'shoulderTurn', peakPose: 'armRaise' },
  ];

  return {
    id: 'confetti',
    title: 'Confetti',
    subtitle: '60 seconds. 18 frames. Open backlight behind the couple.',
    duration: 60,
    frames: 18,
    ambient: 1,
    floor: '#cfc4ac',
    wall: '#d9d3c6',
    lightDir: { x: 0, y: 1 },
    lightPoint: null,
    walls: outerWalls(),
    windows: [
      { a: { x: 1.5, y: 0 }, b: { x: 7.4, y: 0 }, h0: 0.2, h1: 3.6, strength: 1.25 },
      { a: { x: 10.6, y: 0 }, b: { x: 16.5, y: 0 }, h0: 0.2, h1: 3.6, strength: 1.25 },
    ],
    furniture: [
      { shape: 'arch', x: 9, y: 0.6, w: 3.2, d: 0.4, height: 3.4 },
      { shape: 'table', x: 15.2, y: 4.4, w: 1.6, d: 0.8, height: 0.95 },
    ],
    guests,
    moments,
    forbidden: [
      {
        poly: [
          { x: 8.0, y: 2.2 },
          { x: 10.1, y: 2.2 },
          { x: 10.1, y: 12.6 },
          { x: 8.0, y: 12.6 },
        ],
        label: 'their path',
        rebuke: 'You walked their exit path. They were watching you, not each other.',
      },
    ],
    bounds: { x0: 0.8, y0: 1.2, x1: 17.2, y1: 13.2 },
    start: { x: 12.6, y: 9.2, heading: -2.2 },
    confetti: { from: 20, to: 50, at: { x: 9.05, y: 8.4 }, spread: 2.4 },
  };
}

/* ------------------------------------------------------------------ *
 * SCENE 3 — SPEECHES
 * Dim room, one practical lamp. The light is a place, not a setting.
 * ------------------------------------------------------------------ */
function speeches(): SceneDef {
  const guests: Guest[] = [];
  const furniture: Furniture[] = [
    { shape: 'table', x: 9, y: 2.5, w: 7.4, d: 1.0, height: 0.78 },
    { shape: 'lamp', x: 15.1, y: 3.2, w: 0.4, d: 0.4, height: 1.65 },
  ];

  const top = [
    guest('bride', 8.3, 1.9, DOWN, 'bride', true),
    guest('groom', 9.6, 1.9, DOWN, 'groom', true),
    guest('T0', 6.4, 1.9, DOWN, 'guest', true),
    guest('T1', 7.3, 1.9, DOWN, 'guest', true),
    guest('T2', 10.7, 1.9, DOWN, 'guest', true),
    guest('T3', 11.6, 1.9, DOWN, 'guest', true),
  ];
  guests.push(...top);
  guests.push(guest('bestman', 12.9, 3.1, 2.3, 'speaker'));

  const tables: V[] = [
    { x: 4.6, y: 6.8 },
    { x: 9.6, y: 7.4 },
    { x: 14.0, y: 6.6 },
    { x: 6.6, y: 11.0 },
    { x: 12.4, y: 11.2 },
  ];
  tables.forEach((c, ti) => {
    furniture.push({ shape: 'roundTable', x: c.x, y: c.y, w: 1.9, d: 1.9, height: 0.76 });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.6 + ti;
      const gx = c.x + Math.cos(a) * 1.5;
      const gy = c.y + Math.sin(a) * 1.5;
      const facing = Math.atan2(2.6 - gy, 10.5 - gx);
      const kind: GuestKind = ti === 3 && i === 2 ? 'child' : 'guest';
      guests.push(guest(`T${ti}_${i}`, gx, gy, facing, kind, true));
      furniture.push(chair(gx - Math.cos(facing) * 0.24, gy - Math.sin(facing) * 0.24, facing));
    }
  });

  const moments: MomentDef[] = [
    { id: 's-glass', label: 'A glass is tapped for quiet', at: 5, subjects: ['T0_1'], tellPose: 'reach', peakPose: 'toast' },
    { id: 's-nerves', label: 'The best man finds his notes', at: 12, subjects: ['bestman'], tellPose: 'lean', peakPose: 'headDown' },
    { id: 's-groomlaugh', label: 'The groom laughs at himself', at: 19, subjects: ['groom'], tellPose: 'lean', peakPose: 'laugh' },
    { id: 's-kid', label: 'A child asleep at table four', at: 24, subjects: ['T3_2'], tellPose: 'lean', peakPose: 'headDown' },
    {
      id: 's-bestman',
      label: 'The best man mid-delivery',
      at: 28,
      subjects: ['bestman'],
      mustGet: true,
      tellPose: 'shoulderTurn',
      peakPose: 'point',
    },
    { id: 's-table1', label: 'Table one gets the joke', at: 29, subjects: ['T0_3'], tellPose: 'lean', peakPose: 'laugh' },
    { id: 's-wipe', label: 'The mother of the bride, again', at: 38, subjects: ['T1'], tellPose: 'shoulderTurn', peakPose: 'wipeEye' },
    { id: 's-toast1', label: 'A toast from the far table', at: 46, subjects: ['T2_0'], tellPose: 'reach', peakPose: 'toast' },
    {
      id: 's-couple',
      label: 'The couple laughing together',
      at: 56,
      subjects: ['bride', 'groom'],
      mustGet: true,
      tellPose: 'lean',
      peakPose: 'laugh',
    },
    { id: 's-clap', label: 'A ripple of applause', at: 57, subjects: ['T4_1'], tellPose: 'lean', peakPose: 'clap' },
    { id: 's-point', label: 'The best man points at the groom', at: 66, subjects: ['bestman'], tellPose: 'lean', peakPose: 'point' },
    {
      id: 's-table',
      label: 'Table two goes up together',
      at: 78,
      subjects: ['T1_0', 'T1_1', 'T1_2'],
      mustGet: true,
      tellPose: 'lean',
      peakPose: 'laugh',
    },
    { id: 's-toast2', label: 'The room raises a glass', at: 88, subjects: ['T4_3'], tellPose: 'reach', peakPose: 'toast' },
    { id: 's-quiet', label: 'A quiet word at the top table', at: 94, subjects: ['bride'], tellPose: 'shoulderTurn', peakPose: 'lean' },
  ];

  return {
    id: 'speeches',
    title: 'Speeches',
    subtitle: '100 seconds. 24 frames. Dim room, one lamp.',
    duration: 100,
    frames: 24,
    ambient: 0.42,
    floor: '#6b6152',
    wall: '#5d5547',
    lightDir: null,
    lightPoint: { x: 15.1, y: 3.2 },
    walls: outerWalls(),
    windows: [],
    furniture,
    guests,
    moments,
    forbidden: [
      {
        poly: [
          { x: 5.2, y: 3.2 },
          { x: 12.6, y: 3.2 },
          { x: 12.6, y: 5.2 },
          { x: 5.2, y: 5.2 },
        ],
        label: 'in front of the top table',
        rebuke: 'You planted yourself in front of the top table. Every guest was looking at your back.',
      },
    ],
    bounds: { x0: 0.8, y0: 1.2, x1: 17.2, y1: 13.2 },
    start: { x: 5.4, y: 9.6, heading: -1.1 },
  };
}

export function buildScenes(): SceneDef[] {
  swaySeed = 1;
  return [ceremony(), confetti(), speeches()];
}

export const SCENE_ORDER: SceneDef['id'][] = ['ceremony', 'confetti', 'speeches'];
