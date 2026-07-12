import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Live E2E config: real model over OpenRouter, real tool handlers, real
 * filesystem. Kept OUT of `pnpm test:unit` — run via `pnpm run test:live`
 * with OPENROUTER_KEY set (the suite self-skips without it).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/live/**/*.spec.ts'],
    globals: true,
    // Live models are slow and free tiers are rate-limited: one file at a
    // time, one test at a time, generous timeouts, one retry for flakes.
    fileParallelism: false,
    maxConcurrency: 1,
    sequence: { concurrent: false },
    testTimeout: 300_000,
    hookTimeout: 120_000,
    retry: 1
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      common: resolve(__dirname, 'src/common'),
      muya: resolve(__dirname, '../muyajs'),
      '@shared': resolve(__dirname, 'src/shared'),
      main_renderer: resolve(__dirname, 'src/main')
    },
    extensions: ['.mjs', '.ts', '.js', '.json']
  }
})
