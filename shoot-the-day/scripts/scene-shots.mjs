/**
 * Drops the camera on a good vantage point for one must-get beat in each
 * scene and screenshots the frame at its peak. Used to eyeball the art.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4180/';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });

const VANTAGE = [
  { scene: 'ceremony', t: 34.4, at: [7.1, 1.7], look: [7.4, 4.7], crouch: true },
  { scene: 'confetti', t: 27.4, at: [11.8, 11.6], look: [9.05, 8.6], crouch: true },
  { scene: 'speeches', t: 31.4, at: [10.6, 6.6], look: [12.9, 3.1], crouch: true },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /start the day/i }).click();
const canvas = page.locator('canvas');
await canvas.waitFor();
const box = await canvas.boundingBox();

for (const v of VANTAGE) {
  // aim by putting the mouse where the subject is on the plan
  const p = await page.evaluate(([x, y]) => {
    const r = window.__runner;
    const scene = r.sim.scene;
    let mx = 0;
    let my = 0;
    for (const w of scene.walls) {
      mx = Math.max(mx, w.a.x, w.b.x);
      my = Math.max(my, w.a.y, w.b.y);
    }
    const pad = 20;
    const s = Math.min((576 - pad * 2) / mx, (600 - pad * 2) / my);
    return { px: (576 - mx * s) / 2 + x * s, py: (600 - my * s) / 2 + y * s };
  }, v.look);
  await page.mouse.move(box.x + (p.px / 960) * box.width, box.y + (p.py / 600) * box.height);

  await page.evaluate(([t, x, y]) => {
    const r = window.__runner;
    r.sim.t = t;
    r.sim.player.x = x;
    r.sim.player.y = y;
  }, [v.t, v.at[0], v.at[1]]);
  if (v.crouch) await page.keyboard.press('KeyC');
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/scene-${v.scene}.png` });
  await page.mouse.up({ button: 'right' });
  if (v.crouch) await page.keyboard.press('KeyC');

  await page.evaluate(() => {
    window.__runner.sim.t = window.__runner.sim.scene.duration - 0.1;
  });
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
}

await browser.close();
if (errors.length) {
  console.error('console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('ok');
