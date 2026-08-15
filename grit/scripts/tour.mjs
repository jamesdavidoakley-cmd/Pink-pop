import { chromium } from 'playwright'
const [url, outDir] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 2 })
const errs = []
p.on('console', m => m.type() === 'error' && !m.text().includes('404') && errs.push(m.text()))
p.on('pageerror', e => errs.push('PAGEERROR: ' + String(e)))
const shot = async (n) => { await p.waitForTimeout(500); await p.screenshot({ path: `${outDir}/t-${n}.png` }) }

const levels = {}
for (let i = 1; i <= 14; i++) levels['l' + i] = { completed: true, cleanRun: i % 3 === 0, cargoIntact: true, boughtNothing: false, bestTime: 30 }
const save = {
  lastSlot: 0,
  profiles: [{
    slot: 0, name: 'Alex', colour: '#1F5C3C', xp: 1800, created: true,
    owned: ['knobbly','chains','sand','weights','liftaxle','boards','ballast','paint.hivis','horn.airhorn','hat.cap','dog','mudflaps','signwriting'],
    fitted: { tyres: 'knobbly', wheelWeights: true, liftAxle: true, sandHopper: true, boards: true, ballastTank: true },
    cosmetics: { paint: 'hivis', horn: 'airhorn', dog: true, hat: 'cap', mudflaps: true, signwriting: 'ALEX' },
    levels, seenSurfaces: ['dry_tarmac','wet_tarmac','gravel','wet_leaves','mud','snow','ice'],
    predictions: { correct: 9, total: 12 },
    mastery: { stickiness: 6, press: 3, placement: 4, budget: 2, recovery: 5, 'mass-cost': 1, stopping: 3 },
    settings: { reducedMotion: false, narration: false, sound: false, showNumbers: true },
  }, null],
}
await p.goto(url)
await p.evaluate((s) => localStorage.setItem('grit.save.v1', JSON.stringify(s)), save)
await p.reload({ waitUntil: 'networkidle' })
await p.getByRole('button', { name: /Alex/ }).click()
await shot('yard')

await p.getByRole('button', { name: /The shop/ }).click(); await shot('shop-kit')
await p.getByRole('button', { name: /^Fun$/ }).click(); await shot('shop-fun')
await p.getByRole('button', { name: /Back to the yard/ }).first().click()

await p.getByRole('button', { name: /Grown-ups/ }).click()
await p.getByLabel('Four digit code').fill('4192'); await shot('grownup')
await p.getByRole('button', { name: /^Back$/ }).click()

// Level 4 — the placement lesson
await p.getByRole('button', { name: /Front or back\?/ }).click()
await shot('loadbay')
await p.locator('[aria-label^="Crate "]').last().click({ force: true })
await p.getByRole('button', { name: /Put it Over the cab/ }).click()
await shot('loadbay-cab')
await p.locator('[aria-label^="Crate "]').last().click({ force: true })
await p.getByRole('button', { name: /Put it Over the back wheels/ }).click()
await shot('loadbay-rear')
await p.getByRole('button', { name: /Ready/ }).click()
await shot('predict')
await p.getByRole('button', { name: /Yes, it will grip/ }).click()
await shot('predict-answered')
await p.getByRole('button', { name: /^Drive$/ }).click()
await p.keyboard.down('Space'); await p.waitForTimeout(3500); await shot('l4-drive')
await p.keyboard.up('Space')
await p.getByRole('button', { name: /Back to the yard/ }).first().click()

// Boss levels
for (const [name, secs] of [['Slick', 9], ['Mudzilla', 11]]) {
  await p.getByRole('button', { name: new RegExp(name) }).click()
  for (let i = 0; i < 5; i++) {
    const c = await p.locator('[aria-label^="Crate "]').all()
    const inYard = c[c.length - 1]
    if (!inYard) break
    await inYard.click({ force: true })
    await p.getByRole('button', { name: /Put it Over the back wheels/ }).click()
    await p.waitForTimeout(120)
  }
  await p.getByRole('button', { name: /Ready/ }).click()
  const drive = p.getByRole('button', { name: /^Drive$/ })
  if (await drive.count()) await drive.click()
  await p.keyboard.down('Space'); await p.waitForTimeout(secs * 1000)
  await shot(name.toLowerCase())
  await p.keyboard.up('Space')
  await p.getByRole('button', { name: /Back to the yard/ }).first().click()
  await p.waitForTimeout(300)
}

// Free play
await p.getByRole('button', { name: /The yard/ }).last().click()
await shot('freeplay')
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'clean')
await b.close()
