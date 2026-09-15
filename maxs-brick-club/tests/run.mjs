// End-to-end checks for the BUILT site (run `npm run build` first).
// Serves dist/ on a local port and drives it with Playwright.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const PORT = Number(process.env.PORT || 4390);
const BASE = `http://127.0.0.1:${PORT}`;
const ROUTES = ['/', '/classes/', '/times/', '/parties/', '/about/', '/book/', '/contact/'];

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ok ' : ' FAIL'} ${msg}`); if (!ok) failures++; };

const server = spawn('npx', ['http-server', DIST, '-p', String(PORT), '-s', '-c-1'], { stdio: 'ignore' });
await new Promise((res, rej) => {
  let tries = 0;
  const t = setInterval(() => {
    http.get(`${BASE}/`, () => { clearInterval(t); res(); }).on('error', () => { if (++tries > 50) { clearInterval(t); rej(new Error('server did not start')); } });
  }, 200);
});

// CHROMIUM_PATH lets CI/sandboxes point at a pre-installed browser; otherwise run `npx playwright install chromium` once.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 800 }]]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Photo slots 404 until real photos are dropped into public/images/ — that is expected.
    page.on('console', (m) => { if (m.type() === 'error' && !(m.location()?.url || '').includes('/images/')) errors.push(`${m.text()} (${m.location()?.url || ''})`); });

    console.log(`\n[${label}]`);
    for (const route of ROUTES) {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle' });
      check(res && res.status() === 200, `${route} responds 200`);
      check((await page.locator('h1').count()) === 1, `${route} has exactly one h1`);
      if (route === '/book/') check(await page.locator('.nav__link[aria-current="page"]').count() === 0, `${route} is reached from the CTA, so no nav pill is active`);
      else check(await page.locator(`.nav__link[aria-current="page"][href="${route}"]`).count() === 1, `${route} marks itself current in the nav`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 0, `${route} has no horizontal overflow (${overflow}px)`);
      const badLinks = await page.$$eval('a', (as) => as.filter((a) => !/^(\/|https?:|mailto:|tel:)/.test(a.getAttribute('href') || '')).map((a) => a.textContent.trim()));
      check(badLinks.length === 0, `${route} every link has a real href ${badLinks.length ? JSON.stringify(badLinks) : ''}`);
    }

    // Mobile menu
    if (label === 'mobile') {
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      check(!(await page.locator('#site-nav').isVisible()), 'nav hidden behind the Menu button on phones');
      await page.click('[data-nav-toggle]');
      check(await page.locator('#site-nav').isVisible(), 'Menu button opens the nav');
    }

    // Booking flow
    await page.goto(BASE + '/book/', { waitUntil: 'networkidle' });
    const text = (sel) => page.locator(sel).first().innerText();
    check((await page.locator('[data-date-index]').count()) === 6, 'book: six Saturdays listed');
    const today = new Date(); const d0 = new Date(today); d0.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const expected = `Sat ${d0.getDate()} ${MONTHS[d0.getMonth()]}`;
    check((await text('[data-date-index="0"]')).includes(expected), `book: first date is next Saturday (${expected})`);
    check((await text('[data-confirm]')).includes('PAY £5 & BOOK'), 'book: default total £5');
    await page.click('[data-pick-club="mini"]');
    check((await page.locator('main').innerText()).includes("Max's Mini Bricks"), 'book: Mini Bricks selectable');
    await page.click('[data-kids-plus]'); await page.click('[data-kids-plus]');
    check((await text('[data-confirm]')).includes('PAY £13 & BOOK'), 'book: 3 builders = £13');
    await page.click('[data-date-index="2"]');
    await page.click('[data-confirm]');
    check((await page.locator('main').innerText()).includes("You're in!"), 'book: success card shown');
    check((await page.locator('main').innerText()).includes("3 builder(s) booked for Max's Mini Bricks"), 'book: success copy carries the booking');
    await page.click('[data-book-another]');
    check((await page.locator('[data-date-index="3"]').getAttribute('aria-pressed')) === 'true' || (await page.locator('[data-date-index="3"]').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(255, 213, 0)', 'book: "Book another" moves to the following Saturday');
    await page.goto(BASE + '/book/?club=mini', { waitUntil: 'networkidle' });
    check((await page.locator('[data-pick-club="mini"]').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(0, 180, 216)', 'book: ?club=mini deep link presets Mini Bricks');

    // Enquiry forms
    for (const route of ['/contact/', '/parties/']) {
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      await page.click('[data-enquiry-submit]');
      await page.waitForTimeout(100);
      check(page.url() === BASE + route, `${route} form does not navigate away`);
      check((await text('[data-enquiry-submit]')).includes("SENT! WE'LL REPLY SOON"), `${route} form shows the sent label`);
    }

    check(errors.length === 0, `no console/page errors ${errors.length ? JSON.stringify(errors) : ''}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
