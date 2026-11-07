// Drives the Plan Lab headless: intro card → prompts → a wrong move (hint) → the plan's moves,
// answering every ledger question with a real payoff → the payoff card → "Try it live" starts a game.
// Usage: node scripts/recipe-check.mjs http://localhost:5174 [recipeId] [shot.png]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const id = process.argv[3] ?? 'greek-gift';
const shot = process.argv[4];
const recipe = JSON.parse(readFileSync(new URL('../content/recipes.json', import.meta.url))).recipes.find((r) => r.id === id);
const gets = new Set(Object.values(recipe.steps).flatMap((s) => s.bait?.get ?? []));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?recipe=${id}`, { waitUntil: 'load' });
const card = page.locator('#hud .card:not(.hidden)');
await card.waitFor({ timeout: 20000 });
console.log('intro:', await card.locator('h2').innerText());
await card.locator('button').click();

let wrongTried = false;
let ledgerAsked = 0;
let shotTaken = false;
for (let guard = 0; guard < 60; guard++) {
  const st = await page.evaluate(() => window.__app.state());
  if (!st || st.finished === undefined) break; // session swapped (live game started)
  if (st.finished) break;
  if (!st.expected) { await page.waitForTimeout(300); continue; }
  if (!wrongTried) {
    wrongTried = true;
    await page.evaluate(async (exp) => {
      const s = window.__app.current;
      const legal = s.rules.legalMoves().find((m) => m.from + m.to + (m.promotion ?? '') !== exp);
      await s.humanMove({ from: legal.from, to: legal.to, promotion: legal.promotion });
    }, st.expected);
    const coach = await page.locator('#hud .coach').innerText();
    console.log('hint after wrong move:', coach.slice(0, 90));
    if (!/Not in the plan/.test(coach)) { console.error('expected a hint'); process.exit(1); }
  }
  // Play the expected move; a ledger question may pop up before it executes.
  page.evaluate((exp) => { void window.__app.current.humanMove({ from: exp.slice(0, 2), to: exp.slice(2, 4), promotion: exp[4] }); }, st.expected);
  try {
    await card.waitFor({ timeout: 1200 });
    const kicker = await card.locator('.kicker').innerText();
    if (/Count it/i.test(kicker)) {
      ledgerAsked++;
      const opts = await card.locator('.option').allInnerTexts();
      const idx = opts.findIndex((o) => gets.has(o));
      console.log('ledger question:', await card.locator('h2').innerText(), '→', opts[idx]);
      if (idx < 0) { console.error('no real payoff among options', opts); process.exit(1); }
      if (shot && !shotTaken) { shotTaken = true; await page.screenshot({ path: shot }); }
      await card.locator('.option').nth(idx).click();
      await card.waitFor({ timeout: 3000 });
      console.log('ledger card:', await card.locator('h2').innerText());
      await card.locator('button').click();
    } else if (/payoff/i.test(kicker)) {
      console.log('payoff card:', (await card.locator('p').innerText()).slice(0, 120));
      await card.locator('button').click();
      break;
    }
  } catch { /* no card this move */ }
  await page.waitForTimeout(2300);
}
// The payoff card may still be pending after the last scripted reply.
try {
  await card.waitFor({ timeout: 8000 });
  if (/payoff/i.test(await card.locator('.kicker').innerText())) {
    console.log('payoff card:', (await card.locator('p').innerText()).slice(0, 120));
    await card.locator('button').click();
  }
} catch {}
await page.waitForFunction(() => window.__app.current && window.__app.current.bot, null, { timeout: 10000 });
const live = await page.evaluate(() => ({ bot: window.__app.current.bot.id, greedy: window.__app.current.bot.flaws.greedy, title: document.querySelector('#hud .title').textContent }));
console.log('live game:', JSON.stringify(live));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('king-hunt.progress.v1')).recipes);
console.log('saved:', JSON.stringify(saved));
await browser.close();
if (errors.length) { console.error('console errors:', errors); process.exit(1); }
if (ledgerAsked === 0 || !saved[id] || saved[id].done < 1 || live.greedy < 0.9) { console.error('recipe loop failed'); process.exit(1); }
console.log('recipe-check OK');
