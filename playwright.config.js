import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } },
  projects: [
    { name: 'New York', use: { timezoneId: 'America/New_York' } },
    { name: 'Tokyo', use: { timezoneId: 'Asia/Tokyo' } },
  ],
});
