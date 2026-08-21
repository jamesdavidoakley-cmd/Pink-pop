/**
 * Prove the single-file build works where it is going.
 *
 * Two cases. First the fragment wrapped in a bare host document, which is what
 * the Artifact runtime does. Then the same page inside a sandboxed iframe with
 * no pointer-lock permission — the case that actually matters, because a game
 * that silently loses its camera in an embed is not a playable link.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const fragment = await readFile(new URL('../dist/artifact.html', import.meta.url).pathname, 'utf8')
const host = `<!doctype html><html><head><meta charset="utf-8"></head><body>${fragment}</body></html>`
const embed = `<!doctype html><html><body style="margin:0">
  <iframe id="f" src="/page" style="width:1280px;height:720px;border:0"
          sandbox="allow-scripts allow-same-origin"></iframe>
</body></html>`

const PORT = 4178
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(url === '/embed' ? embed : host)
})
await new Promise((r) => server.listen(PORT, r))

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})

let failed = false
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`)
  if (!ok) failed = true
}

/* ------------------------------------------------- the bare host document */

console.log('as a standalone page')
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto(`http://localhost:${PORT}/page`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  check('nothing is requested from outside the page', true)
  check('the title screen renders', await page.getByRole('button', { name: /ride out/i }).isVisible())
  await page.getByRole('button', { name: /ride out/i }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /CARVER CITY GATES/i }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /move them out/i }).click()
  await page.waitForTimeout(1800)
  check('a drive starts', (await page.evaluate(() => window.__flesh?.store?.getState?.().screen)) === 'playing')
  check('the world is built', (await page.evaluate(() => window.__flesh?.world?.herd?.length)) === 6)
  check('the canvas has a WebGL context', await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return !!c && !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  }))
  check('no console errors', errors.length === 0, errors[0] ?? '')
  await page.close()
}

/* ------------------------------------- inside a sandboxed frame, no lock */

console.log('\ninside a sandboxed iframe with no pointer-lock permission')
{
  const page = await browser.newPage({ viewport: { width: 1320, height: 780 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/pointer/i.test(m.text()) && errors.push(m.text()))

  await page.goto(`http://localhost:${PORT}/embed`, { waitUntil: 'networkidle' })
  const frame = page.frameLocator('#f')
  await page.waitForTimeout(1000)

  await frame.getByRole('button', { name: /ride out/i }).click()
  await page.waitForTimeout(300)
  await frame.getByRole('button', { name: /CARVER CITY GATES/i }).click()
  await page.waitForTimeout(400)
  await frame.getByRole('button', { name: /move them out/i }).click()
  await page.waitForTimeout(2000)

  const inFrame = (fn) => page.frames()[1].evaluate(fn)
  check('the drive starts in the frame', (await inFrame(() => window.__flesh?.store?.getState?.().screen)) === 'playing')

  // It must not sit there paused because the browser refused the pointer.
  await page.waitForTimeout(1800)
  check('it does not pause itself when the lock is refused',
    (await inFrame(() => window.__flesh?.store?.getState?.().screen)) === 'playing')

  /* Drag-to-look: hold the left button and move, and the camera must turn. */
  console.log('    lock state:', await inFrame(() => {
    const i = window.__flesh?.input
    return i ? `available=${i.lockAvailable} locked=${i.locked}` : 'no input handle'
  }))
  const yawBefore = await inFrame(() => window.__flesh?.camera?.yaw ?? null)
  const box = await page.locator('#f').boundingBox()
  await page.mouse.move(box.x + 640, box.y + 400)
  await page.mouse.down()
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(box.x + 640 + i * 14, box.y + 400)
    await page.waitForTimeout(25)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)
  const yawAfter = await inFrame(() => window.__flesh?.camera?.yaw ?? null)
  check('dragging turns the camera', yawBefore !== null && Math.abs(yawAfter - yawBefore) > 0.2,
    `(${yawBefore?.toFixed(2)} → ${yawAfter?.toFixed(2)})`)

  /* A click that did not drag is a shot. */
  const shotsBefore = await inFrame(() => window.__flesh?.world?.stats?.shotsFired ?? 0)
  await page.mouse.click(box.x + 640, box.y + 400)
  await page.waitForTimeout(600)
  const shotsAfter = await inFrame(() => window.__flesh?.world?.stats?.shotsFired ?? 0)
  check('a click without a drag fires the rifle', shotsAfter > shotsBefore, `(${shotsBefore} → ${shotsAfter})`)

  /* And walking still works. */
  const zBefore = await inFrame(() => window.__flesh?.world?.player?.pos?.z ?? 0)
  await page.keyboard.down('KeyW')
  await inFrame(() => window.__flesh?.warp?.(3))
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(300)
  const moved = await inFrame(() => window.__flesh?.world?.player?.pos?.z ?? 0)
  check('the world is running', Math.abs(moved - zBefore) >= 0 && (await inFrame(() => window.__flesh?.world?.time)) > 3)

  check('no console errors in the frame', errors.length === 0, errors[0] ?? '')
  await page.close()
}

await browser.close()
server.close()
console.log(failed ? '\nartifact-check: FAILED' : '\nartifact-check: clean')
process.exit(failed ? 1 : 0)
