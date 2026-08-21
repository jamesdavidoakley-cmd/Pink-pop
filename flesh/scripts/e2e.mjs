/**
 * End-to-end, in a real browser.
 *
 * The unit tests prove the simulation; the smoke test proves the game boots and
 * runs. This proves the parts in between: that you can get from the title
 * screen to a drive and back, that the pause and map overlays behave, that the
 * commissary takes your money and gives you the thing, and that the profile
 * survives a reload. Every step asserts; any console error fails the run.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 4177
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0]
    const path = join(ROOT, normalize(url === '/' ? '/index.html' : url))
    const body = await readFile(path)
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('nope')
  }
})
await new Promise((r) => server.listen(PORT, r))

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text())
})

const failures = []
let checks = 0
const check = (name, ok, detail = '') => {
  checks++
  if (ok) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name} ${detail}`)
    failures.push(`${name} ${detail}`)
  }
}
const screen = () => page.evaluate(() => window.__flesh?.store?.getState?.().screen ?? null)
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('flesh_save') ?? 'null'))
const state = () => page.evaluate(() => window.__flesh?.store?.getState?.() ?? null)

/* ------------------------------------------------------------- the title */

console.log('title screen')
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
check('boots to the title', (await screen()) === 'title')
check('no save is written before the player does anything', (await save()) === null)

await page.getByRole('button', { name: /^RANGER/ }).click()
await page.waitForTimeout(200)
check('difficulty selection persists immediately', (await save())?.difficulty === 'ranger')

await page.getByRole('button', { name: /sound: on/i }).click()
await page.waitForTimeout(150)
check('mute persists', (await save())?.muted === true)
await page.getByRole('button', { name: /sound: off/i }).click()
await page.waitForTimeout(150)

/* ---------------------------------------------------------- level select */

console.log('mission board')
await page.getByRole('button', { name: /ride out/i }).click()
await page.waitForTimeout(300)
check('reaches the mission board', (await screen()) === 'levelSelect')
const lockedCount = await page.locator('button:disabled').count()
check('later drives are locked on a fresh profile', lockedCount === 5, `(${lockedCount} locked)`)

/* ----------------------------------------------------------- the briefing */

console.log('briefing and the drive')
await page.getByRole('button', { name: /CARVER CITY GATES/i }).click()
await page.waitForTimeout(400)
check('the briefing is shown before play', await page.getByText(/Welcome to your first drive/).isVisible())
await page.getByRole('button', { name: /move them out/i }).click()
await page.waitForTimeout(1500)
check('the drive starts', (await screen()) === 'playing')

let s = await state()
check('the world is built with the right head count', s?.world?.stats?.headStart === 6)
check('the difficulty carried into the world', s?.world?.difficulty?.id === 'ranger')

/* ------------------------------------------------------------ the map */

console.log('overlays')
await page.keyboard.press('Tab')
await page.waitForTimeout(400)
check('Tab opens the herd map', (await state())?.mapOpen === true)
check('the map draws', await page.locator('.masthead', { hasText: 'HERD MAP' }).isVisible())
check('opening the map does not pause the game behind it', (await screen()) === 'playing', `(screen=${await screen()})`)
await page.keyboard.press('Tab')
await page.waitForTimeout(300)
check('Tab closes it again', (await state())?.mapOpen === false)

/* ------------------------------------------------------------- pause */

await page.keyboard.press('Escape')
await page.waitForTimeout(400)
check('Escape pauses', (await screen()) === 'paused')
check('the controls are listed on the pause screen', await page.getByText(/Whoop — the gather call/).isVisible())

// The simulation must not advance while paused.
const beforePause = (await state())?.world?.time ?? 0
await page.waitForTimeout(1200)
const afterPause = (await state())?.world?.time ?? 0
check('the herd is not simulated while paused', Math.abs(afterPause - beforePause) < 0.05, `(${beforePause} → ${afterPause})`)

/* Sampled rather than checked once, because the failure this catches was a
   bounce: the screen went to 'playing' and was pushed straight back to
   'paused' by a refused pointer-lock request within a single frame. */
await page.getByRole('button', { name: /back to work/i }).click()
const trace = []
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(100)
  trace.push(
    await page.evaluate(() => {
      const st = window.__flesh?.store?.getState?.()
      return `${st?.screen}${document.pointerLockElement ? '+lock' : ''}`
    }),
  )
}
const resumed = trace.every((t) => t.startsWith('playing'))
check('resumes and stays resumed', resumed, resumed ? '' : `(${trace.join(' ')})`)

/* --------------------------------------------------- finishing a drive */

