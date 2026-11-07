// Drives Today's hunt headless: warm-up card → three puzzles (solved via the expected moves,
// answering every card) → the plan or spar step begins → steps are saved for resume.
// Usage: node scripts/daily-check.mjs http://localhost:5174
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?daily`, { waitUntil: 'load' });
const card = page.locator('#hud .card:not(.hidden)');
await card.waitFor({ timeout: 20000 });
const kicker = await card.locator('.kicker').innerText();
console.log('warm-up:', kicker, '|', await card.locator('h2').innerText());
if (!/warm-up/i.test(kicker)) { console.error('expected the warm-up card'); process.exit(1); }
await card.locator('button').click();

// Solve puzzles until the hunt step is recorded.
const deadline = Date.now() + 150000;
let solved = 0;
while (Date.now() < deadline) {
  const steps = await page.evaluate(() => (JSON.parse(localStorage.getItem('king-hunt.progress.v1') || '{}').today || {}).steps || []);
  if (steps.includes('hunt')) break;
  if (await card.count()) {
    const opts = card.locator('.option');
    if (await opts.count()) await opts.first().click(); else await card.locator('button').click();
    await page.waitForTimeout(250);
    continue;
  }
  const st = await page.evaluate(() => window.__app.state());
  if (st && st.expected && st.busy === false) {
    await page.evaluate((exp) => window.__app.current.humanMove({ from: exp.slice(0, 2), to: exp.slice(2, 4), promotion: exp[4] }), st.expected);
    if (st.complete === false) solved = st.solved;
  }
  await page.waitForTimeout(300);
}
const today = await page.evaluate(() => JSON.parse(localStorage.getItem('king-hunt.progress.v1')).today);
console.log('today after hunt:', JSON.stringify(today));
await page.waitForTimeout(1500);
const next = await page.evaluate(() => ({ title: document.querySelector('#hud .title')?.textContent, hasBot: !!(window.__app.current && window.__app.current.bot), recipe: !!(window.__app.current && window.__app.current.recipe) }));
console.log('next step started:', JSON.stringify(next));
// Reload: the hunt must resume at the plan/spar step, not the warm-up.
await page.goto(`${base}/?daily`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const resumed = await page.evaluate(() => ({ step: (JSON.parse(localStorage.getItem('king-hunt.progress.v1')).today || {}).steps, title: document.querySelector('#hud .title')?.textContent }));
console.log('after reload:', JSON.stringify(resumed));
await browser.close();
if (errors.length) { console.error(errors); process.exit(1); }
if (!today || !today.steps.includes('warmup') || !today.steps.includes('hunt') || today.puzzles < 3) { console.error('daily hunt did not record its steps'); process.exit(1); }
if (!next.hasBot && !next.recipe) { console.error('plan/spar step did not start'); process.exit(1); }
console.log('daily-check OK');
