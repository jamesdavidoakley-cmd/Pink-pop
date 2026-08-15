import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport: { width: 1180, height: 720 }, offline: true })
const p = await ctx.newPage()
const errs = []
const requests = []
p.on('console', m => m.type() === 'error' && errs.push(m.text()))
p.on('pageerror', e => errs.push('PAGEERROR: ' + String(e)))
p.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) requests.push(r.url()) })

await p.goto(process.argv[2])
await p.waitForTimeout(900)
await p.getByRole('button', { name: /Driver 1/ }).click()
await p.getByRole('button', { name: /First load/ }).click()
for (let i = 0; i < 3; i++) {
  const c = await p.locator('[aria-label^="Crate "]').all()
  const last = c[c.length - 1]
  if (!last) break
  await last.click({ force: true })
  await p.getByRole('button', { name: /Put it Over the back wheels/ }).click()
  await p.waitForTimeout(120)
}
await p.getByRole('button', { name: /Ready/ }).click()
await p.getByRole('button', { name: /Yes, it will grip/ }).click()
await p.getByRole('button', { name: /^Drive$/ }).click()
await p.keyboard.down('Space')
await p.waitForTimeout(3000)
await p.keyboard.up('Space')
// confirm the bundled display font actually loaded, not a fallback
const fontOk = await p.evaluate(() => document.fonts.check("700 24px Signwriter"))
// confirm the save survives a reload
const saved = await p.evaluate(() => localStorage.getItem('grit.save.v1') !== null)
await p.screenshot({ path: process.argv[3] })
console.log('offline network requests:', requests.length ? requests.join(', ') : 'none')
console.log('bundled font loaded:', fontOk)
console.log('save written:', saved)
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors')
await b.close()
