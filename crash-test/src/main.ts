import { Renderer } from './render';
import { Hud } from './hud';
import { Game } from './game';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const hud = new Hud();
const game = new Game(renderer, hud);

(window as unknown as { __ct: unknown }).__ct = { renderer, hud, game };
