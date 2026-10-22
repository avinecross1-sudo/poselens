import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@seeds': resolve(__dirname, '../../seeds') } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
