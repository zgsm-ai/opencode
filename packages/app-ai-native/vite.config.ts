import { defineConfig, loadEnv } from "vite"
import desktopPlugin from "./vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_")

  const cloudHost = env.VITE_CLOUD_SERVER_HOST ?? "127.0.0.1"
  const cloudPort = env.VITE_CLOUD_SERVER_PORT ?? "8080"
  const cloudTarget = `http://${cloudHost}:${cloudPort}`
  // const cloudTarget = `https://${cloudHost}`
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
      historyApiFallback: true,
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
          // rewrite: (path) => {
          //   return path.replace(new RegExp(`^${prefix}`), "/cloud-api")
          // },
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
          // secure: false,
          // rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ""),
          // rewrite: (path) => {
          //   return path.replace(new RegExp(`^${prefix}`), "/cloud-api")
          // },
        },
        [`${prefix}/ws`]: {
          target: cloudTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      target: "esnext",
      // sourcemap: true,
    },
  }
})
