/** Screenshot the rig lab, for judging the procedural animals. */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = 4174
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

const which = process.argv[2] ?? 'herd'
const out = process.argv[3] ?? '/tmp/rig.png'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`http://localhost:${PORT}/?rig=${which}${process.argv[4] ? '&' + process.argv[4] : ''}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2600)
await page.screenshot({ path: out })
await browser.close()
server.close()
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('ok', out)
