import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // Fonts are small; inlining them keeps the build a single self-contained folder
    // that works from file:// with no network at all.
    assetsInlineLimit: 64 * 1024,
  },
})
