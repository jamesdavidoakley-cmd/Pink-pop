// Dev sanity tool: boots a level headless, simulates input, verifies the
// player actually moves/jumps, and screenshots. Usage:
//   node scripts/drive-check.mjs [url] [screenshot.png]
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/?level=playground';
const fixedChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(fixedChromium) ? { executablePath: fixedChromium } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => window.__game?.player, null, { timeout: 30000 });

const posOf = () => page.evaluate(() => {
  const p = window.__game.player.pos;
  return { x: p.x, y: p.y, z: p.z, grounded: window.__game.player.grounded };
});

const start = await posOf();
// run forward (W) for 1.2s
await page.keyboard.down('w');
await page.waitForTimeout(1200);
await page.keyboard.up('w');
const afterRun = await posOf();

// jump + double jump
await page.keyboard.press('Space');
await page.waitForTimeout(180);
const midJump = await posOf();
await page.keyboard.press('Space');
await page.waitForTimeout(250);
const midDouble = await posOf();
await page.waitForTimeout(1200);
const landed = await posOf();

// spin
await page.keyboard.press('j');
await page.waitForTimeout(300);

const dist = Math.hypot(afterRun.x - start.x, afterRun.z - start.z);
console.log(`moved: ${dist.toFixed(2)}m  (start ${start.x.toFixed(1)},${start.z.toFixed(1)} → ${afterRun.x.toFixed(1)},${afterRun.z.toFixed(1)})`);
console.log(`jump: y ${midJump.y.toFixed(2)} → double ${midDouble.y.toFixed(2)} → landed grounded=${landed.grounded} y=${landed.y.toFixed(2)}`);
console.log(`console errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ERR:', e.slice(0, 250));

const shot = process.argv[3];
if (shot) await page.screenshot({ path: shot });
await browser.close();

const ok = dist > 3 && midJump.y > start.y + 0.3 && landed.grounded && errors.length === 0;
console.log(ok ? 'DRIVE OK' : 'DRIVE FAILED');
process.exit(ok ? 0 : 1);
