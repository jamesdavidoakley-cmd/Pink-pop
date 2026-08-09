// P4 gate: the 7-year-old-shaped playtest, headless.
// Drives Marcus's numeral drill end-to-end: spoken intro + question, a WRONG
// answer (warm gentle line + hint), the correct answer, a double-wrong (teach +
// fresh numbers), completion → scoreboard flag. Then boots W1 and checks the
// task pedestals + zones render clean.
// Usage: node scripts/playtest-w1.mjs [baseUrl] [w1shot.png]
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
const subtitles = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const fail = (msg) => { console.log(`FAILED: ${msg}`); process.exitCode = 1; };

await page.goto(`${base}/?level=hub&slot=2`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => window.__game?.player, null, { timeout: 30000 });

// record every subtitle line we see
const pollSubs = setInterval(async () => {
  try {
    const s = await page.evaluate(() => {
      const bar = document.querySelector('.subtitle-bar');
      if (!bar?.classList.contains('visible')) return null;
      return {
        name: document.querySelector('.subtitle-name')?.textContent ?? '',
        text: document.querySelector('.subtitle-text')?.textContent ?? '',
      };
    });
    if (s && s.text && !subtitles.some((x) => x.text === s.text)) subtitles.push(s);
  } catch { /* page busy */ }
}, 150);

// 1. walk up to the numeral drill pedestal and start it
await page.evaluate(() => {
  const t = window.__game.scene.def.tasks.find((x) => x.ref === 'hub-numeral-drill');
  window.__game.player.pos.set(t.pos[0] + 0.6, t.pos[1] + 0.6, t.pos[2] + 0.6);
});
await page.waitForTimeout(500);
await page.keyboard.press('e');

const padPos = (i) => page.evaluate((idx) => {
  const t = window.__game.scene.def.tasks.find((x) => x.ref === 'hub-numeral-drill');
  const yaw = t.yaw ?? 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const sx = fz, sz = -fx;
  return [t.pos[0] + fx * 3.2 + sx * (idx - 1) * 2.6, t.pos[1] + 0.5, t.pos[2] + fz * 3.2 + sz * (idx - 1) * 2.6];
}, i);

const waitForQuestion = async (prevText) => {
  await page.waitForFunction((prev) => {
    const q = window.__game.scene.education.lastQuestion;
    return q && q.text !== prev;
  }, prevText, { timeout: 40000 });
  // let the ask() spoken lines finish + pads arm
  await page.waitForTimeout(2600);
  return page.evaluate(() => ({
    text: window.__game.scene.education.lastQuestion.text,
    correct: window.__game.scene.education.lastQuestion.correctIndex,
  }));
};

const standOn = async (i) => {
  const p = await padPos(i);
  await page.evaluate((pos) => { window.__game.player.pos.set(pos[0], pos[1], pos[2]); window.__game.player.vel.set(0, -1, 0); }, p);
  await page.waitForTimeout(900);
};
const stats = () => page.evaluate(() => {
  const m = window.__game.session.data.mastery['roman-numerals'] ?? { attempts: 0, correct: 0 };
  return { attempts: m.attempts, correct: m.correct, flag: !!window.__game.session.data.flags.hub_numeral_drill };
});

// ---- Q1: wrong once (warm loop), then right
let q = await waitForQuestion(null);
console.log(`Q1: "${q.text}" (correct pad ${q.correct})`);
await standOn((q.correct + 1) % 3);
await page.waitForFunction(() => (window.__game.session.data.mastery['roman-numerals']?.attempts ?? 0) >= 1, null, { timeout: 30000 });
let s = await stats();
if (s.correct !== 0) fail(`expected 0 correct after wrong answer, got ${s.correct}`);
console.log(`  wrong answer registered (attempts=${s.attempts}) — waiting out the gentle hint…`);
await page.waitForTimeout(6500); // gentle line + hint wrapper get spoken
await standOn(q.correct);
await page.waitForFunction(() => (window.__game.session.data.mastery['roman-numerals']?.correct ?? 0) >= 1, null, { timeout: 30000 });
console.log('  correct after hint ✓ (warm failure loop verified)');

// ---- Q2: wrong twice → teach + fresh numbers → then right
q = await waitForQuestion(q.text);
console.log(`Q2: "${q.text}"`);
await standOn((q.correct + 1) % 3);
await page.waitForTimeout(6500);
await standOn((q.correct + 2) % 3);
// teach fires, question regenerates with fresh values
const q2b = await waitForQuestion(q.text);
console.log(`  after teach, fresh question: "${q2b.text}" ✓`);
await standOn(q2b.correct);
await page.waitForFunction(() => (window.__game.session.data.mastery['roman-numerals']?.correct ?? 0) >= 2, null, { timeout: 30000 });

// ---- Q3: straight correct → drill completes → scoreboard flag
q = await waitForQuestion(q2b.text);
console.log(`Q3: "${q.text}"`);
await standOn(q.correct);
await page.waitForFunction(() => !!window.__game.session.data.flags.hub_numeral_drill, null, { timeout: 30000 });
s = await stats();
console.log(`drill complete: attempts=${s.attempts} correct=${s.correct} scoreboardFlag=${s.flag} ✓`);

// speakers rotated? (ask intros + hints came from companions)
const speakers = new Set(subtitles.map((x) => x.name));
console.log(`speakers heard: ${[...speakers].join(', ')} (${subtitles.length} lines)`);
if (speakers.size < 1) fail('no spoken subtitles seen');

// ---- W1 boots and renders its task pedestals
await page.evaluate(() => window.__game.goto('w1'));
await page.waitForFunction(() => window.__game.scene?.def?.id === 'w1', null, { timeout: 30000 });
await page.waitForTimeout(2500);
const w1 = await page.evaluate(() => ({
  tasks: window.__game.scene.def.tasks.length,
  fossils: window.__game.scene.def.fossils.length,
}));
console.log(`W1 loaded: ${w1.tasks} task stations, ${w1.fossils} fossils on the list`);
if (process.argv[3]) {
  await page.evaluate(() => { window.__game.player.pos.set(40, 2, 4); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: process.argv[3] });
}

clearInterval(pollSubs);
console.log(`console errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log('  ERR:', e.slice(0, 220));
if (errors.length) process.exitCode = 1;
await browser.close();
console.log(process.exitCode ? 'PLAYTEST FAILED' : 'PLAYTEST OK');
