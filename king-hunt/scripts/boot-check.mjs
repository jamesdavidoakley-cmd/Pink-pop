// Boots the game headless into Play mode, plays 1.e4, waits for the bot, screenshots.
// Usage: node scripts/boot-check.mjs http://localhost:5174 [shot.png]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '') + '/?mode=play';
const shot = process.argv[3];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__app && !!window.__app.current, null, { timeout: 20000 });
const fen0 = await page.evaluate(() => window.__app.state().fen);
const fen1 = await page.evaluate(async () => {
  await window.__app.current.humanMove({ from: 'e2', to: 'e4' });
  return window.__app.state().fen;
});
console.log('start:', fen0);
console.log('after 1.e4 + reply:', fen1);
const moved = fen1 !== fen0 && fen1.split(' ')[1] === 'w';
if (shot) await page.screenshot({ path: shot });
await browser.close();
if (errors.length) { console.error('console errors:', errors); process.exit(1); }
if (!moved) { console.error('bot did not reply'); process.exit(1); }
console.log('boot-check OK');
