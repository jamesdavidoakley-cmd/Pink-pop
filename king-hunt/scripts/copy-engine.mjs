// Copies the Stockfish lite single-threaded build into public/engine so the
// browser can load it as a Web Worker without cross-origin-isolation headers.
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const src = join('node_modules', 'stockfish', 'src');
const out = join('public', 'engine');
mkdirSync(out, { recursive: true });

const files = readdirSync(src).filter((f) => /lite-single-[0-9a-f]+\.(js|wasm)$/.test(f));
if (files.length !== 2) {
  console.error('Expected the lite-single js + wasm pair in', src, 'found', files);
  process.exit(1);
}
for (const f of files) {
  const ext = f.endsWith('.js') ? 'js' : 'wasm';
  copyFileSync(join(src, f), join(out, `stockfish.${ext}`));
}
// The js locates its wasm by its own hashed name; write a tiny shim worker that
// rewrites the lookup so both files can live under stable names.
const jsName = files.find((f) => f.endsWith('.js'));
const wasmName = files.find((f) => f.endsWith('.wasm'));
console.log(`engine: ${jsName} + ${wasmName} -> public/engine/stockfish.{js,wasm}`);
if (!existsSync(join(out, 'stockfish.wasm'))) process.exit(1);
