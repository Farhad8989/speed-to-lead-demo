import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__',
  testMatch: '**/ui.test.ts',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
  },
});
