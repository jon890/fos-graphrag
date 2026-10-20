import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // 같은 origin 을 흉내 낸다. 세션 쿠키와 XSRF-TOKEN 쿠키가 5173 origin 에 붙는다.
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // cytoscape 가 300kB 남짓이라 기본 경고 기준(500kB)을 넘는다. 사내 도구라 한 덩어리로 둔다.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
})
