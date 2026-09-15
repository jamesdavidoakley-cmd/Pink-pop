// @ts-check
import { defineConfig } from 'astro/config';

// Static site: every route builds to <route>/index.html so it deploys to any
// host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, plain nginx).
export default defineConfig({
  site: 'https://maxsbrickclub.co.uk',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
