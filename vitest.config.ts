import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // tests/smoke is Playwright's turf (npm run test:smoke)
    exclude: ['**/node_modules/**', 'tests/smoke/**'],
  },
});
