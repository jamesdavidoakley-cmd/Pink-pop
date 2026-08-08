import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  // Content lives outside /src on purpose (designers only touch /content).
  // import.meta.glob pulls it in; nothing else needs configuring.
});
