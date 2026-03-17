import { defineConfig, loadEnv } from "vite"
import desktopPlugin from "./vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const apiTarget = env.VITE_API_URL || "http://localhost:8080"
  const dev = mode === "development"

  return {
    base: dev ? "/" : "./", // dev: absolute for SPA fallback; prod: relative for sub-path deployment
    plugins: [desktopPlugin] as any,
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      port: 3000,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
      historyApiFallback: true,
    },
    build: {
      target: "esnext",
      // sourcemap: true,
    },
  }
})
