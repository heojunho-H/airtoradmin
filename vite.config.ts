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
      '/api': {
        target: 'https://airtor.co.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/login/, '/api/login_api.php'),
      },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
