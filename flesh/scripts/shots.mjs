/** Capture each screen of the game for a visual check. */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 4175
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

const dir = process.argv[2] ?? '/tmp'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

// A profile part-way through, so the later screens have something to show.
await page.goto(`http://localhost:${PORT}/`)
await page.evaluate(() => {
  localStorage.setItem(
    'flesh_save',
    JSON.stringify({
      version: 1,
      credits: 4200,
      difficulty: 'trailboss',
      levelsUnlocked: 6,
      upgrades: { netGun: true, sonicBoomer: false, drone: true, herdCalmer: false, stamina: 2, recharge: 1, bike: 1 },
      hat: 'ranger',
      hatsOwned: ['trail', 'stetson', 'ranger'],
      muted: true,
      log: {
        totalHeadDelivered: 41,
        totalHeadLost: 7,
        totalCreditsEarned: 8150,
        drivesCompleted: 4,
        levels: {
          'carver-gates': { bestCredits: 1400, bestHead: 6, bestTime: 188, completed: true, attempts: 2 },
          'fern-flats': { bestCredits: 1900, bestHead: 12, bestTime: 296, completed: true, attempts: 3 },
          'bone-gulch': { bestCredits: 1500, bestHead: 9, bestTime: 401, completed: true, attempts: 4 },
          'tar-shallows': { bestCredits: 1550, bestHead: 9, bestTime: 462, completed: true, attempts: 1 },
        },
      },
    }),
  )
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const shot = async (name) => {
  await page.screenshot({ path: `${dir}/screen-${name}.png` })
  console.log('captured', name)
}

await shot('title')
await page.getByRole('button', { name: /ride out/i }).click()
await page.waitForTimeout(400)
await shot('levels')

await page.getByRole('button', { name: /trans-time commissary/i }).count().catch(() => 0)
await page.getByRole('button', { name: /commissary/i }).first().click()
await page.waitForTimeout(1200)
await shot('commissary-room')
// Walk to the vending counter and open it.
await page.keyboard.down('KeyW')
await page.keyboard.down('KeyA')
await page.waitForTimeout(2600)
await page.keyboard.up('KeyW')
await page.keyboard.up('KeyA')
await page.waitForTimeout(400)
await page.keyboard.press('KeyE')
await page.waitForTimeout(500)
await shot('commissary-vending')
await page.keyboard.press('Escape').catch(() => {})
await page.getByRole('button', { name: /^close$/i }).click().catch(() => {})
await page.waitForTimeout(300)

await page.getByRole('button', { name: /mission board/i }).first().click()
await page.waitForTimeout(500)
// Bone Gulch.
await page.getByRole('button', { name: /BONE GULCH/i }).click()
await page.waitForTimeout(600)
await shot('briefing')
await page.getByRole('button', { name: /move them out/i }).click()
await page.waitForTimeout(2500)
await page.keyboard.down('KeyW')
await page.waitForTimeout(6000)
await page.keyboard.up('KeyW')
await shot('bone-gulch')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await shot('pause')

// The pay slip and the log. Reaching these honestly means completing a whole
// drive, so they are driven through the store instead.
await page.evaluate(() => {
  const store = window.__flesh?.store
  if (!store) return
  store.setState({
    screen: 'results',
    result: {
      levelId: 'bone-gulch',
      levelIndex: 2,
      levelName: 'BONE GULCH',
      passed: true,
      headDelivered: 9,
      headStart: 12,
      headLost: 3,
      headPrime: 8,
      stragglersLost: 0,
      shotsFired: 0,
      time: 401,
      credits: 1550,
      par: 480,
    },
  })
})
await page.waitForTimeout(600)
await shot('results')

await page.evaluate(() => window.__flesh?.store?.setState({ screen: 'log' }))
await page.waitForTimeout(500)
await shot('log')

await browser.close()
server.close()
if (errors.length) {
  console.error(errors.slice(0, 8).join('\n'))
  process.exit(1)
}
console.log('shots: clean')
