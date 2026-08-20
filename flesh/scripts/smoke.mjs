/**
 * Boot the built game in a real browser, drive it for a few seconds, and fail
 * on any console error or unhandled rejection.
 *
 * A build that typechecks and a build that runs are different claims. This
 * script is what lets the second one be made honestly.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 4173
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0]
    const path = join(ROOT, normalize(url === '/' ? '/index.html' : url))
    const body = await readFile(path)
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})
await new Promise((r) => server.listen(PORT, r))

const shotPath = process.argv[2]
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)

// Title → mission board → first drive → briefing → play.
await page.getByRole('button', { name: /ride out/i }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: /CARVER CITY GATES/i }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /move them out/i }).click()
await page.waitForTimeout(1500)

// Actually play for a bit: walk into the herd, whoop, goad, shoot.
for (const key of ['KeyW', 'KeyQ', 'KeyE']) {
  await page.keyboard.down(key)
  await page.waitForTimeout(600)
  await page.keyboard.up(key)
}
await page.mouse.down()
await page.waitForTimeout(400)
await page.mouse.up()
await page.keyboard.down('KeyW')
await page.waitForTimeout(2500)

/* ---------------------------------------------------------- frame rate */
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0
      const start = performance.now()
      const tick = () => {
        frames++
        if (performance.now() - start < 3000) requestAnimationFrame(tick)
        else resolve(Math.round((frames / (performance.now() - start)) * 1000))
      }
      requestAnimationFrame(tick)
    }),
)
await page.keyboard.up('KeyW')

const state = await page.evaluate(() => {
  const raw = localStorage.getItem('flesh_save')
  const f = window.__flesh
  return {
    save: raw ? JSON.parse(raw) : null,
    calls: f?.gl?.info?.render?.calls ?? null,
    triangles: f?.gl?.info?.render?.triangles ?? null,
    programs: f?.gl?.info?.programs?.length ?? null,
    geometries: f?.gl?.info?.memory?.geometries ?? null,
    textures: f?.gl?.info?.memory?.textures ?? null,
  }
})

if (shotPath) await page.screenshot({ path: shotPath })

// The herd map, and a second screenshot of it.
await page.keyboard.press('Tab')
await page.waitForTimeout(400)
if (shotPath) await page.screenshot({ path: shotPath.replace(/\.png$/, '-map.png') })
await page.keyboard.press('Tab')

await browser.close()
server.close()

console.log(`fps(swiftshader software rendering, not indicative): ${fps}`)
console.log(`draw calls: ${state.calls}  triangles: ${state.triangles}`)
console.log(`programs: ${state.programs}  geometries: ${state.geometries}  textures: ${state.textures}`)
if (errors.length) {
  console.error(`\n${errors.length} console error(s):`)
  for (const e of errors.slice(0, 12)) console.error(' -', e)
  process.exit(1)
}
console.log('smoke: clean')
