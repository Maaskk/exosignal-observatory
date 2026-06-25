import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/nasa-tap': {
        target: 'https://exoplanetarchive.ipac.caltech.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nasa-tap/, '')
      },
      '/mast-api': {
        target: 'https://mast.stsci.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mast-api/, '')
      }
    }
  }
})
