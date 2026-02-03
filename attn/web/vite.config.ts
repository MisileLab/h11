import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // TanStackRouterVite() // Optional: for file-based routing generation if using that features
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://api:8000',
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''), // Assuming API endpoints are prefixed with /api on backend too based on prompt
      },
    },
  },
})
