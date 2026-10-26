import { defineConfig } from 'vitest/config'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // 같은 origin 을 흉내 낸다. 세션 쿠키와 XSRF-TOKEN 쿠키가 5173 origin 에 붙는다.
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      // Google OIDC 시작과 콜백도 API 서버가 처리한다. 콜백 주소가 5173 이 되도록 Host 를 바꾸지 않는다.
      '/oauth2': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/login/oauth2': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      // 원격 MCP 와 OAuth 인가 서버. 메타데이터의 주소가 5173 origin 이 되도록 Host 를 바꾸지 않는다. '/oauth/' 는 '/oauth2' 와 겹치지 않게 끝에 '/' 를 둔다.
      '/oauth/': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/.well-known': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/mcp': { target: 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
  // 화면 테스트(playwright.config.ts)가 빌드 결과를 이 preview 서버로 띄운다.
  // 운영 API 가 주는 CSP 를 그대로 걸어 Cytoscape 가 넣는 <style> 이 막히는 것까지 운영과 같게 한다.
  // 값은 api 의 SecurityConfig.securityHeaders 와 같아야 한다.
  preview: {
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
        "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // cytoscape 가 300kB 남짓이라 기본 경고 기준(500kB)을 넘는다. 사내 도구라 한 덩어리로 둔다.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
})
