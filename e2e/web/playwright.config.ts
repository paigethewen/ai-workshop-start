// The web tests: the demo cases, driven in Chromium as a person would, each recorded as a video and checked
// at its key moments against a screenshot taken on Linux, in the image of the Dockerfile. One pixel off fails.
// Run them with `npm run e2e`, which runs this inside that image.
import { defineConfig } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
  // The baselines, one per key moment; the accept-screenshots label replaces them, nobody else.
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  updateSnapshots: 'none',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }], ['json', { outputFile: '../../playwright-report/results.json' }]],
  expect: {
    toHaveScreenshot: { maxDiffPixels: 0, threshold: 0, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    browserName: 'chromium',
    // One way to draw a pixel: in software, without the CPU's own Skia paths (runners differ), in sRGB, no LCD text.
    launchOptions: {
      args: ['--disable-gpu', '--disable-gpu-rasterization', '--disable-skia-runtime-opts', '--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'],
    },
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    trace: 'retain-on-failure',
  },
  webServer: { command: `node e2e/web/serve.ts ${PORT}`, cwd: '../..', url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: false },
});
