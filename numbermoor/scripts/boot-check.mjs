// Boots Numbermoor headless: picks a house, solves a potion by tapping tokens on the canvas, plays a broom round
// through the dials, and checks points and stars. Usage: node scripts/boot-check.mjs [url] [shotDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
const url = process.argv[2] ?? 'http://localhost:5179/';
const S = (process.argv[3] ?? 'shots') + '/';
mkdirSync(S, { recursive: true });
const fixedChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ ...(existsSync(fixedChromium) ? { executablePath: fixedChromium } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_CONNECTION/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const dbg = () => page.evaluate(() => { const d = window.__nm.app.debug(); return { phase: d.phase, cls: d.cls, round: d.round, points: d.points, stars: d.stars, house: d.house, potion: d.potion, broom: d.broom }; });
const click = (sel) => page.click(sel, { force: true });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(600);
await page.screenshot({ path: S + '01-splash.png' });
await click('#splash'); await page.waitForTimeout(500);
await page.screenshot({ path: S + '02-houses.png' });
await click('.house:nth-child(2)'); await page.waitForTimeout(500);
await page.screenshot({ path: S + '03-hall.png' });
let d = await dbg();
console.log('house:', d.house);

// Potions level 1: solve every round by tapping tokens on the canvas.
await click('.district.potions .tier-btn:nth-child(1)'); await page.waitForTimeout(600);
await page.screenshot({ path: S + '04-potions.png' });
for (let r = 0; r < 5; r++) {
  d = await dbg();
  const p = d.potion;
  const bottleSide = p.left.bottles ? 'left' : 'right'; const other = bottleSide === 'left' ? 'right' : 'left';
  const drops = p[bottleSide].drops;
  // take the drops off the bottle's pan, then the same off the other pan, by tapping real tokens
  for (const side of [bottleSide, other]) {
    let taken = 0;
    while (taken < drops) {
      const t = drops - taken >= 5 ? await page.evaluate(([k, s]) => window.__nm.app.debug().tokenAt(k, s), ['stone', side]) : null;
      const tok = t ?? await page.evaluate(([k, s]) => window.__nm.app.debug().tokenAt(k, s), ['drop', side]);
      if (!tok) break;
      await page.mouse.click(tok.x, tok.y); await page.waitForTimeout(120);
      taken += tok.kind === 'stone' ? 5 : 1;
    }
    if (r === 0 && side === bottleSide) { await page.waitForTimeout(400); await page.screenshot({ path: S + '05-potions-tipped.png' }); }
  }
  await page.waitForTimeout(400);
  d = await dbg();
  if (d.phase !== 'answer') { errors.push(`potions round ${r}: expected answer phase, got ${d.phase} ${JSON.stringify(d.potion)}`); console.log('  ERR', errors[errors.length - 1]); break; }
  if (r === 0) await page.screenshot({ path: S + '06-potions-answer.png' });
  // wrong first on round 0, then right
  if (r === 0) { const wrong = await page.$$eval('#ch-row .choice', (els, x) => els.map((e) => Number(e.textContent)).find((v) => v !== x), d.potion.x); await page.click(`#ch-row .choice:has-text("${wrong}")`); await page.waitForTimeout(300); console.log('  hint:', await page.textContent('#toast')); }
  await page.click(`#ch-row .choice:has-text("${d.potion.x}")`);
  await page.waitForTimeout(1200);
  if (r === 0) await page.screenshot({ path: S + '07-potions-brew.png' });
  await page.waitForFunction((rr) => { const x = window.__nm.app.debug(); return x.round === rr + 1 || x.phase === 'result'; }, r, { timeout: 20000 });
  await page.waitForTimeout(300);
}
d = await dbg();
console.log('potions:', d.phase, 'stars', d.stars['potions-1'], 'points', d.points);
if (d.stars['potions-1'] !== 3) errors.push(`expected 3 stars on potions-1, got ${d.stars['potions-1']}`);
await page.screenshot({ path: S + '08-result.png' });

// Brooms level 1: one round through the dials, then remaining rounds via the model.
await click('#res-home'); await page.waitForTimeout(300);
await click('.district.brooms .tier-btn:nth-child(1)'); await page.waitForTimeout(800);
await page.screenshot({ path: S + '09-brooms.png' });
d = await dbg();
console.log('brooms n =', d.broom.n, 'pairs', d.broom.pairs.length);
// a deliberate wrong fly (3 rows) unless it happens to divide, then all real pairs
await page.evaluate(() => window.__nm.app.debug().setRows(3));
await page.evaluate(() => window.__nm.app.debug().setCols(3));
await page.evaluate(() => window.__nm.app.debug().fly()); await page.waitForTimeout(300);
console.log('  wrong fly toast:', await page.textContent('#toast'));
for (const [r, c] of d.broom.pairs) {
  // use the dial buttons for the first pair to prove the DOM path, the model for the rest
  if (r === d.broom.pairs[0][0]) {
    const cur = await dbg();
    for (let i = cur.broom.rows; i > r; i--) await click('#rows-minus');
    for (let i = cur.broom.rows; i < r; i++) await click('#rows-plus');
    const cur2 = await dbg();
    for (let i = cur2.broom.cols; i > c; i--) await click('#cols-minus');
    for (let i = cur2.broom.cols; i < c; i++) await click('#cols-plus');
    await click('#btn-fly');
  } else { await page.evaluate(([rr, cc]) => { const x = window.__nm.app.debug(); x.setRows(rr); x.setCols(cc); x.fly(); }, [r, c]); }
  await page.waitForTimeout(500);
  if (r === 2 || r === d.broom.pairs[1][0]) await page.screenshot({ path: S + '10-brooms-formation.png' });
}
await page.waitForTimeout(1500);
await page.screenshot({ path: S + '11-brooms-fireworks.png' });
d = await dbg();
console.log('brooms after round 1:', 'found', d.broom?.found?.length, 'complete', d.broom?.complete, 'phase', d.phase);
await page.waitForFunction(() => window.__nm.app.debug().round === 1, null, { timeout: 30000 }).catch(() => errors.push('brooms: round 2 never started'));

// phone
await page.setViewportSize({ width: 400, height: 800 }); await page.waitForTimeout(600);
await page.screenshot({ path: S + '12-phone.png' });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (overflow) errors.push('overflow at phone width');
console.log(`Console errors: ${errors.length}`); for (const e of errors.slice(0, 10)) console.log('  ERR:', e.slice(0, 400));
await browser.close();
process.exit(errors.length ? 1 : 0);
