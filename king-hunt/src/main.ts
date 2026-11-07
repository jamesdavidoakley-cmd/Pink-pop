import { BoardScene } from './board3d/scene';
import { Engine } from './chess/engine';
import { App } from './game/app';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;
const screensRoot = document.getElementById('screens') as HTMLElement;

const scene = new BoardScene(canvas);
// Resolve the engine relative to this bundle (dev: /src/main.ts, build: assets/index-*.js) so it works from any host path.
const engine = new Engine(new URL('../engine/stockfish.js', import.meta.url).href);
engine.whenReady().then(
  () => console.log('[king-hunt] engine ready'),
  (e) => console.error('[king-hunt] engine failed', e),
);
const app = new App(scene, hudRoot, screensRoot, engine);
scene.start();

// Dev convenience: ?mode=play | ?rung=<n> | ?recipe=<id> | ?replay=<id> | ?daily boots straight into a mode.
const params = new URLSearchParams(location.search);
if (params.get('mode') === 'play') app.goPlay();
else if (params.has('rung')) void app.goPuzzle(Number(params.get('rung')));
else if (params.has('recipe')) void app.goRecipe(String(params.get('recipe')));
else if (params.has('replay')) void app.goReplay(String(params.get('replay')));
else if (params.has('daily')) void app.daily.run();
else app.goHome();
