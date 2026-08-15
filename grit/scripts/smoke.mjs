import { chromium } from 'playwright'
const [url, outDir] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 2 })
const errs = []
p.on('console', m => m.type() === 'error' && !m.text().includes('404') && errs.push(m.text()))
p.on('pageerror', e => errs.push('PAGEERROR: ' + String(e)))
const shot = async (name) => { await p.waitForTimeout(500); await p.screenshot({ path: `${outDir}/${name}.png` }) }

await p.goto(url, { waitUntil: 'networkidle' })
await shot('1-profiles')
await p.getByRole('button', { name: /Driver 1/ }).click()
await shot('2-yard')
await p.getByRole('button', { name: /First load/ }).click()
await shot('3-loadbay')
// load both crates onto the rear zone
for (let i = 0; i < 4; i++) {
  const crates = await p.locator('[aria-label^="Crate "]').all()
  const inYard = crates[crates.length - 1]
  if (!inYard) break
  await inYard.click()
  await p.getByRole('button', { name: /Put it Over the back wheels/ }).click()
  await p.waitForTimeout(150)
}
await shot('4-loaded')
await p.getByRole('button', { name: /Ready/ }).click()
await shot('5-predict')
await p.getByRole('button', { name: /Yes, it will grip/ }).click()
await p.getByRole('button', { name: /Drive/ }).click()
await p.waitForTimeout(600)
await shot('6-drive')
// hold the throttle
await p.keyboard.down('Space')
await p.waitForTimeout(2500)
await shot('7-driving')
await p.waitForTimeout(4000)
await shot('8-driving-more')
await p.keyboard.up('Space')
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'clean')
await b.close()
