// Live-game sacrifice audit: play the Greek gift against a bot and read the verdict;
// then drop a knight for nothing and expect "giveaway".
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?mode=play`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__app && !!window.__app.current, null, { timeout: 20000 });

async function run(fen, moves) {
  return page.evaluate(async ({ fen, moves }) => {
    const app = window.__app;
    app.goPlay({ fen, bot: { id: 't', name: 'Tester', blurb: '', skillLevel: 20, depth: 6, multiPv: 1, slack: 0, flaws: {} } });
    const s = app.current;
    const settle = async () => { for (let i = 0; i < 100 && s.state().thinking; i++) await new Promise((r) => setTimeout(r, 100)); await new Promise((r) => setTimeout(r, 300)); };
    for (let m of moves) {
      if (m === 'adapt') {
        // Greek gift follow-ups: take a hanging queen if offered, else go by the king's square.
        const qTake = s.rules.legalMoves().find((x) => x.captured === 'q');
        const k = s.rules.kingSquare('b');
        if (qTake) m = qTake.from + qTake.to;
        else
        if (k === 'h7') m = 'f3g5';
        else if (k === 'g8' || k === 'h8') m = 'd1h5';
        else if (k === 'g6' || k === 'h6') m = 'd1g4';
        else m = 'e1g1';
      }
      const ok = s.rules.isLegal({ from: m.slice(0, 2), to: m.slice(2, 4) });
      if (!ok) { m = 'e1g1'; if (!s.rules.isLegal({ from: 'e1', to: 'g1' })) m = 'a2a3'; }
      await s.humanMove({ from: m.slice(0, 2), to: m.slice(2, 4) });
      await settle();
    }
    const sans = s.rules.history().map((h) => h.san).join(' ');
    const val = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let bal = 0;
    for (const pc of s.rules.pieces()) bal += (pc.color === 'w' ? 1 : -1) * val[pc.type];
    return { sans, balance: bal, kingWentG8: /Kg8/.test(sans), turns: s['turns'].map((t) => ({ san: t.san, verdict: t.audit?.verdict ?? 'none', delta: t.delta, evalCp: t.audit?.evalCp ?? null, gave: t.audit?.gave ?? 0 })) };
  }, { fen, moves });
}
const gift = await run('r4rk1/pbqn1ppp/1pn1p3/2ppP3/3P4/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 0 11', ['d3h7', 'adapt', 'adapt', 'adapt']);
console.log('greek gift live:', gift.sans, JSON.stringify(gift.turns));
// Drop a knight, then two quiet moves so the three-turn ledger window closes.
const drop = await run('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', ['f3e5', 'd2d3', 'a2a3']);
console.log('knight drop live:', JSON.stringify(drop.turns));
await browser.close();
if (errors.length) { console.error(errors); process.exit(1); }
const giftVerdict = gift.turns[0]?.verdict;
// The gift must never be called a giveaway when we end the window ahead on material (…Qxg5 Bxg5 line)
// or when the king went back to g8 (the attack lands). Against …Kg6 'gamble' is a fair verdict.
console.log('gift balance for White:', gift.balance, 'verdict:', giftVerdict);
if (gift.balance > 0 && giftVerdict === 'giveaway') { console.error('ahead on material yet called a giveaway'); process.exit(1); }
if (gift.kingWentG8 && giftVerdict !== 'paid') { console.error('expected the Greek gift to be paid against …Kg8, got', giftVerdict); process.exit(1); }
if (drop.turns[0]?.verdict !== 'giveaway') { console.error('expected a giveaway verdict'); process.exit(1); }
console.log('audit-check OK');
