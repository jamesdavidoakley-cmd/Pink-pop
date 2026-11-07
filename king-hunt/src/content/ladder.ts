import ladderJson from '../../content/ladder.json';

export type Principle = 'Initiative' | 'Tempo' | 'Material is fuel' | 'Open lines' | 'The king cannot run';
export const PRINCIPLES: Principle[] = ['Initiative', 'Tempo', 'Material is fuel', 'Open lines', 'The king cannot run'];

export const PRINCIPLE_WHY: Record<Principle, string> = {
  Initiative: 'Whoever makes the threats chooses what happens next. The defender only reacts.',
  Tempo: 'A move that makes a threat costs them a move. Two free moves and the attack arrives first.',
  'Material is fuel': 'A piece is only worth what it does. Spend it to open the king and the rest of your army is worth double.',
  'Open lines': 'Rooks, bishops and queens need lines. Pawn breaks and sacrifices create them.',
  'The king cannot run': 'The king moves one square. Trap it before it reaches safety and more attackers than defenders ends the game.',
};

export interface Rung {
  id: string;
  title: string;
  idea: string;
  why: string;
  principle: Principle;
  packs: string[];
  bot: string;
}

export interface Ladder {
  version: number;
  unlockAfter: number;
  rungs: Rung[];
}

export const LADDER = ladderJson as Ladder;

export interface Puzzle {
  id: string;
  fen: string;
  moves: string[]; // moves[0] is the opponent's setup move; odd indices are the player's
  rating: number;
  themes: string[];
}

export interface Pack {
  theme: string;
  source: string;
  count: number;
  puzzles: Puzzle[];
}

const packModules = import.meta.glob<Pack>('../../content/puzzles/*.json', { import: 'default' });

export async function loadPack(name: string): Promise<Pack> {
  const key = `../../content/puzzles/${name}.json`;
  const loader = packModules[key];
  if (!loader) throw new Error(`unknown puzzle pack: ${name}`);
  return loader();
}

/** Plain-words idea per Lichess theme, used for the "what is the idea?" question. */
export const THEME_IDEA: Record<string, string> = {
  'mate-in-1': 'One move is checkmate.',
  'mate-in-2': 'Two moves to checkmate: the first forces the second.',
  'mate-in-3': 'A forced march to mate in three.',
  'back-rank': 'The king is stuck behind its own pawns; a check on the back rank is mate.',
  smothered: 'The king is boxed in by its own pieces; a knight check is mate.',
  anastasia: 'A knight and rook trap the king on the edge.',
  arabian: 'A knight and rook mate the king in the corner.',
  hook: 'A rook, a knight and a pawn make a hook around the king.',
  fork: 'One move attacks two things at once.',
  pin: 'A piece cannot move because something bigger is behind it.',
  skewer: 'The big piece in front must move, and the one behind falls.',
  'discovered-attack': 'Moving one piece uncovers an attack from another.',
  'double-check': 'Two checks at once: the king must move.',
  'hanging-piece': 'A piece is left with no defender. Take it.',
  'trapped-piece': 'A piece has nowhere safe to go. Win it.',
  deflection: 'Pull the defender away from its job.',
  attraction: 'Drag the king or a defender onto a bad square.',
  sacrifice: 'Give up material to open the king or win more back.',
  'f7-attack': 'f7 (or f2) is guarded only by the king. Hit it.',
  'kingside-attack': 'Bring more attackers than they have defenders to the kingside.',
  'queenside-attack': 'Bring more attackers than they have defenders to the queenside.',
  'exposed-king': 'The king is out in the open. Chase it.',
  promotion: 'A pawn reaches the end and becomes a queen.',
  'advanced-pawn': 'A far-advanced pawn is about to promote.',
  zwischenzug: 'Make a bigger threat before you recapture.',
  'x-ray': 'A piece attacks through another piece.',
  clearance: 'Move a piece out of the way to open a line.',
  interference: 'Put a piece between the defender and what it guards.',
  'capture-defender': 'Take the piece that was doing the defending.',
};

/** Lichess theme tag → our pack name. */
export const LICHESS_TO_PACK: Record<string, string> = {
  mateIn1: 'mate-in-1', mateIn2: 'mate-in-2', mateIn3: 'mate-in-3', backRankMate: 'back-rank', smotheredMate: 'smothered',
  anastasiaMate: 'anastasia', arabianMate: 'arabian', hookMate: 'hook', bodenMate: 'boden', doubleBishopMate: 'double-bishop',
  fork: 'fork', pin: 'pin', skewer: 'skewer', discoveredAttack: 'discovered-attack', doubleCheck: 'double-check',
  hangingPiece: 'hanging-piece', trappedPiece: 'trapped-piece', deflection: 'deflection', attraction: 'attraction',
  sacrifice: 'sacrifice', attackingF2F7: 'f7-attack', kingsideAttack: 'kingside-attack', queensideAttack: 'queenside-attack',
  exposedKing: 'exposed-king', promotion: 'promotion', advancedPawn: 'advanced-pawn', intermezzo: 'zwischenzug',
  xRayAttack: 'x-ray', clearance: 'clearance', interference: 'interference', capturingDefender: 'capture-defender',
};
