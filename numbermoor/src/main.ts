import { Hud } from './hud';
import { App } from './app';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = new Hud();
const app = new App(canvas, hud);
(window as unknown as { __nm: unknown }).__nm = { app, hud };
