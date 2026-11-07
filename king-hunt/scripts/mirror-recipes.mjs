// Generates Black-side versions of chosen recipes by mirroring colours.
// The pattern is identical; the squares are flipped. Output is appended to content/recipes.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Chess } = createRequire(import.meta.url)('chess.js');

const path = new URL('../content/recipes.json', import.meta.url);
const data = JSON.parse(readFileSync(path, 'utf8'));
const MIRROR = { 'greek-gift': 'The Greek gift, as Black', 'h-pawn-ram': 'The battering ram, as Black', 'f-file-lever': 'The f-pawn lever, as Black' };

const flipSq = (s) => s.replace(/([a-h])([1-8])/g, (_, f, r) => f + (9 - Number(r)));
const swapCase = (s) => s.replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
function mirrorFen(fen) {
  const [board, turn, castle, ep, half, full] = fen.split(' ');
  const rows = board.split('/').reverse().map(swapCase).join('/');
  return [rows, turn === 'w' ? 'b' : 'w', castle === '-' ? '-' : swapCase(castle), ep === '-' ? '-' : flipSq(ep), half, full].join(' ');
}
const mirrorText = (t) =>
  flipSq(t)
    .replace(/\bWhite\b/g, '§W').replace(/\bBlack\b/g, 'White').replace(/§W/g, 'Black')
    .replace(/\bwhite\b/g, '§w').replace(/\bblack\b/g, 'white').replace(/§w/g, 'black');

const out = data.recipes.filter((r) => !r.id.endsWith('-black'));
for (const r of data.recipes) {
  const title = MIRROR[r.id];
  if (!title) continue;
  // Position at the lesson start, then mirror it and the remaining moves.
  const c = new Chess(r.fen);
  for (let i = 0; i < r.start; i++) c.move(r.moves[i]);
  const fen = mirrorFen(c.fen());
  const m = new Chess(fen);
  const moves = [];
  for (let i = r.start; i < r.moves.length; i++) {
    const mv = m.move(flipSq(r.moves[i]));
    if (!mv) throw new Error(`${r.id}: mirrored move ${r.moves[i]} illegal`);
    moves.push(mv.san);
  }
  const steps = {};
  for (const [k, v] of Object.entries(r.steps)) {
    const ply = Number(k) - r.start;
    if (ply < 0) continue;
    const s = { prompt: mirrorText(v.prompt), why: mirrorText(v.why) };
    if (v.bait) s.bait = { ...v.bait, get: v.bait.get.map(mirrorText), decoys: v.bait.decoys.map(mirrorText), count: v.bait.count ? mirrorText(v.bait.count) : undefined, payoffPly: v.bait.payoffPly !== undefined ? v.bait.payoffPly - r.start : undefined };
    steps[String(ply)] = s;
  }
  out.push({
    id: `${r.id}-black`, title, rung: r.rung, principle: r.principle, side: 'b',
    goal: mirrorText(r.goal),
    howWeGotHere: 'Mirror image: the same plan with the colours swapped, so you learn to see it from both sides. ' + mirrorText(r.howWeGotHere),
    fen, moves, start: 0, steps, payoff: mirrorText(r.payoff),
  });
  console.log(`mirrored ${r.id} → ${r.id}-black (${moves.length} plies)`);
}
data.recipes = out;
writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
