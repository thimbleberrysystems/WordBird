import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  // SFC support so specs can mount real components (renderer-mount-smoke).
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['test/unit/specs/**/*.spec.ts'],
    globals: true
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
