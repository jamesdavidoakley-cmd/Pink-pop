// Boots the game headless, waits for the engine, plays one move, screenshots.
// Usage: node scripts/boot-check.mjs http://localhost:5174 [shot.png]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] ?? 'http://localhost:5174';
const shot = process.argv[3];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
// Wait for the engine to say hello.
await page.waitForFunction(() => performance.now() > 1500);
const fen0 = await page.evaluate(() => window.__game.state().fen);
// Play 1.e4 through the public rules path by simulating a legal human move.
const fen1 = await page.evaluate(async () => {
  const g = window.__game;
  await g['humanMove']('e2', 'e4');
  return g.state().fen;
});
console.log('start:', fen0);
console.log('after 1.e4 + reply:', fen1);
const moved = fen1 !== fen0 && !fen1.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b');
if (shot) await page.screenshot({ path: shot });
await browser.close();
if (errors.length) { console.error('console errors:', errors); process.exit(1); }
if (!moved) { console.error('bot did not reply'); process.exit(1); }
console.log('boot-check OK');
