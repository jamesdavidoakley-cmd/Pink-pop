import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const dir = process.argv[2]
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
const server = createServer((req, res) => {
  const path = join(dir, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]))
  if (!existsSync(path)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
  res.end(readFileSync(path))
})
await new Promise((r) => server.listen(5199, '127.0.0.1', r))

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport: { width: 1180, height: 720 } })
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
console.log('service worker active:', await p.evaluate(() => navigator.serviceWorker.controller !== null))

// Now take the network away entirely and reload.
server.close()
await new Promise((r) => setTimeout(r, 300))
const errs = []
p.on('pageerror', e => errs.push(String(e)))
await p.reload({ waitUntil: 'load' })
await p.waitForTimeout(1200)
const text = await p.locator('body').innerText()
console.log('server down, reloaded, booted:', text.includes('WHO IS DRIVING'))
console.log(errs.length ? 'ERRORS: ' + errs.join(', ') : 'no page errors')
await b.close()
