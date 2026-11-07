// Drives a Great hunt headless: intro → opening auto-plays → guess loop (one wrong guess, then the right one) → finale → saved.
// Usage: node scripts/replay-check.mjs http://localhost:5174 [replayId]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const id = process.argv[3] ?? 'opera-1858';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?replay=${id}`, { waitUntil: 'load' });
const card = page.locator('#hud .card:not(.hidden)');
await card.waitFor({ timeout: 20000 });
console.log('intro:', await card.locator('h2').innerText());
await card.locator('button').click();
let wrongTried = false;
for (let guard = 0; guard < 120; guard++) {
  const st = await page.evaluate(() => window.__app.state());
  if (!st || st.finished) break;
  if (!st.expected) { await page.waitForTimeout(400); continue; }
  if (!wrongTried) {
    wrongTried = true;
    const coach = await page.evaluate(async (exp) => {
      const s = window.__app.current;
      const legal = s.rules.legalMoves().find((m) => m.from + m.to + (m.promotion ?? '') !== exp);
      await s.humanMove({ from: legal.from, to: legal.to, promotion: legal.promotion });
      return document.querySelector('#hud .coach').textContent;
    }, st.expected);
    console.log('after wrong guess:', coach.slice(0, 80));
    if (!/Hint:/.test(coach)) { console.error('expected a hint'); process.exit(1); }
  }
  // Fire and forget: humanMove's promise runs the auto-play chain until the next question.
  await page.evaluate((exp) => { void window.__app.current.humanMove({ from: exp.slice(0, 2), to: exp.slice(2, 4), promotion: exp[4] }); }, st.expected);
  await page.waitForTimeout(500);
}
await card.waitFor({ timeout: 30000 });
console.log('finale:', await card.locator('.kicker').innerText(), '|', (await card.locator('p').innerText()).slice(0, 100));
const st = await page.evaluate(() => window.__app.state());
console.log('asked', st.asked, 'guessedFirst', st.guessedFirst);
await card.locator('button').click();
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('king-hunt.progress.v1')).replays);
console.log('saved:', JSON.stringify(saved));
await browser.close();
if (errors.length) { console.error(errors); process.exit(1); }
if (!saved[id] || saved[id].done !== 1 || st.asked < 5 || st.guessedFirst !== st.asked - 1) { console.error('replay loop failed'); process.exit(1); }
console.log('replay-check OK');
