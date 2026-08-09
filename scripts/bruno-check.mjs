// P5 gate: Bruno beatable on Explorer by a cautious button-masher.
// The bot's whole strategy: back off when Bruno glows, waddle in and spin
// otherwise. If a 7-year-old's plan works, the fight is fair.
// Usage: node scripts/bruno-check.mjs [baseUrl] [screenshot.png]
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const base = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/$/, '');
const fixedChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(fixedChromium) ? { executablePath: fixedChromium } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('maxfossils.settings', JSON.stringify({ voiceOn: false, musicVolume: 0, sfxVolume: 0 }));
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${base}/?level=w1_arena_boss&slot=2`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => window.__game?.scene?.combat?.boss, null, { timeout: 30000 });

const state = () => page.evaluate(() => {
  const c = window.__game.scene.combat;
  const b = c.boss;
  const p = window.__game.player;
  return {
    bossAlive: b.alive, bossHp: b.hp, bossState: b.state, phase: b.phase,
    bx: b.pos.x, bz: b.pos.z, px: p.pos.x, pz: p.pos.z,
    hearts: p.hearts, dizzy: p.state === 'dizzy',
    freed: window.__game.session.data.freedChampions.slice(),
    fossil: window.__game.session.hasFossil('w1-f6'),
  };
});

let dizzyCount = 0;
let shotTaken = false;
const start = Date.now();
let s = await state();
console.log(`fight begins: Bruno hp=${s.bossHp}`);
while (Date.now() - start < 240000) {
  s = await state();
  if (!s.bossAlive) break;
  if (s.dizzy) { dizzyCount++; await page.waitForTimeout(2200); continue; }
  const dx = s.bx - s.px, dz = s.bz - s.pz;
  const dist = Math.hypot(dx, dz);
  // the lesson Kenji teaches: back off when he GLOWS (telegraph), punish after
  const danger = s.bossState === 'telegraph';
  await page.evaluate(({ dx, dz, dist, danger }) => {
    const p = window.__game.player;
    const step = danger ? -2.2 : 1.6; // cautious: back away from the glow
    if (dist > 0.4) {
      const nx = p.pos.x + (dx / dist) * Math.min(step, danger ? 2.2 : Math.max(0, dist - 1.4));
      const nz = p.pos.z + (dz / dist) * Math.min(step, danger ? 2.2 : Math.max(0, dist - 1.4));
      // stay inside the arena
      const r = Math.hypot(nx, nz);
      const maxR = 18;
      p.pos.x = r > maxR ? (nx / r) * maxR : nx;
      p.pos.z = r > maxR ? (nz / r) * maxR : nz;
    }
  }, { dx, dz, dist, danger });
  if (!danger && dist < 2.4) await page.keyboard.press('j'); // mash spin
  if (!shotTaken && process.argv[3] && s.bossHp < 9) {
    await page.screenshot({ path: process.argv[3] });
    shotTaken = true;
  }
  await page.waitForTimeout(240);
}

const secs = Math.round((Date.now() - start) / 1000);
s = await state();
// victory dialogue plays out → champion freed → fossil pops → walk onto it
await page.waitForFunction(
  () => window.__game.session.data.freedChampions.includes('bruno'),
  null, { timeout: 30000 },
).catch(() => console.log('  (freed flag never arrived)'));
await page.waitForFunction(
  () => (window.__game.scene['fossilPickups']?.length ?? 0) > 0,
  null, { timeout: 15000 },
).catch(() => console.log('  (fossil never spawned)'));
await page.evaluate(() => {
  const fp = window.__game.scene['fossilPickups']?.find((f) => !f.collected);
  if (fp) window.__game.player.pos.copy(fp.group.position);
});
await page.waitForTimeout(1200);
s = await state();

console.log(`fight over in ${secs}s — bossAlive=${s.bossAlive} phaseReached=${s.phase} playerWipes=${dizzyCount}`);
console.log(`freed champions: [${s.freed.join(', ')}] — fossil w1-f6 held: ${s.fossil}`);
console.log(`console errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log('  ERR:', e.slice(0, 220));
await browser.close();
const ok = !s.bossAlive && s.freed.includes('bruno') && s.fossil && errors.length === 0;
console.log(ok ? 'BRUNO CHECK OK (beatable by a cautious button-masher)' : 'BRUNO CHECK FAILED');
process.exit(ok ? 0 : 1);