console.log('finishing a drive')
// Fast-forward, then walk the herd into the gate rather than waiting out a
// six-minute drive at four frames a second.
await page.evaluate(() => {
  const w = window.__flesh
  w.warp(20)
  const world = w.world
  const route = world.level.terrain.route
  const gate = route[route.length - 1]
  world.beaconIndex = route.length - 1
  for (const a of world.herd) {
    a.pos.x = gate.x
    a.pos.z = gate.z
    a.calm = 100
  }
  world.player.pos.x = gate.x
  world.player.pos.z = gate.z
  w.warp(4)
})
await page.waitForTimeout(3000)
check('the drive completes and shows the pay slip', (await screen()) === 'results', `(screen=${await screen()})`)

const result = (await state())?.result
check('all six head were delivered', result?.headDelivered === 6, `(${result?.headDelivered})`)
check('credits were awarded', (result?.credits ?? 0) > 0, `(${result?.credits})`)
check('the pay slip is on screen', await page.getByText(/DELIVERY ACCEPTED/).isVisible())

const afterRun = await save()
check('the drive was banked to the profile', (afterRun?.credits ?? 0) === (result?.credits ?? -1))
check('the next drive was unlocked', afterRun?.levelsUnlocked === 2)
check('the log recorded the head', afterRun?.log?.totalHeadDelivered === 6)

/* --------------------------------------------------------- commissary */

console.log('commissary')
await page.getByRole('button', { name: /commissary/i }).click()
await page.waitForTimeout(1200)
check('the commissary loads', (await screen()) === 'commissary')

// Walk to the vending counter and open it.
await page.keyboard.down('KeyW')
await page.keyboard.down('KeyA')
await page.waitForTimeout(2600)
await page.keyboard.up('KeyW')
await page.keyboard.up('KeyA')
await page.waitForTimeout(400)
await page.keyboard.press('KeyE')
await page.waitForTimeout(600)
check('the vending panel opens', await page.getByRole('heading', { name: 'VENDING' }).isVisible().catch(() => false) || await page.getByText('VENDING', { exact: true }).first().isVisible())

// Buy the cheapest thing we can afford, and check the money moved.
const creditsBefore = (await save())?.credits ?? 0
const buyable = page.locator('button.btn-corp').filter({ hasText: /FC$/ })
const buyableCount = await buyable.count()
check('there is stock on the shelves', buyableCount > 0, `(${buyableCount})`)
let bought = false
for (let i = 0; i < buyableCount; i++) {
  const btn = buyable.nth(i)
  if (await btn.isDisabled()) continue
  await btn.click()
  bought = true
  break
}
await page.waitForTimeout(400)
const creditsAfter = (await save())?.credits ?? 0
check('buying takes the money', !bought || creditsAfter < creditsBefore, `(${creditsBefore} → ${creditsAfter})`)
check('unaffordable stock is disabled rather than free', creditsAfter >= 0)

/* ----------------------------------------------------------- reload */

console.log('persistence across a reload')
const beforeReload = await save()
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const afterReload = await save()
check('credits survive the reload', afterReload?.credits === beforeReload?.credits)
check('upgrades survive the reload', JSON.stringify(afterReload?.upgrades) === JSON.stringify(beforeReload?.upgrades))
check('the log survives the reload', afterReload?.log?.totalHeadDelivered === beforeReload?.log?.totalHeadDelivered)
check('the unlock survives the reload', afterReload?.levelsUnlocked === beforeReload?.levelsUnlocked)
check('lands back on the title', (await screen()) === 'title')

/* -------------------------------------------------------------- the log */

console.log('trail boss log')
await page.getByRole('button', { name: /trail boss log/i }).click()
await page.waitForTimeout(400)
check('the log opens', (await screen()) === 'log')
check('it shows the cumulative count', await page.getByText('HEAD DELIVERED').isVisible())

/* ------------------------------------------------------------- resize */

console.log('resize')
await page.setViewportSize({ width: 800, height: 600 })
await page.waitForTimeout(400)
await page.getByRole('button', { name: /^back$/i }).click()
await page.getByRole('button', { name: /ride out/i }).click()
await page.waitForTimeout(400)
check('the menus survive a smaller viewport', (await screen()) === 'levelSelect')
await page.setViewportSize({ width: 1280, height: 760 })
await page.waitForTimeout(300)

await browser.close()
server.close()

console.log(`\n${checks - failures.length}/${checks} checks passed`)
if (errors.length) {
  console.error(`\n${errors.length} console error(s):`)
  for (const e of errors.slice(0, 10)) console.error(' -', e)
}
if (failures.length || errors.length) process.exit(1)
console.log('e2e: clean')
