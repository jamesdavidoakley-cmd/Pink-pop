// Dev sanity tool: verifies the P2 gate — four heroes converse (intro scene),
// subtitles advance even when TTS is unavailable (headless), zero errors.
// Usage: node scripts/voice-check.mjs [url] [screenshot.png]
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/?level=playground&demo=voices';
const fixedChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(fixedChromium) ? { executablePath: fixedChromium } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => window.__game?.dialogue, null, { timeout: 30000 });

const speakers = new Set();
const lines = [];
const deadline = Date.now() + 60000;
let shotTaken = false;
while (Date.now() < deadline) {
  const state = await page.evaluate(() => {
    const bar = document.querySelector('.subtitle-bar');
    return {
      visible: bar?.classList.contains('visible') ?? false,
      name: document.querySelector('.subtitle-name')?.textContent ?? '',
      text: document.querySelector('.subtitle-text')?.textContent ?? '',
      active: window.__game.dialogue.cutsceneActive,
    };
  });
  if (state.visible && state.text) {
    speakers.add(state.name);
    if (!lines.includes(state.text)) lines.push(state.text);
    if (!shotTaken && process.argv[3] && speakers.size >= 3) {
      await page.screenshot({ path: process.argv[3] });
      shotTaken = true;
    }
  }
  if (!state.active && lines.length > 3) break;
  await page.waitForTimeout(180);
}

console.log(`distinct speakers seen: ${speakers.size} → ${[...speakers].join(', ')}`);
console.log(`lines seen: ${lines.length}`);
console.log(`console errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log('  ERR:', e.slice(0, 200));
await browser.close();
const ok = speakers.size >= 4 && lines.length >= 5 && errors.length === 0;
console.log(ok ? 'VOICES OK (all four heroes conversed; TTS degraded gracefully)' : 'VOICES FAILED');
process.exit(ok ? 0 : 1);
