// All colours live here so the look can be retuned in one place.
export const PALETTE = {
  background: 0x0b1020,
  fog: 0x0b1020,
  tileLight: 0xcfc3a8,
  tileDark: 0x2a3e4c,
  frame: 0x16212e,
  whitePiece: 0xdcd0b6, // sandstone
  blackPiece: 0x262a33, // basalt
  blackPieceEmissive: 0x0b2a3a,
  heatHot: 0xff6a1a, // our pressure
  heatCold: 0x3aa0ff, // their pressure on our king
  legalTarget: 0x4cff9a,
  captureTarget: 0xff4c7a,
  selected: 0xffe066,
  fireLine: 0xff8a2a,
  kingDanger: 0xff3b1a,
} as const;
