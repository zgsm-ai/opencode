import { defineConfig } from "vite"
import desktopPlugin from "./vite"

export default defineConfig({
  base: './', // 使用相对路径，支持部署到任意子路径
  plugins: [desktopPlugin] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
  },
  build: {
    target: "esnext",
    // sourcemap: true,
  },
})
