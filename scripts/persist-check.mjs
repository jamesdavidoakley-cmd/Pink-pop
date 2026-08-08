// P3 gate: new game → collect the hub platforming fossil → reload → persists.
// Usage: node scripts/persist-check.mjs [baseUrl]
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const fixedChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(fixedChromium) ? { executablePath: fixedChromium } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// 1. fresh boot → title → slot 1
await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('.menu-btn', { timeout: 30000 });
await page.click('.menu-btn');
await page.waitForFunction(() => window.__game?.player, null, { timeout: 30000 });

// 2. intro cutscene: skip through by mashing interact
for (let i = 0; i < 40; i++) {
  const active = await page.evaluate(() => window.__game.dialogue.cutsceneActive);
  if (!active && i > 4) break;
  await page.keyboard.press('e');
  await page.waitForTimeout(220);
}

// 3. teleport up to the monument-top fossil, let proximity pickup fire
await page.evaluate(() => { window.__game.player.pos.set(0, 10.2, 0); });
await page.waitForTimeout(1200);
const afterCollect = await page.evaluate(() => ({
  fossils: window.__game.session.fossilCount,
  has: window.__game.session.hasFossil('hub-f1'),
}));
console.log(`collected: fossils=${afterCollect.fossils} hasHubF1=${afterCollect.has}`);

// 4. reload → continue same slot → everything persists
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForSelector('.menu-btn', { timeout: 30000 });
const slotLabel = await page.evaluate(() => document.querySelector('.menu-btn')?.textContent ?? '');
await page.click('.menu-btn');
await page.waitForFunction(() => window.__game?.player, null, { timeout: 30000 });
await page.waitForTimeout(800);
const afterReload = await page.evaluate(() => ({
  fossils: window.__game.session.fossilCount,
  has: window.__game.session.hasFossil('hub-f1'),
  level: window.__game.scene.def.id,
  introSeen: window.__game.session.data.voice.seenScenes.includes('intro'),
  voiceMemoryKeys: Object.keys(window.__game.session.data.voice.used).length,
}));
console.log(`reloaded: fossils=${afterReload.fossils} hasHubF1=${afterReload.has} level=${afterReload.level} introSeen=${afterReload.introSeen} voiceMem=${afterReload.voiceMemoryKeys}`);
console.log(`slot label after reload: ${slotLabel.trim()}`);
console.log(`console errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log('  ERR:', e.slice(0, 220));
await browser.close();

const ok = afterCollect.has && afterReload.has && afterReload.fossils === afterCollect.fossils
  && afterReload.level === 'hub' && afterReload.introSeen && errors.length === 0;
console.log(ok ? 'PERSISTENCE OK' : 'PERSISTENCE FAILED');
process.exit(ok ? 0 : 1);
