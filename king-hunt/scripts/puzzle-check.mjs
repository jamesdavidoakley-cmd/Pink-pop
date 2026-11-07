// Drives the why-first puzzle loop headless on rung 0:
//   setup move → why question → wrong move (hint) → correct moves → solved → principle question → next.
// Usage: node scripts/puzzle-check.mjs http://localhost:5174 [shot.png]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '') + '/?rung=0';
const shot = process.argv[3];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });

const card = page.locator('#hud .card:not(.hidden)');
await card.waitFor({ timeout: 20000 });
console.log('rung card:', await card.locator('h2').innerText());
await card.locator('button').click();

// Why question appears after the setup move.
await card.waitFor({ timeout: 20000 });
const prompt = await card.locator('h2').innerText();
const options = await card.locator('.option').allInnerTexts();
console.log('why question:', prompt, options);
if (!/problem|idea/.test(prompt) || options.length !== 3) { console.error('bad why question'); process.exit(1); }
if (shot) await page.screenshot({ path: shot });
await card.locator('.option').first().click();
// If we guessed wrong, a correction card appears; dismiss it.
try { await card.waitFor({ timeout: 1500 }); await card.locator('button').click(); } catch {}

// Make a deliberately wrong legal move, then the expected moves until complete.
const log = await page.evaluate(async () => {
  const app = window.__app;
  const s = app.current;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  for (let i = 0; i < 20; i++) await sleep(100), s.busy === false;
  const exp = s.state().expected;
  const legal = s.rules.legalMoves().find((m) => m.from + m.to + (m.promotion ?? '') !== exp);
  await s.humanMove({ from: legal.from, to: legal.to, promotion: legal.promotion });
  out.push({ wrongTries: s.runner.wrongTries, coach: document.querySelector('#hud .coach').textContent });
  for (let guard = 0; guard < 8 && !s.state().complete; guard++) {
    const e = s.state().expected;
    await s.humanMove({ from: e.slice(0, 2), to: e.slice(2, 4), promotion: e[4] });
    await sleep(900);
  }
  out.push({ complete: s.state().complete, solved: s.state().solved });
  return out;
});
console.log(JSON.stringify(log));
if (log[0].wrongTries !== 1 || !log[1].complete) { console.error('puzzle loop failed'); process.exit(1); }

// Principle question (after the mate cut scene), then the feedback card leading to the next puzzle.
await card.waitFor({ timeout: 50000 });
console.log('principle question:', await card.locator('h2').innerText());
await card.locator('.option').first().click();
await card.waitFor({ timeout: 5000 });
console.log('feedback:', await card.locator('h2').innerText());
// In quick mode the feedback card auto-advances, so a click may land after it has gone; either is fine.
try { await card.locator('button.btn').first().click({ timeout: 3000 }); } catch { /* auto-advanced */ }
await page.waitForFunction(() => window.__app.state().solved === 1 && window.__app.state().expected, null, { timeout: 90000 });
const saved = await page.evaluate(() => localStorage.getItem('king-hunt.progress.v1'));
console.log('saved progress:', saved);
await browser.close();
if (errors.length) { console.error('console errors:', errors); process.exit(1); }
if (!saved || !saved.includes('"solved":1')) { console.error('progress not saved'); process.exit(1); }
console.log('puzzle-check OK');
