/**
 * Folds the built CSS and JS into index.html so the game is one file.
 *
 * Browsers refuse to fetch module scripts from file:// (CORS applies even to
 * local files), but an *inline* module runs with no fetch at all — so a
 * single-file build is what makes "double-click it on the tablet" work.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const assets = join(dist, 'assets')

const files = readdirSync(assets)
const js = files.find((f) => f.endsWith('.js'))
const css = files.find((f) => f.endsWith('.css'))
if (!js || !css) {
  console.error('build-single: run `npm run build` first.')
  process.exit(1)
}

// A literal </script> anywhere in the source would close the tag early.
const guard = (source) => source.replace(/<\/script>/gi, '<\\/script>')

let html = readFileSync(join(dist, 'index.html'), 'utf8')
  // The preload hint points at a file that is about to stop existing.
  .replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '')

const inline = (pattern, replacement, what) => {
  const next = html.replace(pattern, () => replacement)
  if (next === html) {
    console.error(`build-single: could not inline the ${what} — check dist/index.html.`)
    process.exit(1)
  }
  html = next
}

// A single file has nowhere to fetch a manifest or an icon from, so the icon
// is folded in as a data URI and the manifest link goes.
const icon = readFileSync(join(root, 'public', 'icon.svg'), 'utf8')
html = html
  .replace(/<link[^>]+rel="manifest"[^>]*>\s*/g, '')
  .replace(
    /<link[^>]+rel="(icon|apple-touch-icon)"[^>]*>/g,
    (tag) =>
      tag.replace(
        /href="[^"]*"/,
        `href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}"`,
      ),
  )

inline(
  new RegExp(`<link[^>]+href="[^"]*${css}"[^>]*>`),
  `<style>${readFileSync(join(assets, css), 'utf8')}</style>`,
  'stylesheet',
)
inline(
  new RegExp(`<script[^>]+src="[^"]*${js}"[^>]*></script>`),
  `<script type="module">${guard(readFileSync(join(assets, js), 'utf8'))}</script>`,
  'script',
)

const out = join(root, 'dist-single')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'grit.html'), html)

const kb = (n) => `${Math.round(n / 1024)} kB`
console.log(`build-single: dist-single/grit.html  ${kb(Buffer.byteLength(html))} (one file, opens from file://)`)
