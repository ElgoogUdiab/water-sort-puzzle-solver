import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    host: true,
    port: 3000,
    open: false,
    allowedHosts: ['water-sort-puzzle-solver.elgoogudiab.com']
  },
  preview: {
    host: true,
    port: 3000,
    allowedHosts: ['water-sort-puzzle-solver.elgoogudiab.com']
  }
})
