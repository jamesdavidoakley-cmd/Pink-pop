/**
 * Folds the production build into one self-contained HTML page — no external
 * requests, no assets — so the game can be dropped anywhere as a single file.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const out = process.argv[3] ?? 'dist-single/shoot-the-day.html';
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const cssFile = html.match(/href="\.?\/?(assets\/[^"]+\.css)"/)?.[1];
const jsFile = html.match(/src="\.?\/?(assets\/[^"]+\.js)"/)?.[1];
if (!jsFile) throw new Error('no script found in the build');

const css = cssFile ? readFileSync(join(dist, cssFile), 'utf8') : '';
const js = readFileSync(join(dist, jsFile), 'utf8').replaceAll('</script', '<\\/script');

const page = `<title>Shoot The Day</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`${out} — ${(page.length / 1024).toFixed(0)} kB`);
