import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const fixedChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 180_000,
  retries: 1,
  workers: 1, // one WebGL game at a time — parallel runs starve the renderer
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 720 },
    launchOptions: existsSync(fixedChromium) ? { executablePath: fixedChromium } : {},
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
