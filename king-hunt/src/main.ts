import { BoardScene } from './board3d/scene';
import { Engine } from './chess/engine';
import { PlaySession } from './game/play';
import { Hud } from './ui/hud';
import { BOTS } from './game/bots';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;

const board = new BoardScene(canvas);
const hud = new Hud(hudRoot, BOTS[0]!.name);
const engine = new Engine(new URL('./engine/stockfish.js', document.baseURI).href);
engine.whenReady().then(
  () => console.log('[king-hunt] engine ready'),
  (e) => console.error('[king-hunt] engine failed', e),
);
new PlaySession(board, hud, engine);
board.start();
