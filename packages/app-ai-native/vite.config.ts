import { defineConfig, loadEnv } from "vite"
import desktopPlugin from "./vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_")
  // const host = env.VITE_OPENCODE_SERVER_HOST ?? "localhost"
  // const port = env.VITE_OPENCODE_SERVER_PORT ?? "8080"
  // const target = `http://${host}:${port}`

  const cloudHost = env.VITE_CLOUD_SERVER_HOST ?? "localhost"
  const cloudPort = env.VITE_CLOUD_SERVER_PORT ?? "18080"
  const cloudTarget = `http://${cloudHost}:${cloudPort}`
  const appPort = parseInt(env.VITE_APP_PORT ?? "3000")
  const prefix = env.VITE_API_PREFIX ?? ""
  const basePath = env.VITE_BASE_PATH ?? "/"

  return {
    base: basePath,
    plugins: [desktopPlugin] as any,
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      port: appPort,
      proxy: {
        // "/cloud/device": {
        //   target: cloudTarget,
        //   changeOrigin: true,
        //   ws: true,
        // },
        [`${prefix}/cloud`]: {
          target: cloudTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (proxyReq.path.endsWith("/global/event")) {
                proxyReq.setHeader("Connection", "keep-alive")
              }
            })
          },
        },
        [`${prefix}/api`]: {
          target: cloudTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ""),
        },
      },
    },
    build: {
      target: "esnext",
      // sourcemap: true,
    },
  }
})
