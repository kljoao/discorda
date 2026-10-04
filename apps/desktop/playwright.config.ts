import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 30_000, workers: 1, retries: 1,
  use:{trace:'retain-on-failure'},reporter: 'list', outputDir: 'test-results',
});
