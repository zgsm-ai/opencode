import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"
import { fileURLToPath } from "url"

/**
 * @type {import("vite").PluginOption}
 */
export default [
  {
    name: "opencode-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        worker: {
          format: "es",
        },
      }
    },
  },
  tailwindcss(),
  solidPlugin(),
  VitePWA({
    registerType: "autoUpdate",
    injectRegister: false,
    manifest: {
      name: "CoStrict Cloud",
      short_name: "CoStrict",
      description: "AI-powered development tool",
      theme_color: "#F8F7F7",
      background_color: "#F8F7F7",
      display: "standalone",
      start_url: "./m/workspace/",
      scope: "./",
      icons: [
        {
          src: "favicon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2,ttf}"],
      globIgnores: ["**/index.html"],
      navigateFallback: null,
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // allow landing page assets (~4.6 MB PNG/SVGs) to be precached
    },
  }),
]
