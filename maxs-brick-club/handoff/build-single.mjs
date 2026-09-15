// Builds a flat (file-format) copy of the site into handoff/.preview and bundles it into handoff/maxs-brick-club.html
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const preview = path.join(here, '.preview');
const cfg = path.join(root, 'astro.preview.mjs');
writeFileSync(cfg, `import { defineConfig } from 'astro/config';\nexport default defineConfig({ site: 'https://maxsbrickclub.co.uk', output: 'static', trailingSlash: 'never', build: { format: 'file' } });\n`);
try {
  rmSync(preview, { recursive: true, force: true }); mkdirSync(preview, { recursive: true });
  execSync(`npx astro build --config astro.preview.mjs --outDir "${preview}"`, { cwd: root, stdio: 'inherit' });
  execSync(`python3 bundle-single.py`, { cwd: here, stdio: 'inherit' });
} finally {
  rmSync(cfg, { force: true });
  rmSync(preview, { recursive: true, force: true });
}
