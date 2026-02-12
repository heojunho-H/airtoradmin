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
        rewrite: () => '/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyCKTbNqc4Z5pvjLhZhLRlFwp80k3VB38Zk',
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
