// Turns dist/index.html into dist/artifact.html: the same page without the document
// skeleton, for hosts that wrap the page themselves (claude.ai artifacts).
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
const body = /<body>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';
const keep = head
  .split('\n')
  .filter((l) => /<title>|<link|<script/.test(l))
  .map((l) => l.trim())
  .join('\n');
const out = `${keep}\n<style>html,body{height:100%;margin:0;background:#0b1020;color-scheme:dark}</style>\n${body.trim()}\n`;
writeFileSync('dist/artifact.html', out);
console.log(out);
