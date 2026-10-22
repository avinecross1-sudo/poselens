import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const seedsDir = resolve(__dirname, '../../seeds')

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { main: resolve(__dirname, 'electron/main.ts') } },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { preload: resolve(__dirname, 'electron/preload.ts') } },
    },
  },
  renderer: {
    root: __dirname,
    resolve: { alias: { '@seeds': seedsDir } },
    server: { fs: { allow: [__dirname, seedsDir] } },
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(__dirname, 'index.html') },
    },
  },
})
