/**
 * Fold the production build into a single self-contained page fragment.
 *
 * Claude Artifacts serve from a strict CSP that blocks every external host, and
 * they wrap what you give them in their own document — so what is wanted here is
 * not `dist/index.html` but its *contents*, with the stylesheet and the module
 * inlined rather than linked.
 *
 * The game is already asset-free: every dinosaur, plant, building and texture is
 * built from primitives or drawn to a canvas at load time, so there is nothing
 * else to embed.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const html = await readFile(join(DIST, 'index.html'), 'utf8')

const cssHref = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1]
const jsSrc = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
if (!cssHref || !jsSrc) throw new Error('could not find the built css/js in dist/index.html')

const css = await readFile(join(DIST, cssHref.replace(/^\.?\//, '')), 'utf8')
const js = await readFile(join(DIST, jsSrc.replace(/^\.?\//, '')), 'utf8')

/** A `</script>` inside a string literal would close the inline block early. */
const safe = (code) => code.replace(/<\/script/gi, '<\\/script')

const page = `<title>Flesh: The Long Drive</title>
<meta name="description" content="Herd ten-tonne dinosaurs across the Cretaceous for the Trans-Time Corporation." />
<style>
${css}
/* The host document supplies the outer frame, so the game claims all of it. */
html, body { height: 100%; margin: 0; overflow: hidden; background: #0b0705; }
#root { position: fixed; inset: 0; }
</style>
<div id="root"></div>
<script type="module">
${safe(js)}
</script>
`

const out = join(DIST, 'artifact.html')
await writeFile(out, page, 'utf8')
console.log(`${out}  ${(Buffer.byteLength(page) / 1024 / 1024).toFixed(2)} MB`)
