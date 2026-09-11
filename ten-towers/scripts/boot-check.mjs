// Boots the game headless, plays through a fuse and a smash, fails on console errors.
// Usage: node scripts/boot-check.mjs [url] [shotDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5174/';
const shotDir = process.argv[3] ?? 'shots';
mkdirSync(shotDir, { recursive: true });
const fixedChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  ...(existsSync(fixedChromium) ? { executablePath: fixedChromium } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shotDir}/01-splash.png` });
await page.click('#splash');
await page.waitForTimeout(600);
await page.screenshot({ path: `${shotDir}/02-menu.png` });

// Free build: add 12 gems → one fuse, then smash the rod back.
await page.click('#btn-sandbox');
await page.waitForTimeout(500);
const col = (p) => `.col[data-place="${p}"]`;
const idle = async () => { await page.waitForFunction(() => window.__tt?.scene.isIdle(), null, { timeout: 120000 }); await page.waitForTimeout(300); };
for (let i = 0; i < 12; i++) { await page.click(`${col(0)} .add`, { force: true }); await page.waitForTimeout(120); }
await idle();
let counts = await page.$$eval('.col-count', (els) => els.map((e) => e.textContent));
console.log('after 12 gems:', counts.join(','));
if (counts.join(',') !== '2,1,0,0') errors.push(`fuse failed: ${counts}`);
await page.screenshot({ path: `${shotDir}/03-sandbox-fused.png` });
await page.click(`${col(1)} .smash`, { force: true });
await idle();
counts = await page.$$eval('.col-count', (els) => els.map((e) => e.textContent));
console.log('after smash:', counts.join(','));
if (counts.join(',') !== '12,0,0,0') errors.push(`smash failed: ${counts}`);

// Add a slab + rods + cubes so the camera has to zoom out.
for (let i = 0; i < 3; i++) { await page.click(`${col(3)} .add`, { force: true }); await page.waitForTimeout(150); }
for (let i = 0; i < 4; i++) { await page.click(`${col(2)} .add`, { force: true }); await page.waitForTimeout(150); }
for (let i = 0; i < 6; i++) { await page.click(`${col(1)} .add`, { force: true }); await page.waitForTimeout(150); }
await idle();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shotDir}/04-sandbox-tall.png` });

// Take Away level: play one round via the model, then answer.
await page.click('#btn-home');
await page.waitForTimeout(400);
await page.click('.district:nth-child(3) .tier-btn:nth-child(1)');
await page.waitForTimeout(800);
await page.screenshot({ path: `${shotDir}/05-take-away.png` });

// Play the round: remove what the blueprint says, smashing when a column runs dry.
const dbg = () => page.evaluate(() => window.__tt.game.debug());
let d = await dbg();
console.log('take round:', d.counts.join(','), 'remove', d.remaining.join(','), 'target', d.target);
for (let p = 0; p < 4; p++) {
  while ((await dbg()).remaining[p] > 0) {
    const cur = await dbg();
    if (cur.counts[p] === 0) { await page.click(`${col(p + 1)} .smash`, { force: true }); await idle(); }
    await page.click(`${col(p)} .sub`, { force: true });
    await page.waitForTimeout(80);
  }
}
await idle();
d = await dbg();
console.log('after removing:', d.counts.join(','), 'phase', d.phase);
if (d.phase !== 'answer') errors.push(`expected answer phase, got ${d.phase}`);
await page.screenshot({ path: `${shotDir}/06-numpad.png` });
// A wrong answer first, to see the hint; then the right one.
await page.click('#np-keys button:nth-child(1)'); await page.click('#np-keys button:nth-child(12)');
await page.waitForTimeout(400);
const toast = await page.textContent('#toast');
console.log('hint toast:', toast);
for (const ch of String(d.target)) { await page.click(`#np-keys button:has-text("${ch}")`); }
await page.click('#np-keys button:nth-child(12)');
await page.waitForTimeout(800);
await page.screenshot({ path: `${shotDir}/07-success.png` });
await idle();
await page.waitForTimeout(1500);
d = await dbg();
console.log('next round:', d.round, d.phase);
if (d.round !== 1 || d.phase !== 'play') errors.push(`expected round 2 in play, got round ${d.round} ${d.phase}`);

// Phone-width layout check.
await page.setViewportSize({ width: 400, height: 800 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${shotDir}/08-phone.png` });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (overflow) errors.push('horizontal overflow at phone width');
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(800);

const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0; const start = performance.now();
  const tick = () => { frames++; if (performance.now() - start > 2000) resolve(Math.round(frames / ((performance.now() - start) / 1000))); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
console.log(`FPS (swiftshader): ${fps}`);
console.log(`Console errors: ${errors.length}`);
for (const e of errors.slice(0, 12)) console.log('  ERR:', e.slice(0, 400));
await browser.close();
process.exit(errors.length ? 1 : 0);
