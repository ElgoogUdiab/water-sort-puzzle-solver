import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    host: true,
    port: 3000,
    open: false,
    allowedHosts: 'all'
  },
  preview: {
    host: true,
    port: 3000,
    allowedHosts: 'all'
  }
})
