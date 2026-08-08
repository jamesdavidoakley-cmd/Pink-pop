// Dev sanity tool: boots the game headless, measures fps, fails on console errors.
// Usage: node scripts/boot-check.mjs [url] [screenshot.png]
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const fixedChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(
  existsSync(fixedChromium) ? { executablePath: fixedChromium } : {},
);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(String(err)));
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3500);
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - start > 2000) resolve(Math.round(frames / ((performance.now() - start) / 1000)));
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
const shot = process.argv[3];
if (shot) await page.screenshot({ path: shot });
console.log(`FPS: ${fps}`);
console.log(`Console errors: ${errors.length}`);
for (const e of errors.slice(0, 12)) console.log('  ERR:', e.slice(0, 300));
await browser.close();
process.exit(errors.length ? 1 : 0);
