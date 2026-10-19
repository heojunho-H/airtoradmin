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
      '/api/projects': {
        target: 'https://airtor.co.kr',
        changeOrigin: true,
        rewrite: () => '/api/projects_api.php',
      },
      '/api/labor_rates': {
        target: 'https://airtor.co.kr',
        changeOrigin: true,
        rewrite: () => '/api/labor_rates_api.php',
      },
      '/api/file_download.php': {
        target: 'https://airtor.co.kr',
        changeOrigin: true,
      },
      // 스티비 뉴스레터 브로커는 Cloudflare Function(functions/api/newsletter.ts)에만 존재하므로
      // dev에서는 배포된 Pages Function으로 그대로 프록시한다 (API 키는 Function env에만 있음).
      // /api/newsletter/webhook도 같은 prefix로 함께 넘어간다.
      '/api/newsletter': {
        target: 'https://airtoradmin.pages.dev',
        changeOrigin: true,
      },
      // AI(Claude) 엔드포인트도 Cloudflare Function 에만 존재 — 기본은 배포된 운영 Function(운영 D1·API 키 사용).
      // 로컬 D1 로 시험하려면 `npm run functions:dev` 후 AI_FUNCTIONS_TARGET=http://127.0.0.1:8788 npm run dev
      '/api/assistant': {
        target: process.env.AI_FUNCTIONS_TARGET || 'https://airtoradmin.pages.dev',
        changeOrigin: true,
      },
      '/api/staffing': {
        target: process.env.AI_FUNCTIONS_TARGET || 'https://airtoradmin.pages.dev',
        changeOrigin: true,
      },
      // 견적서 입력 도우미·고객사 파일 (R2·D1) — 위와 같은 Function
      '/api/files': {
        target: process.env.AI_FUNCTIONS_TARGET || 'https://airtoradmin.pages.dev',
        changeOrigin: true,
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
