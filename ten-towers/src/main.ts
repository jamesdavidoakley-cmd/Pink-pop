import { TowerScene } from './scene';
import { Hud } from './hud';
import { Game } from './game';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const scene = new TowerScene(canvas);
const hud = new Hud();
const game = new Game(scene, hud);

// Dev hook for headless checks.
(window as unknown as { __tt: unknown }).__tt = { scene, hud, game };
