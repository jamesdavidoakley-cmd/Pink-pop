// Boots Crash Test headless, plays a passing bridge, a failing bridge, a Stand Up tower via real pointer taps,
// and a Lift It pivot. Fails on console errors or a wrong outcome. Usage: node scripts/boot-check.mjs [url] [shotDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5175/';
const shotDir = process.argv[3] ?? 'shots';
mkdirSync(shotDir, { recursive: true });
const fixedChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ ...(existsSync(fixedChromium) ? { executablePath: fixedChromium } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${shotDir}/01-splash.png` });
await page.click('#splash');
await page.waitForTimeout(500);
await page.screenshot({ path: `${shotDir}/02-menu.png` });

const dbg = () => page.evaluate(() => { const d = window.__ct.game.debug(); return { phase: d.phase, cost: d.cost, parts: d.parts, blocks: d.blocks, loadsHeld: d.loadsHeld, outcome: d.outcome, stars: d.stars }; });
const place = (kind, ax, ay, bx, by) => page.evaluate(([k, a, b, c, d]) => window.__ct.game.debug().place(k, a, b, c, d), [kind, ax, ay, bx, by]);
const waitPhase = (ph, ms = 90000) => page.waitForFunction((p) => window.__ct.game.debug().phase === p, ph, { timeout: ms });
const openLevel = async (modeIdx, tier) => { if (await page.isVisible('#result')) await page.click('#res-menu'); else await page.click('#btn-home'); await page.waitForTimeout(300); await page.click(`.district:nth-child(${modeIdx}) .tier-btn:nth-child(${tier})`); await page.waitForTimeout(500); };

// 1. Bridge level 1: a deck truss. Should hold both carts, under par → 3 stars.
await page.click('.district:nth-child(1) .tier-btn:nth-child(1)');
await page.waitForTimeout(500);
for (const p of [['beam', 9, 8, 12, 8], ['beam', 12, 8, 15, 8], ['brace', 9, 10, 12, 8], ['brace', 15, 10, 12, 8]]) {
  const r = await place(...p);
  if (!r.ok) errors.push(`place failed: ${p.join(',')} → ${r.why}`);
}
await page.waitForTimeout(300);
await page.screenshot({ path: `${shotDir}/03-bridge-build.png` });
await page.click('#btn-test');
await page.waitForTimeout(3500);
await page.screenshot({ path: `${shotDir}/04-bridge-cart.png` });
await waitPhase('result');
let d = await dbg();
console.log('bridge truss:', d.outcome ?? 'held', 'loadsHeld', d.loadsHeld, 'stars', d.stars['bridge-1']);
if (d.stars['bridge-1'] !== 3) errors.push(`expected 3 stars on the truss, got ${d.stars['bridge-1']}`);
await page.screenshot({ path: `${shotDir}/05-bridge-result.png` });

// 2. Bridge level 1: a lone long beam. Holds the light cart, snaps under the heavy one.
await page.click('#res-fix');
await page.waitForTimeout(400);
await page.click('#btn-clear');
await place('long', 9, 8, 15, 8);
await page.click('#btn-test');
await page.waitForFunction(() => window.__ct.game.debug().outcome !== null, null, { timeout: 90000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${shotDir}/06-bridge-snap.png` });
await waitPhase('result');
d = await dbg();
console.log('lone long beam:', d.outcome, 'loadsHeld', d.loadsHeld, '| toast:', await page.textContent('#res-sub'));
if (d.outcome !== 'snapped' || d.loadsHeld !== 1) errors.push(`expected snapped after 1 load, got ${d.outcome} after ${d.loadsHeld}`);

// 3. Stand Up level 1 via real pointer taps: four wide blocks.
await openLevel(3, 1);
await page.click('.tool[data-tool="wide"]');
const tap = async (wx, wy) => { const s = await page.evaluate(([x, y]) => window.__ct.game.debug().screen(x, y), [wx, wy]); await page.mouse.click(s.x, s.y); await page.waitForTimeout(120); };
for (let i = 0; i < 4; i++) await tap(12.5, 10.5 - i);
d = await dbg();
console.log('stand blocks placed by tapping:', d.blocks, 'cost', d.cost);
if (d.blocks !== 4) errors.push(`expected 4 blocks, got ${d.blocks}`);
await page.screenshot({ path: `${shotDir}/07-stand-build.png` });
await page.click('#btn-test');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shotDir}/08-stand-quake.png` });
await waitPhase('result');
d = await dbg();
console.log('stand wide tower:', d.outcome ?? 'held', 'loadsHeld', d.loadsHeld, 'stars', d.stars['stand-1']);
if (d.stars['stand-1'] !== 3) errors.push(`expected 3 stars on the wide tower, got ${d.stars['stand-1']}`);

// 4. Don't Wobble: a square gate wobbles over.
await openLevel(2, 1);
for (const p of [['pillar', 10, 11, 10, 8], ['pillar', 13, 11, 13, 8], ['beam', 10, 8, 13, 8]]) await place(...p);
await page.click('#btn-test');
await page.waitForFunction(() => window.__ct.game.debug().outcome !== null, null, { timeout: 90000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${shotDir}/09-gate-wobble.png` });
await waitPhase('result');
d = await dbg();
console.log('square gate:', d.outcome);
if (d.outcome !== 'wobbled') errors.push(`expected wobbled, got ${d.outcome}`);

// 5. Lift It: tap a pivot by pointer, then test.
await openLevel(4, 1);
await tap(8, 10);
d = await dbg();
await page.screenshot({ path: `${shotDir}/10-lift-build.png` });
await page.click('#btn-test');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${shotDir}/11-lift-max.png` });
await waitPhase('result');
d = await dbg();
console.log('lift pivot 8:', d.outcome ?? 'held', 'stars', d.stars['lift-1']);
if (d.stars['lift-1'] !== 3) errors.push(`expected 3 stars on lift, got ${d.stars['lift-1']}`);

// 6. Roof: braced roof holds.
await openLevel(5, 1);
for (const p of [['pillar', 10, 10, 10, 7], ['pillar', 14, 10, 14, 7], ['beam', 10, 7, 12, 7], ['beam', 12, 7, 14, 7], ['brace', 10, 10, 12, 7], ['brace', 14, 10, 12, 7]]) await place(...p);
await page.click('#btn-test');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${shotDir}/12-roof-rocks.png` });
await waitPhase('result');
d = await dbg();
console.log('braced roof:', d.outcome ?? 'held', 'loadsHeld', d.loadsHeld);
if (d.loadsHeld !== 2) errors.push(`expected roof to hold both loads, held ${d.loadsHeld}`);

// Phone width.
await page.click('#res-menu');
await page.setViewportSize({ width: 400, height: 800 });
await page.waitForTimeout(500);
await page.click('.district:nth-child(1) .tier-btn:nth-child(1)');
await page.waitForTimeout(600);
await page.screenshot({ path: `${shotDir}/13-phone.png` });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (overflow) errors.push('horizontal overflow at phone width');

console.log(`Console errors: ${errors.length}`);
for (const e of errors.slice(0, 12)) console.log('  ERR:', e.slice(0, 400));
await browser.close();
process.exit(errors.length ? 1 : 0);
