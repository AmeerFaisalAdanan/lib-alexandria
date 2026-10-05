import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Runs against a live stack started with docker compose (dev auth + fixture catalogue).
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    ...devices['Desktop Chrome'],
    // A fake webcam that films the barcode clip made in global-setup, so the live-scan path runs for real.
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${path.join(__dirname, '.fixtures', 'barcode.mjpeg')}`,
      ],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
