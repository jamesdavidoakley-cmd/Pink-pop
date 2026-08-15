/**
 * The paintbox. Six colours, used everywhere, no gradients-to-black, no neon.
 * The look is a painted wooden toy on a model railway layout: flat opaque
 * colour, thick confident outlines, a bit of brush grain on top.
 */

export const PALETTE = {
  haulageGreen: '#1F5C3C',
  hiVisOrange: '#FF6A13',
  wetSlate: '#2B3440',
  gritGrey: '#C9C3B6',
  mudOchre: '#8A5A2B',
  ice: '#BFE3EF',
} as const

/** Mixes and tints derived from the six, so nothing strays off-palette. */
export const TONE = {
  ink: '#1B222B',
  inkSoft: '#3D4854',
  card: '#F2EDE2',
  cardEdge: '#D9D0BE',
  paper: '#E8E0CF',
  greenDark: '#143D28',
  greenLight: '#2E7A52',
  orangeDark: '#C24E0C',
  orangeLight: '#FF8C46',
  slateLight: '#3F4B5A',
  slateDark: '#1B222B',
  gritDark: '#A79F8E',
  gritLight: '#E0DACE',
  mudDark: '#5E3D1C',
  mudLight: '#A9743E',
  iceDark: '#8FC4D6',
  iceLight: '#E4F4FA',
  grassDark: '#2B6B41',
  grass: '#3C8A52',
  grassLight: '#57A868',
  sky: '#CBDCE2',
  skyWarm: '#E6DCC6',
  rust: '#9B3D1F',
  cream: '#F7F1E3',
} as const

export const SURFACE_COLOURS = {
  dry_tarmac: { top: '#4A5462', side: '#333C48', speck: '#5E6874' },
  wet_tarmac: { top: '#3B4552', side: '#28303A', speck: '#55616F' },
  gravel: { top: '#B4AC9C', side: '#8E877A', speck: '#DAD3C4' },
  wet_leaves: { top: '#6E5A32', side: '#4E3F22', speck: '#9A7C3E' },
  mud: { top: '#8A5A2B', side: '#5E3D1C', speck: '#A9743E' },
  snow: { top: '#EDF2F4', side: '#C7D2D8', speck: '#FFFFFF' },
  ice: { top: '#BFE3EF', side: '#8FC4D6', speck: '#E4F4FA' },
} as const

/** What a child calls each surface. No adult vocabulary anywhere. */
export const SURFACE_NAME = {
  dry_tarmac: 'Dry road',
  wet_tarmac: 'Wet road',
  gravel: 'Gravel',
  wet_leaves: 'Wet leaves',
  mud: 'Mud',
  snow: 'Snow',
  ice: 'Ice',
} as const

/** One emoji-free icon glyph per surface, drawn by hand in the UI. */
export const SURFACE_STICKY_PIPS = {
  dry_tarmac: 5,
  wet_tarmac: 3,
  gravel: 3,
  wet_leaves: 2,
  mud: 2,
  snow: 1,
  ice: 1,
} as const
