import { loadContent } from './engine/loader';
import { validateContentDev } from './engine/validate-dev';
import { Game } from './game/game';

const container = document.getElementById('app')!;
void validateContentDev();
const content = loadContent();
const game = new Game(container, content);
game.start();
