import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 1 })
await p.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: /Driver 1/ }).click()
await p.getByRole('button', { name: /First load/ }).click()
for (let i = 0; i < 4; i++) {
  const crates = await p.locator('[aria-label^="Crate "]').all()
  const inYard = crates[crates.length - 1]
  if (!inYard) break
  await inYard.click()
  await p.getByRole('button', { name: /Put it Over the back wheels/ }).click()
  await p.waitForTimeout(120)
}
await p.getByRole('button', { name: /Ready/ }).click()
await p.getByRole('button', { name: /Yes, it will grip/ }).click()
await p.getByRole('button', { name: /Drive/ }).click()
await p.waitForTimeout(800)
// sample a vertical column of pixels through the band
const data = await p.evaluate(() => {
  const c = document.querySelector('canvas')
  const ctx = c.getContext('2d')
  const dpr = c.width / c.getBoundingClientRect().width
  const out = []
  for (let y = 380; y < 500; y += 4) {
    const d = ctx.getImageData(Math.round(1000 * dpr), Math.round(y * dpr), 1, 1).data
    out.push(`${y}: rgb(${d[0]},${d[1]},${d[2]})`)
  }
  return out
})
console.log(data.join('\n'))
await b.close()
