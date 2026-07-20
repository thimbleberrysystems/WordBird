import { defineConfig } from '@playwright/test'

export default defineConfig({
  workers: 1,
  testMatch: '**/*.spec.ts',
  // Headless Electron UI timing (view switches, scroll settling) flakes
  // occasionally on a loaded machine. One retry keeps a flake from failing
  // the suite while a genuine break still fails twice. Serial-mode specs
  // retry as a group, which is why they declare that mode.
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  timeout: 30000
})
