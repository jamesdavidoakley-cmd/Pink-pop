// P6 (W2) gate: Baroness Cogwheel — education inside the boss fight.
// Proves: shield deflects all damage → solving the 3-cog gear puzzle at the
// arena edge drops it → she's beatable → freed to the café with Bruno.
// Usage: node scripts/cogwheel-check.mjs [baseUrl] [screenshot.png]
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
const fail = (m) => { console.log(`FAILED: ${m}`); };

await page.goto(`${base}/?level=w2_arena_boss&slot=2`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => window.__game?.scene?.combat?.boss, null, { timeout: 30000 });

// 1. shield deflects: spin at her, hp must not move
let s = await page.evaluate(() => {
  const b = window.__game.scene.combat.boss;
  window.__game.player.pos.set(b.pos.x + 1.2, b.pos.y, b.pos.z);
  return { shielded: b.shielded, hp: b.hp };
});
console.log(`opening: shielded=${s.shielded} hp=${s.hp}`);
if (!s.shielded) fail('boss should start shielded');
for (let i = 0; i < 4; i++) { await page.keyboard.press('j'); await page.waitForTimeout(650); }
s = await page.evaluate(() => ({ hp: window.__game.scene.combat.boss.hp, shielded: window.__game.scene.combat.boss.shielded }));
console.log(`after 4 spins: hp=${s.hp} shielded=${s.shielded} (steel does nothing — as designed)`);
if (s.hp !== 14) fail('shielded boss took damage');

// 2. solve the cog puzzle at the arena edge
const taskPos = await page.evaluate(() => {
  const t = window.__game.scene.def.tasks.find((x) => x.ref === 'w2-cogpuzzle');
  return { pos: t.pos, yaw: t.yaw ?? 0 };
});
await page.evaluate(({ pos }) => { window.__game.player.pos.set(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5); }, taskPos);
await page.waitForTimeout(600);
await page.keyboard.press('e'); // start the task
await page.waitForFunction(() => window.__game.scene.runner.isActive, null, { timeout: 15000 });
await page.waitForTimeout(2500); // intro line (voiceless timing)

// slot geometry mirrors buildit layout: origin + fwd*3.6 + side*(i-mid)*3.0
const slotWorld = (i, n) => {
  const yaw = taskPos.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const sx = fz, sz = -fx;
  return [
    taskPos.pos[0] + fx * 3.6 + sx * (i - (n - 1) / 2) * 3.0,
    taskPos.pos[1] + 0.5,
    taskPos.pos[2] + fz * 3.6 + sz * (i - (n - 1) / 2) * 3.0,
  ];
};
// output slot (index 1 of 2): cycle 8→12→24 teeth
const out = slotWorld(1, 2);
await page.evaluate((p) => { window.__game.player.pos.set(p[0], p[1], p[2]); }, out);
await page.waitForTimeout(500);
await page.keyboard.press('e');
await page.waitForTimeout(400);
await page.keyboard.press('e');
await page.waitForTimeout(400);
// stomp TEST (origin + fwd*0.8)
const test = [
  taskPos.pos[0] + Math.sin(taskPos.yaw) * 0.8, taskPos.pos[1] + 0.5,
  taskPos.pos[2] + Math.cos(taskPos.yaw) * 0.8,
];
await page.evaluate((p) => { window.__game.player.pos.set(p[0], p[1], p[2]); window.__game.player.vel.set(0, -1, 0); }, test);
await page.waitForFunction(() => !window.__game.scene.combat.boss.shielded, null, { timeout: 30000 })
  .catch(() => fail('shield never dropped after solving the puzzle'));
s = await page.evaluate(() => ({ shielded: window.__game.scene.combat.boss.shielded, state: window.__game.scene.combat.boss.state }));
console.log(`puzzle solved → shielded=${s.shielded} bossState=${s.state} (generator down, she staggers)`);

// wait out the completion dialogue so the arena is live again
await page.waitForFunction(() => !window.__game.scene.runner.isActive, null, { timeout: 30000 }).catch(() => {});

// 3. now fight her like Bruno: retreat on glow, spin otherwise
const start = Date.now();
let wipes = 0;
let shot = false;
while (Date.now() - start < 240000) {
  const st = await page.evaluate(() => {
    const b = window.__game.scene.combat.boss;
    const p = window.__game.player;
    return { alive: b.alive, hp: b.hp, bs: b.state, bx: b.pos.x, bz: b.pos.z, px: p.pos.x, pz: p.pos.z, dizzy: p.state === 'dizzy' };
  });
  if (!st.alive) break;
  if (st.dizzy) { wipes++; await page.waitForTimeout(2200); continue; }
  const dx = st.bx - st.px, dz = st.bz - st.pz;
  const dist = Math.hypot(dx, dz);
  const danger = st.bs === 'telegraph';
  await page.evaluate(({ dx, dz, dist, danger }) => {
    const p = window.__game.player;
    if (dist > 0.4) {
      const step = danger ? -2.2 : Math.min(1.6, Math.max(0, dist - 1.4));
      const nx = p.pos.x + (dx / dist) * step;
      const nz = p.pos.z + (dz / dist) * step;
      const r = Math.hypot(nx, nz);
      p.pos.x = r > 17 ? (nx / r) * 17 : nx;
      p.pos.z = r > 17 ? (nz / r) * 17 : nz;
    }
  }, { dx, dz, dist, danger });
  if (!danger && dist < 2.4) await page.keyboard.press('j');
  if (!shot && process.argv[3] && st.hp < 10) { await page.screenshot({ path: process.argv[3] }); shot = true; }
  await page.waitForTimeout(240);
}
const secs = Math.round((Date.now() - start) / 1000);
await page.waitForFunction(() => window.__game.session.data.freedChampions.includes('cogwheel'), null, { timeout: 30000 })
  .catch(() => fail('cogwheel never freed'));
await page.waitForFunction(() => (window.__game.scene['fossilPickups']?.length ?? 0) > 0, null, { timeout: 15000 }).catch(() => {});
await page.evaluate(() => {
  const fp = window.__game.scene['fossilPickups']?.find((f) => !f.collected);
  if (fp) window.__game.player.pos.copy(fp.group.position);
});
await page.waitForTimeout(1200);

// 4. café check: both champions at their tables in the hub
await page.evaluate(() => window.__game.session.data.freedChampions.push('bruno')); // Bruno beaten in his own gate run
await page.evaluate(() => window.__game.goto('hub'));
await page.waitForFunction(() => window.__game.scene?.def?.id === 'hub', null, { timeout: 30000 });
await page.waitForTimeout(2000);
const cafe = await page.evaluate(() => ({
  bruno: !!window.__game.scene['npcs'].find((n) => n.char === 'bruno'),
  cogwheel: !!window.__game.scene['npcs'].find((n) => n.char === 'cogwheel'),
  fossil: window.__game.session.hasFossil('w2-f6'),
}));
console.log(`fight ${secs}s, wipes=${wipes} | café: bruno=${cafe.bruno} cogwheel=${cafe.cogwheel} | fossil w2-f6=${cafe.fossil}`);
console.log(`console errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log('  ERR:', e.slice(0, 220));
await browser.close();
const ok = cafe.cogwheel && cafe.bruno && cafe.fossil && errors.length === 0 && process.exitCode !== 1;
console.log(ok ? 'COGWHEEL CHECK OK (shield → puzzle → victory → café)' : 'COGWHEEL CHECK FAILED');
process.exit(ok ? 0 : 1);
