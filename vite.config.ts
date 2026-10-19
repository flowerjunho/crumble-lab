/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages(https://flowerjunho.github.io/crumble-lab/)는 저장소 이름이 하위 경로가 된다.
// 배포 워크플로가 BASE_PATH=/crumble-lab/ 을 넘기고, 로컬 개발은 루트(/)에서 그대로 돈다.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
