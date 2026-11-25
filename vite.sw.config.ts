import { defineConfig } from 'vite'

// Builds the service worker on its own, as one plain script at dist/sw.js, after the app build.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: 'src/sw/sw.ts', formats: ['iife'], name: 'msrServiceWorker', fileName: () => 'sw.js' },
  },
})
