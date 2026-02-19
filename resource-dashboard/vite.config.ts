import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // base is set via CLI flag for GitHub Pages builds
  // Default './' works for local dev and portable package
  base: process.env.GITHUB_ACTIONS ? '/resource-dashboard/' : './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          data: ['dexie', 'dexie-react-hooks', 'papaparse'],
        },
      },
    },
  },
})
