import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3000,
    proxy: {
      '/api/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: () => `/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      },
      '/api/deals': {
        target: 'https://airtor.co.kr',
        changeOrigin: true,
        rewrite: () => '/api/deals_api.php',
      },
      '/api/customers': {
        target: 'https://airtor.co.kr',
        changeOrigin: true,
        rewrite: () => '/api/customers_api.php',
      },
      '/api/managers': {
        target: 'https://airtor.co.kr',
        changeOrigin: true,
        rewrite: () => '/api/managers_api.php',
      },
      '/api/subcontractors': {
        target: 'https://airtor.co.kr',
        changeOrigin: true,
        rewrite: () => '/api/subcontractors_api.php',
      },
      '/api': {
        target: 'https://airtor.co.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/login/, '/api/login_api.php'),
      },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
