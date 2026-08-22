/**
 * Boots the built game, plays a scripted stretch of it, and writes
 * screenshots of the title, both live views, and the contact sheet.
 * Fails loudly on any console error or page exception.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4180/';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  // the sandbox image ships one Chromium; don't make Playwright fetch another
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${out}/01-title.png` });

await page.getByRole('button', { name: /start the day/i }).click();
const canvas = page.locator('canvas');
await canvas.waitFor();
const box = await canvas.boundingBox();

const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

// walk up the left side of the ceremony, crouched, camera up
await page.keyboard.press('KeyC');
await page.mouse.move(at(0.28, 0.2).x, at(0.28, 0.2).y);
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyW');
await page.mouse.move(at(0.33, 0.12).x, at(0.33, 0.12).y);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/02-ceremony.png` });

// take a few frames through the middle of the scene
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1400);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
}
await page.screenshot({ path: `${out}/03-shooting.png` });
await page.mouse.up({ button: 'right' });

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/04-pause.png` });
await page.keyboard.press('Escape');

// skip to the end of the day
for (let scene = 0; scene < 3; scene++) {
  await page.evaluate(() => {
    const w = window;
    if (w.__runner) w.__runner.sim.t = w.__runner.sim.scene.duration - 0.2;
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/05-interstitial-${scene}.png` });
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
}

await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/06-debrief.png`, fullPage: true });

await browser.close();
if (errors.length) {
  console.error('console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('ok — screenshots in', out);
