/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages(https://flowerjunho.github.io/crumble-lab/)는 저장소 이름이 하위 경로가 된다.
// 배포 워크플로가 BASE_PATH=/crumble-lab/ 을 넘기고, 로컬 개발은 루트(/)에서 그대로 돈다.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: {
    // 데이터 JSON 주소에 붙여서, 배포 직후에도 브라우저 캐시(GitHub Pages max-age=600)의 예전 파일을 쓰지 않게 한다.
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 12) ?? String(Date.now())),
  },
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
