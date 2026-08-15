/**
 * Teaches the service worker the names of the files this build actually
 * produced. Without it the worker activates but has nothing cached, and the
 * game only works offline on the *second* visit — which is not good enough for
 * a tablet in the back of a car.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const swPath = join(dist, 'sw.js')

if (!existsSync(swPath)) {
  console.error('build-sw: dist/sw.js is missing — run `vite build` first.')
  process.exit(1)
}

const assets = readdirSync(join(dist, 'assets')).map((f) => `./assets/${f}`)
const extras = ['./', './index.html', './icon.svg', './manifest.webmanifest'].filter(
  (f) => f === './' || existsSync(join(dist, f.slice(2))),
)
const precache = [...extras, ...assets]

// Version the cache by content, so a new build replaces the old one exactly once.
const version = createHash('sha256')
  .update(precache.join('|') + readFileSync(join(dist, 'index.html')))
  .digest('hex')
  .slice(0, 10)

const source = readFileSync(swPath, 'utf8')
  .replace(/const CACHE = '[^']*'/, `const CACHE = 'grit-${version}'`)
  .replace(/const PRECACHE = \[[^\]]*\]/, `const PRECACHE = ${JSON.stringify(precache)}`)

if (!source.includes(`grit-${version}`) || !source.includes(assets[0] ?? './index.html')) {
  console.error('build-sw: could not inject the precache list — check public/sw.js.')
  process.exit(1)
}

writeFileSync(swPath, source)
console.log(`build-sw: precaching ${precache.length} files as grit-${version}`)
