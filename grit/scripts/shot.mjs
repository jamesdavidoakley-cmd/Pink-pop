import { chromium } from 'playwright'
const [url, out, w=1400, h=760] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 })
const errs = []
p.on('console', m => m.type() === 'error' && errs.push(m.text()))
p.on('pageerror', e => errs.push(String(e)))
await p.goto(url, { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
await p.screenshot({ path: out })
console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'clean')
await b.close()
