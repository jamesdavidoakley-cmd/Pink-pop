/**
 * Boot straight into a level, play for a few seconds, and screenshot it.
 *
 * Reaching the Ash Plains honestly is about forty minutes of play. This makes
 * checking that its storm renders correctly a five-second job.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 4176
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

const level = Number(process.argv[2] ?? 0)
const out = process.argv[3] ?? '/tmp/level.png'
/** Seconds of simulation to fast-forward before the shot. */
const warpSeconds = Number(process.argv[4] ?? 60)

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(`http://localhost:${PORT}/`)
await page.evaluate(() =>
  localStorage.setItem(
    'flesh_save',
    JSON.stringify({
      version: 1,
      credits: 9000,
      difficulty: 'trailboss',
      levelsUnlocked: 6,
      upgrades: { netGun: true, sonicBoomer: true, drone: true, herdCalmer: true, stamina: 3, recharge: 3, bike: 3 },
      hat: 'trail',
      hatsOwned: ['trail'],
      muted: true,
      log: { totalHeadDelivered: 0, totalHeadLost: 0, totalCreditsEarned: 0, drivesCompleted: 0, levels: {} },
    }),
  ),
)
await page.goto(`http://localhost:${PORT}/?level=${level}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.getByRole('button', { name: /move them out/i }).click()
await page.waitForTimeout(1800)

/* Fast-forward the simulation rather than holding W. Software rendering runs
   at about four frames a second, and the fixed-step loop caps itself at four
   sub-steps a frame, so real-time input buys roughly a quarter of a second of
   game per second of waiting — every screenshot would otherwise be taken two
   seconds into the drive, before anything has spawned. */
const at = process.argv[5] ? Number(process.argv[5]) : null
const lateral = process.argv[7] ? Number(process.argv[7]) : 0
const warped = await page.evaluate(
  ({ s, at, lat }) => {
    const w = window.__flesh
    if (typeof w?.warp !== 'function') return 'no warp hook'
    w.warp(s)
    if (at !== null) w.place?.(at, lat)
    return `t=${w.world?.time?.toFixed(0)}s phase=${w.world?.phase}`
  },
  { s: warpSeconds, at, lat: lateral },
)
console.log('warp:', warped)
await page.waitForTimeout(900)

// Optional camera turn, in "mouse pixels". Pointer lock is held, so this is
// exactly what a player dragging the mouse would produce.
const turn = process.argv[6] ? Number(process.argv[6]) : 0
if (turn) {
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(640 + turn / 20, 380)
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(700)
}

await page.screenshot({ path: out })
const info = await page.evaluate(() => {
  const f = window.__flesh
  const w = f?.store?.getState?.().world
  return {
    calls: f?.gl?.info?.render?.calls ?? null,
    tris: f?.gl?.info?.render?.triangles ?? null,
    level: w?.level?.name ?? null,
    progress: w ? Math.round((w.player.pos.z / (w.level.terrain.route.at(-1).z || 1)) * 100) : null,
    predators: w?.predators?.length ?? null,
    screen: f?.store?.getState?.().screen ?? null,
    simTime: w ? Math.round(w.time) : null,
    playerZ: w ? Math.round(w.player.pos.z) : null,
    playerX: w ? Math.round(w.player.pos.x) : null,
    locked: document.pointerLockElement !== null,
  }
})
await browser.close()
server.close()
console.log(JSON.stringify(info))
if (errors.length) {
  console.error(errors.slice(0, 6).join('\n'))
  process.exit(1)
}
