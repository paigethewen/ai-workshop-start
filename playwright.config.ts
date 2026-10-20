// The demo cases as deterministic Playwright tests: e2e/visual/. The same data (recorded GitHub answers),
// viewport, scale, theme, locale and time zone on every run, and in CI the same Linux container, fonts with it.
// Every run records each case's video. VISUAL_BASELINE=<dir>: each screenshot must match <dir>/<name>.png to
// the pixel. Without it, nothing is compared: the screenshots are written to screenshots/, a new baseline.
import { defineConfig } from '@playwright/test';

const baseline = process.env.VISUAL_BASELINE;
const port = 4183;
const size = { width: 1280, height: 800 };

export default defineConfig({
  testDir: 'e2e/visual',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  snapshotPathTemplate: `${baseline ?? 'screenshots'}/{arg}{ext}`,
  updateSnapshots: baseline ? 'none' : 'all',
  expect: { toHaveScreenshot: { maxDiffPixels: 0, threshold: 0, animations: 'disabled', caret: 'hide', scale: 'css' } },
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    browserName: 'chromium',
    viewport: size,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    video: { mode: 'on', size },
    launchOptions: { args: ['--font-render-hinting=none', '--disable-lcd-text'] },
  },
  webServer: {
    command: `node e2e/visual/server.ts --port ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
  },
});
